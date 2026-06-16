const http = require('http');
const express = require('express');
const { setupWebSocket, shutdown: shutdownWs } = require('./websocket');
const roomManager = require('./roomManager');
const config = require('./config');
const logger = require('./logger');

const app = express();

app.get('/health', (_req, res) => {
  const stats = roomManager.getStats();
  res.json({
    status: 'ok',
    rooms: stats.totalRooms,
    connections: stats.totalConnections,
  });
});

const server = http.createServer(app);
const wss = setupWebSocket(server);

server.listen(config.port, () => {
  logger.info(`PcSpeak backend listening on port ${config.port}`);
});

function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  shutdownWs();

  wss.clients.forEach((ws) => {
    try { ws.close(1001, 'Server shutting down'); } catch (_) {}
  });

  wss.close(() => {
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
