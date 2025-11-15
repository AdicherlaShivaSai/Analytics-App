require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const rateLimit = require('express-rate-limit'); 
const passport = require('passport');    
const db = require('./db');
require('./passport-setup');

const authRoutes = require('./routes/authRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate Limiting Middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, 
  legacyHeaders: false,
});

// Stricter limiter for the high-volume data collection endpoint
const collectLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, 
  message: 'Too many events from this IP, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});
// Apply rate limiting to all requests
app.use('/api/auth', apiLimiter);
app.use('/api/analytics', collectLimiter);

// Session Middleware Setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
// Initialize Passport
app.use(passport.initialize());
// Use Passport for session management
app.use(passport.session());

// Root Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running' });
});

app.use('/api/auth', authRoutes);

app.use('/api/analytics', analyticsRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});