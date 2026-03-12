import { createServer } from 'http';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from './src/lib/types';
import { createSocketHandler } from './src/server/socket-handler';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

/**
 * Initialize the server (Next.js + Socket.IO).
 * Returns { httpServer, io } for Passenger integration.
 */
export async function initializeServer() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: dev ? '*' : undefined,
      },
    }
  );

  createSocketHandler(io);

  return { httpServer, io };
}

// Direct execution (dev mode or standalone start)
if (require.main === module || !module.parent) {
  initializeServer().then(({ httpServer }) => {
    httpServer.listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Socket.io server running`);
      console.log(`> Environment: ${dev ? 'development' : 'production'}`);
    });
  });
}
