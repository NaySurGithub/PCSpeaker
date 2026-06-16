const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');

function authenticateUpgrade(req) {
  if (!config.authToken) {
    logger.warn('AUTH_TOKEN not set — accepting all connections');
    return true;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  const expected = Buffer.from(config.authToken);
  const received = Buffer.from(token);

  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

module.exports = { authenticateUpgrade };
