const { Pool } = require('pg');
require('dotenv').config();

// New Pool instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If you're using Neon, it requires SSL
  ssl: {
    rejectUnauthorized: false,
  },
});

// Connection test
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Successfully connected to the database.');
  release(); // Releasing the client back to the pool
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};