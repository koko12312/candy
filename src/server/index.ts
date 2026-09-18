import express, { Express, Request, Response } from 'express';
import http, { Server as HTTPServer } from 'http';
import path from 'path';
import cors from 'cors';
import { SocketServer } from './SocketServer';
import { RoomManager } from './RoomManager';

export interface AppServer {
  app: Express;
  httpServer: HTTPServer;
  socketServer: SocketServer;
  roomManager: RoomManager;
  start: (port?: number) => Promise<number>;
  stop: () => Promise<void>;
}

export function createServer(): AppServer {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  const roomManager = new RoomManager();
  const socketServer = new SocketServer(httpServer, roomManager);

  // Health endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      activeRooms: roomManager.roomCount
    });
  });

  // Public rooms query
  app.get('/api/rooms', (req: Request, res: Response) => {
    const publicRooms = roomManager.findPublicRooms().map((r) => r.toDTO());
    res.json({ rooms: publicRooms });
  });

  // Serve static assets from client dist or root if present
  const staticPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(staticPath));

  // SPA fallback for client-side routing
  app.get('*', (req: Request, res: Response) => {
    const indexPath = path.resolve(staticPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(200).send('<!DOCTYPE html><html><head><title>Match Pop Multiplayer</title></head><body><div id="app"></div></body></html>');
      }
    });
  });

  const start = (port?: number): Promise<number> => {
    const targetPort = port !== undefined
      ? port
      : (process.env.PORT !== undefined ? Number(process.env.PORT) : 3000);
    return new Promise((resolve) => {
      httpServer.listen(targetPort, () => {
        const addr = httpServer.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : targetPort;
        console.log(`[Match Pop Server] Listening on http://localhost:${actualPort}`);
        resolve(actualPort);
      });
    });
  };

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      socketServer.close().finally(() => {
        if (httpServer.listening) {
          httpServer.close(() => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  };

  return {
    app,
    httpServer,
    socketServer,
    roomManager,
    start,
    stop
  };
}

// Auto-start if executed directly as main script
if (process.argv[1] && (process.argv[1].endsWith('server/index.ts') || process.argv[1].endsWith('server/index.js'))) {
  const server = createServer();
  server.start();
}
