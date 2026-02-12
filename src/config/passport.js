// src/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');

// Cargar variables de entorno
require('dotenv').config();

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL         = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback';

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  db.query('SELECT id, nombre, correo, telefono, googleId, rolId FROM usuario WHERE id = ?', [id], (err, rows) => {
    if (err) return done(err);
    done(null, rows[0] || null);
  });
});

passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: CALLBACK_URL,
  scope: ['profile', 'email']
}, (accessToken, refreshToken, profile, done) => {
  const googleId = profile.id;
  const email = (profile.emails && profile.emails[0]) ? profile.emails[0].value : null;
  const nombre = profile.displayName || '';

  // check if user exists by googleId or correo
  db.query('SELECT * FROM usuario WHERE googleId = ? OR correo = ? LIMIT 1', [googleId, email], (err, rows) => {
    if (err) return done(err);

    if (rows && rows.length > 0) {
      const user = rows[0];
      if (!user.googleId) {
        db.query('UPDATE usuario SET googleId = ? WHERE id = ?', [googleId, user.id]);
      }
      return done(null, user);
    }

    // create new user
    const id = uuidv4();
    db.query(
      'INSERT INTO usuario (id, nombre, correo, googleId, activo) VALUES (?, ?, ?, ?, 1)',
      [id, nombre, email, googleId],
      (err2) => {
        if (err2) return done(err2);
        done(null, { id, nombre, correo: email, googleId });
      }
    );
  });
}));

module.exports = passport;
