import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { type ReadableStream as NodeReadableStream } from 'node:stream/web';
import {
  InvalidByteRangeError,
  StoredAssetFileNotFoundError,
  createStoredAssetStream,
  type StoragePaths,
} from '@hansys/storage';

export type WorkerServedAsset = {
  id: string;
  relativePath: string;
  mimeType: string;
};

export type WorkerAssetScope = {
  sourceUrl(assetId: string): string;
  close(): Promise<void>;
};

function sendEmpty(response: ServerResponse, statusCode: number): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Length', '0');
  response.end();
}

function getRangeHeader(request: IncomingMessage): string | undefined {
  const range = request.headers.range;
  return Array.isArray(range) ? range[0] : range;
}

export class WorkerAssetServer {
  readonly #storagePaths: StoragePaths;
  readonly #activeScopes = new Set<() => Promise<void>>();

  constructor(storagePaths: StoragePaths) {
    this.#storagePaths = storagePaths;
  }

  async createScope(assets: readonly WorkerServedAsset[]): Promise<WorkerAssetScope> {
    const assetsById = new Map<string, WorkerServedAsset>();

    for (const asset of assets) {
      if (assetsById.has(asset.id)) {
        throw new Error(`Duplicate worker asset scope entry: ${asset.id}`);
      }

      assetsById.set(asset.id, asset);
    }

    const token = randomUUID();
    const server = createServer((request, response) => {
      void this.#handleRequest(request, response, token, assetsById).catch(() => {
        if (!response.headersSent) {
          sendEmpty(response, 500);
        } else {
          response.destroy();
        }
      });
    });

    await new Promise<void>((resolveListen, rejectListen) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        rejectListen(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolveListen();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(0, '127.0.0.1');
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/${token}/assets`;
    let closePromise: Promise<void> | null = null;
    const close = () => {
      closePromise ??= new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error === undefined) {
            resolveClose();
          } else {
            rejectClose(error);
          }
        });
        server.closeIdleConnections();
      }).finally(() => this.#activeScopes.delete(close));

      return closePromise;
    };
    this.#activeScopes.add(close);

    return {
      sourceUrl: (assetId) => {
        if (!assetsById.has(assetId)) {
          throw new RangeError(`Asset ${assetId} is not approved for this render scope.`);
        }

        return `${baseUrl}/${encodeURIComponent(assetId)}`;
      },
      close,
    };
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.#activeScopes].map((close) => close()));
  }

  async #handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
    assetsById: ReadonlyMap<string, WorkerServedAsset>,
  ): Promise<void> {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Accept-Ranges', 'bytes');

    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Range');
      sendEmpty(response, 204);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendEmpty(response, 405);
      return;
    }

    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathComponents = requestUrl.pathname.split('/').filter(Boolean);

    if (
      pathComponents.length !== 3 ||
      pathComponents[0] !== token ||
      pathComponents[1] !== 'assets'
    ) {
      sendEmpty(response, 404);
      return;
    }

    let assetId: string;

    try {
      assetId = decodeURIComponent(pathComponents[2]!);
    } catch {
      sendEmpty(response, 404);
      return;
    }

    const asset = assetsById.get(assetId);

    if (asset === undefined) {
      sendEmpty(response, 404);
      return;
    }

    try {
      const stream = await createStoredAssetStream(
        this.#storagePaths,
        asset.relativePath,
        getRangeHeader(request),
      );
      const contentLength =
        stream.range === null ? stream.fileSize : stream.range.end - stream.range.start + 1;
      response.statusCode = stream.range === null ? 200 : 206;
      response.setHeader('Content-Type', asset.mimeType);
      response.setHeader('Content-Length', String(contentLength));

      if (stream.range !== null) {
        response.setHeader(
          'Content-Range',
          `bytes ${stream.range.start}-${stream.range.end}/${stream.fileSize}`,
        );
      }

      if (request.method === 'HEAD') {
        await stream.body.cancel();
        response.end();
        return;
      }

      const nodeStream = Readable.fromWeb(stream.body as NodeReadableStream<Uint8Array>);
      nodeStream.on('error', () => response.destroy());
      nodeStream.pipe(response);
    } catch (error) {
      if (error instanceof InvalidByteRangeError) {
        response.setHeader('Content-Range', `bytes */${error.fileSize}`);
        sendEmpty(response, 416);
        return;
      }

      if (error instanceof StoredAssetFileNotFoundError) {
        sendEmpty(response, 404);
        return;
      }

      throw error;
    }
  }
}
