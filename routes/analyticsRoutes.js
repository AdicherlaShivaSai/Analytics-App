const router = require('express').Router();
const db = require('../db');
const authApiKey = require('../middleware/authApiKey');

// Event Data Collection 

router.use(authApiKey);

// POST /api/analytics/collect
router.post('/collect', async (req, res) => {
  const appId = req.appId; 

  const {
    event,
    userId,
    url,
    referrer,
    device,
    ipAddress,
    metadata
  } = req.body;

  if (!event) {
    return res.status(400).json({ message: 'Event name is required.' });
  }

  try {
    const query = `
      INSERT INTO events 
      (app_id, event_name, user_id, url, referrer, device, ip_address, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    const values = [
      appId,
      event,
      userId || null,
      url || null,
      referrer || null,
      device || null,
      ipAddress || null,
      metadata || null
    ];

    await db.query(query, values);
    
    res.status(201).json({ status: 'success', message: 'Event collected.' });

  } catch (err) {
    console.error("Error inserting event:", err);
    res.status(500).json({ message: 'Server error collecting event.' });
  }
});

module.exports = router;