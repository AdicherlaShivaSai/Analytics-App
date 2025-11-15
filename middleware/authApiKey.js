const { sha256 } = require('js-sha256');
const db = require('../db');

const apiKeyCache = new Map();

const authApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ message: 'Access denied. No API Key provided.' });
  }

  // 1. Checking Cache First 
  if (apiKeyCache.has(apiKey)) {
    const cachedData = apiKeyCache.get(apiKey);
    
    // Checking if cache is expired
    if (cachedData.expiresAt > Date.now()) {
      req.appId = cachedData.appId;
      return next();
    } else {
      apiKeyCache.delete(apiKey);
    }
  }

  // 2. If not in cache, check Database
  try {
    const keyHash = sha256(apiKey);
    
    const result = await db.query(
      "SELECT app_id FROM api_keys WHERE key_hash = $1 AND status = 'active'",
      [keyHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid API Key.' });
    }

    const { app_id } = result.rows[0];

    // 3. Store in Cache and Proceed 
    const cacheDuration = 5 * 60 * 1000;
    apiKeyCache.set(apiKey, {
      appId: app_id,
      expiresAt: Date.now() + cacheDuration,
    });

    req.appId = app_id; 
    next(); 
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during authentication.' });
  }
};

module.exports = authApiKey;