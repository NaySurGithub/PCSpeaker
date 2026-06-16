const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 8080,
  authToken: process.env.AUTH_TOKEN || '',
  roomCleanupIntervalMs: parseInt(process.env.ROOM_CLEANUP_INTERVAL_MS, 10) || 30000,
  roomInactivityTimeoutMs: parseInt(process.env.ROOM_INACTIVITY_TIMEOUT_MS, 10) || 300000,
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS, 10) || 30000,
  heartbeatTimeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS, 10) || 10000,
});

module.exports = config;
