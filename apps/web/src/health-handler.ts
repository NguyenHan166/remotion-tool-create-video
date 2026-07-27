import { type HealthResult } from './health.js';

export type GetHealth = () => Promise<HealthResult>;

export function createHealthHandler(getHealth: GetHealth): () => Promise<Response> {
  return async () => {
    const result = await getHealth();

    return Response.json(result.body, {
      status: result.statusCode,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  };
}
