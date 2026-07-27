import { parseClientEnvironment, parseWebServerEnvironment } from '@hansys/shared/environment';

export const webServerEnvironment = parseWebServerEnvironment(process.env);

export const clientEnvironment = parseClientEnvironment({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
