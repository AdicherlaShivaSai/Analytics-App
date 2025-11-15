const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');

// User Serialization
// Stores the user ID in the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Retrieves the user from the database using the ID from the session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = result.rows[0];
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      const { id, displayName, emails } = profile;
      const email = emails[0].value;

      try {
        // 1. Check if user already exists
        let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [id]);

        if (userResult.rows.length > 0) {
          // 2. If user exists, pass them to serializeUser
          const user = userResult.rows[0];
          return done(null, user);
        }

        // 3. If user does not exist, create them in the database
        const newUserResult = await db.query(
          'INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING *',
          [id, email, displayName]
        );
        const newUser = newUserResult.rows[0];
        
        // 4. Pass the new user to serializeUser
        return done(null, newUser);

      } catch (err) {
        return done(err, null);
      }
    }
  )
);