const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const config = require('./config');

const rooms = new Map();
const ownerRooms = new Map();

function createRoom(roomId, ownerId) {
  if (ownerRooms.has(ownerId)) {
    throw new Error('Owner already has an active room');
  }

  const id = roomId || uuidv4();
  if (rooms.has(id)) {
    throw new Error('Room already exists');
  }

  const room = {
    id,
    ownerId,
    streamer: null,
    listeners: new Set(),
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  rooms.set(id, room);
  ownerRooms.set(ownerId, id);
  logger.info('Room created', { roomId: id, ownerId });
  return room;
}

function joinRoom(roomId, ws) {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  room.listeners.add(ws);
  room.lastActivity = Date.now();
  logger.info('Listener joined room', { roomId, listeners: room.listeners.size });
  return room;
}

function setStreamer(roomId, ws) {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  room.streamer = ws;
  room.lastActivity = Date.now();
  logger.info('Streamer set for room', { roomId });
}

function removeConnection(ws) {
  for (const [roomId, room] of rooms) {
    if (room.streamer === ws) {
      logger.info('Streamer disconnected, closing room', { roomId });
      for (const listener of room.listeners) {
        try {
          listener.close(1000, 'Streamer disconnected');
        } catch (_) {}
      }
      room.listeners.clear();
      room.streamer = null;
      ownerRooms.delete(room.ownerId);
      rooms.delete(roomId);
      logger.info('Room deleted', { roomId });
      return;
    }

    if (room.listeners.has(ws)) {
      room.listeners.delete(ws);
      logger.info('Listener left room', { roomId, listeners: room.listeners.size });
      if (room.listeners.size === 0 && !room.streamer) {
        ownerRooms.delete(room.ownerId);
        rooms.delete(roomId);
        logger.info('Empty room deleted', { roomId });
      }
      return;
    }
  }
}

function broadcastAudio(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.lastActivity = Date.now();

  for (const listener of room.listeners) {
    if (listener.readyState === 1) {
      try {
        listener.send(data, { binary: true });
      } catch (_) {}
    }
  }
}

function cleanupStaleRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (now - room.lastActivity > config.roomInactivityTimeoutMs) {
      logger.info('Cleaning up stale room', { roomId, inactiveMs: now - room.lastActivity });
      if (room.streamer) {
        try { room.streamer.close(1000, 'Room timed out'); } catch (_) {}
      }
      for (const listener of room.listeners) {
        try { listener.close(1000, 'Room timed out'); } catch (_) {}
      }
      ownerRooms.delete(room.ownerId);
      rooms.delete(roomId);
    }
  }
}

function getStats() {
  let totalConnections = 0;
  for (const room of rooms.values()) {
    if (room.streamer) totalConnections++;
    totalConnections += room.listeners.size;
  }
  return { totalRooms: rooms.size, totalConnections };
}

module.exports = {
  createRoom,
  joinRoom,
  setStreamer,
  removeConnection,
  broadcastAudio,
  cleanupStaleRooms,
  getStats,
};
