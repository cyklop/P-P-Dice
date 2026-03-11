/**
 * Passenger Entry Point for PP Dice (Next.js + Socket.IO)
 *
 * Startup Sequence:
 * 1. Register module-alias mappings (@/ -> dist/src/)
 * 2. Load environment variables
 * 3. Import compiled server
 * 4. Start HTTP server for Passenger
 */

// ============================================================================
// STEP 1: Register Module Aliases (MUST be first)
// ============================================================================
const moduleAlias = require('module-alias');
const path = require('path');

moduleAlias.addAlias('@', path.join(__dirname, 'dist', 'src'));

// ============================================================================
// STEP 2: Load Environment Variables
// ============================================================================
const fs = require('fs');

function findEnvFile(startPath) {
  let currentPath = startPath;
  const rootPath = path.parse(currentPath).root;

  while (currentPath !== rootPath) {
    const envLocalPath = path.join(currentPath, '.env.local');
    if (fs.existsSync(envLocalPath)) return envLocalPath;

    const envPath = path.join(currentPath, '.env');
    if (fs.existsSync(envPath)) return envPath;

    currentPath = path.dirname(currentPath);
  }
  return null;
}

const envPath = findEnvFile(__dirname);
if (envPath) {
  require('dotenv').config({ path: envPath });
  console.log(`[Passenger] Loaded environment from: ${envPath}`);
} else {
  console.warn('[Passenger] Warning: No .env file found, using system environment');
}

// Force production mode
process.env.NODE_ENV = 'production';

// ============================================================================
// STEP 3: Import Compiled Server & Start
// ============================================================================
const server = require('./dist/server.js');

async function startPassengerServer() {
  try {
    console.log('[Passenger] Initializing PP Dice server...');

    if (typeof server.initializeServer !== 'function') {
      throw new Error('initializeServer function not found in dist/server.js');
    }

    const { httpServer, io } = await server.initializeServer();

    const port = process.env.PORT || 3000;
    console.log(`[Passenger] Starting on port ${port}...`);

    httpServer.listen(port, () => {
      console.log(`[Passenger] PP Dice server listening on port ${port}`);
    });

    httpServer.on('error', (error) => {
      console.error('[Passenger] Server error:', error);
    });

    return httpServer;
  } catch (error) {
    console.error('[Passenger] Failed to initialize server:', error);
    process.exit(1);
  }
}

startPassengerServer().catch((error) => {
  console.error('[Passenger] Fatal error:', error);
  process.exit(1);
});

console.log('[Passenger] Entry point initialized');
console.log(`[Passenger] Node.js version: ${process.version}`);
console.log(`[Passenger] Working directory: ${process.cwd()}`);
