const { WebSocketServer } = require('ws');
const { authenticateUpgrade } = require('./auth');
const roomManager = require('./roomManager');
const config = require('./config');
const logger = require('./logger');

let heartbeatInterval;
let cleanupInterval;

function setupWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!authenticateUpgrade(req)) {
      logger.warn('WebSocket auth failed', { ip: req.socket.remoteAddress });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.roomId = null;
    ws.role = null;
    ws.clientId = req.headers['x-client-id'] || `client-${Date.now()}`;

    logger.info('Client connected', { clientId: ws.clientId, ip: req.socket.remoteAddress });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (ws.role === 'streamer' && ws.roomId) {
          roomManager.broadcastAudio(ws.roomId, data);
        }
        return;
      }

      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        sendJSON(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      handleTextMessage(ws, msg);
    });

    ws.on('close', () => {
      logger.info('Client disconnected', { clientId: ws.clientId, role: ws.role, roomId: ws.roomId });
      roomManager.removeConnection(ws);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error', { clientId: ws.clientId, error: err.message });
    });
  });

  heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        logger.info('Terminating unresponsive client', { clientId: ws.clientId });
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, config.heartbeatIntervalMs);

  cleanupInterval = setInterval(() => {
    roomManager.cleanupStaleRooms();
  }, config.roomCleanupIntervalMs);

  return wss;
}

function handleTextMessage(ws, msg) {
  switch (msg.type) {
    case 'create_room': {
      try {
        const roomId = msg.roomId || undefined;
        const room = roomManager.createRoom(roomId, ws.clientId);
        roomManager.setStreamer(room.id, ws);
        ws.role = 'streamer';
        ws.roomId = room.id;
        sendJSON(ws, { type: 'room_created', roomId: room.id });
      } catch (err) {
        sendJSON(ws, { type: 'error', message: err.message });
      }
      break;
    }

    case 'join_room': {
      if (!msg.roomId) {
        sendJSON(ws, { type: 'error', message: 'roomId is required' });
        return;
      }
      try {
        roomManager.joinRoom(msg.roomId, ws);
        ws.role = 'listener';
        ws.roomId = msg.roomId;
        sendJSON(ws, { type: 'joined_room', roomId: msg.roomId });
      } catch (err) {
        sendJSON(ws, { type: 'error', message: err.message });
      }
      break;
    }



    default:
      sendJSON(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

function sendJSON(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

function shutdown() {
  clearInterval(heartbeatInterval);
  clearInterval(cleanupInterval);
}

module.exports = { setupWebSocket, shutdown };
