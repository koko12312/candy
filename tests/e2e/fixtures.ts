import { test as base, expect } from '@playwright/test';
import { createServer, AppServer } from '../../src/server/index';

export type ServerFixture = {
  appServer: AppServer;
  serverUrl: string;
};

export const test = base.extend<{}, ServerFixture>({
  // Worker-scoped fixture boots Express + Socket.io on an ephemeral port once per worker process
  appServer: [
    async ({}, use) => {
      const server = createServer();
      const port = await server.start(0); // Binds to random available OS port (e.g. 50885)
      (server as any).__port = port;
      await use(server);
      await server.stop();
    },
    { scope: 'worker', auto: true }
  ],

  serverUrl: [
    async ({ appServer }, use) => {
      const port = (appServer as any).__port;
      await use(`http://localhost:${port}`);
    },
    { scope: 'worker' }
  ]
});

export { expect };
