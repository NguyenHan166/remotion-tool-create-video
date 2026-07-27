import { parseWorkerServerEnvironment } from '@hansys/shared/environment';

export const workerServerEnvironment = parseWorkerServerEnvironment(process.env);
