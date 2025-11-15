const router = require('express').Router();
const passport = require('passport');
const bcrypt = require('bcryptjs'); // For hashing
const crypto = require('crypto');   // For generating key
const db = require('../db');
const { sha256 } = require('js-sha256');
const redisClient = require('../redisClient');

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) { // This is a Passport.js method
    return next();
  }
  res.status(401).json({ message: 'User not authenticated' });
};

// Routes for Google OAuth

// 1. Start Google Login
// This route redirects the user to Google's login page
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'] // expecting these details from Google
  })
);

// 2. Google Callback
// Google redirects back to this route after login
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login-failed' // placeholder route
  }),
  (req, res) => {
    // Successful authentication
    // this redirect them to your frontend dashboard
    res.redirect('https://analytics-app-nmox.onrender.com/api/auth/profile'); // For testing
  }
);

// 3. Get User Profile (For Testing)
// This confirms the user is logged in
router.get('/profile', isAuthenticated, (req, res) => {
  // req.user is retrieved by Passport's deserializeUser
  res.json({
    message: 'You are logged in!',
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
    }
  });
});

// API Key Management 

// 1. POST request /api/auth/register (Registers a New App and generates a key)
router.post('/register', isAuthenticated, async (req, res) => {
  const { name, domain } = req.body;
  const userId = req.user.id;

  if (!name) {
    return res.status(400).json({ message: 'Application name is required' });
  }

  try {
    // apiKey Generation
    // 1. Generate a random string
    const apiKey = `key_live_${crypto.randomBytes(24).toString('hex')}`;
    
    // 2. Hash the key using SHA256. This is fast and consistent.
    const keyHash = sha256(apiKey);

    // Database transaction
    const client = await db.query('BEGIN');

    try {
      // 1. Create the application
      const appResult = await db.query(
        'INSERT INTO applications (user_id, name, domain) VALUES ($1, $2, $3) RETURNING id',
        [userId, name, domain]
      );
      const appId = appResult.rows[0].id;

      // 2. Store the SHA256 HASH
      await db.query(
        'INSERT INTO api_keys (app_id, key_hash, status) VALUES ($1, $2, $3)',
        [appId, keyHash, 'active'] // Storing new hash
      );

      // Commit the transaction
      await db.query('COMMIT');

      // Sending the PlainText key to the user ONE TIME.
      res.status(201).json({
        message: 'Application registered successfully.',
        appId: appId,
        apiKey: apiKey, // Show key only once!
      });

    } catch (e) {
      await db.query('ROLLBACK');
      throw e; 
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error registering application.' });
  }
});

// 2. GET /api/auth/api-key (Retrieves a LIST of the user's apps)
// let the user see their apps and their key status
router.get('/api-key', isAuthenticated, async (req, res) => {
  const userId = req.user.id;
  try {
    // Join applications and api_keys tables
    const result = await db.query(
      `SELECT a.id, a.name, a.domain, k.id as api_key_id, k.status
       FROM applications a
       JOIN api_keys k ON a.id = k.app_id
       WHERE a.user_id = $1`,
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving keys.' });
  }
});

// 3. POST /api/auth/revoke
router.post('/revoke', isAuthenticated, async (req, res) => {
  const { apiKeyId } = req.body; // Must provide the key ID to revoke
  const userId = req.user.id;

  if (!apiKeyId) {
    return res.status(400).json({ message: 'API Key ID is required' });
  }

  try {
    // This query is secure. It updates the key status
    // ONLY IF the key ID matches AND it belongs to an app
    // owned by the currently logged-in user.
    const result = await db.query(
      `UPDATE api_keys k
       SET status = 'revoked'
       FROM applications a
       WHERE k.id = $1 
         AND k.app_id = a.id
         AND a.user_id = $2
       RETURNING k.id`,
      [apiKeyId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'API key not found or user not authorized.' });
    }

    res.status(200).json({ message: 'API key successfully revoked.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error revoking key.' });
  }
});


// Analytics & Reporting Endpoints
// These are protected by isAuthenticated

// GET /api/auth/event-summary
router.get('/event-summary', isAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { event, startDate, endDate, app_id } = req.query;

  // 1. Caching Logic 
  const cacheKey = `summary:${userId}:${app_id || 'all'}:${event || 'all'}:${startDate || 'none'}:${endDate || 'none'}`;
  
  try {
    if (redisClient && redisClient.isReady) {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData));
      }
    }
  } catch (err) {
    console.error('Redis cache read error:', err);
  }

  // 2. Database Query Logic 
  try {
    // We build the query dynamically
    let baseQuery = `
      SELECT 
        COUNT(*) AS count, 
        COUNT(DISTINCT e.user_id) AS "uniqueUsers",
        e.device,
        COUNT(e.device) AS "deviceCount"
      FROM events e
      JOIN applications a ON e.app_id = a.id
      WHERE a.user_id = $1
    `;
    
    const params = [userId];
    let paramIndex = 2;

    if (app_id) {
      baseQuery += ` AND a.id = $${paramIndex++}`;
      params.push(app_id);
    }
    if (event) {
      baseQuery += ` AND e.event_name = $${paramIndex++}`;
      params.push(event);
    }
    if (startDate) {
      baseQuery += ` AND e.timestamp >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      baseQuery += ` AND e.timestamp <= $${paramIndex++}`;
      params.push(endDate);
    }

    baseQuery += ' GROUP BY e.device';

    // Query Execution
    const result = await db.query(baseQuery, params);

    // Response Formatting
    // The query gives us rows per device. We need to aggregate them.
    let totalCount = 0;
    let totalUniqueUsers = 0; // Note: This is tricky to sum, DB query should be better
    const deviceData = {};

    
    // Query 1: Get Totals
    let totalQuery = `
      SELECT COUNT(*) AS count, COUNT(DISTINCT e.user_id) AS "uniqueUsers"
      FROM events e
      JOIN applications a ON e.app_id = a.id
      WHERE a.user_id = $1
    `;
    
    // We rebuild params and query for totals
    const totalParams = [userId];
    let totalParamIndex = 2;
    if (app_id) {
      totalQuery += ` AND a.id = $${totalParamIndex++}`;
      totalParams.push(app_id);
    }
    if (event) {
      totalQuery += ` AND e.event_name = $${totalParamIndex++}`;
      totalParams.push(event);
    }
    // ... add date filters too ...
    
    const totalResult = await db.query(totalQuery, totalParams);

    // Query 2: Get Device Breakdown
    let deviceQuery = `
      SELECT device, COUNT(*) AS "deviceCount"
      FROM events e
      JOIN applications a ON e.app_id = a.id
      WHERE a.user_id = $1
    `;
    // add all filters (app_id, event, dates)
    deviceQuery += ' GROUP BY device';
    // use same params as totalQuery 
    
    const deviceResult = await db.query(deviceQuery, totalParams);

    // Build final JSON 
    const formattedResponse = {
      event: event || 'all_events',
      count: parseInt(totalResult.rows[0].count, 10),
      uniqueUsers: parseInt(totalResult.rows[0].uniqueUsers, 10),
      deviceData: {}
    };

    deviceResult.rows.forEach(row => {
      formattedResponse.deviceData[row.device || 'unknown'] = parseInt(row.deviceCount, 10);
    });

    // 3. Save to Cache 
    try {
      if (redisClient && redisClient.isReady) {
        // Cache for 5 minutes
        await redisClient.set(cacheKey, JSON.stringify(formattedResponse), { EX: 300 });
      }
    } catch (err) {
      console.error('Redis cache write error:', err);
    }
    
    res.status(200).json(formattedResponse);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving event summary.' });
  }
});


// GET /api/auth/user-stats
router.get('/user-stats', isAuthenticated, async (req, res) => {
  const developerUserId = req.user.id; // The logged-in developer
  const { userId } = req.query; // The app's user (e.g., "user789")

  if (!userId) {
    return res.status(400).json({ message: 'userId query parameter is required.' });
  }

  try {
    // We must join with 'applications' to ensure the developer
    // can only see data for their own apps.
    
    // Query 1: Get Total Events
    const totalEventsQuery = `
      SELECT COUNT(*) AS "totalEvents"
      FROM events e
      JOIN applications a ON e.app_id = a.id
      WHERE a.user_id = $1 AND e.user_id = $2
    `;
    const totalEventsResult = await db.query(totalEventsQuery, [developerUserId, userId]);
    
    // Query 2: Get Last Seen details
    const lastSeenQuery = `
      SELECT metadata, ip_address, timestamp
      FROM events e
      JOIN applications a ON e.app_id = a.id
      WHERE a.user_id = $1 AND e.user_id = $2
      ORDER BY e.timestamp DESC
      LIMIT 1
    `;
    const lastSeenResult = await db.query(lastSeenQuery, [developerUserId, userId]);

    if (lastSeenResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found for this developer.' });
    }

    const { metadata, ip_address, timestamp } = lastSeenResult.rows[0];

    const response = {
      userId: userId,
      totalEvents: parseInt(totalEventsResult.rows[0].totalEvents, 10),
      deviceDetails: {
        browser: metadata?.browser || null,
        os: metadata?.os || null
      },
      ipAddress: ip_address,
      lastSeen: timestamp
    };

    res.status(200).json(response);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving user stats.' });
  }
});

module.exports = router;