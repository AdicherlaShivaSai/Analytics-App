const { createClient } = require('redis');
require('dotenv').config();

let client;

if (!process.env.REDIS_URL) {
  console.log('REDIS_URL not found, Redis client will not be initialized.');
} else {
  try {
    const clientOptions = {
      url: process.env.REDIS_URL,
    };

    if (process.env.REDIS_URL.startsWith('rediss://')) {
      clientOptions.socket = {
        tls: true,
        rejectUnauthorized: false
      };
    }

    client = createClient(clientOptions);

    client.on('error', (err) => {
      console.error('Redis Client Error', err);
    });

    client.on('connect', () => {
      console.log('Redis client connected.');
    });

    client.on('ready', () => {
      console.log('Redis client ready.');
    });

    client.connect().catch((err) => {
      console.error('Failed to connect to Redis:', err);
    });

  } catch (err) {
    console.error('Failed to initialize Redis client:', err);
  }
}

module.exports = client;