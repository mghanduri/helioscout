/**
 * Account routes: register, login, current-user. Mounted at /api/auth.
 */
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, issueToken, publicUser, requireAuth } = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validCredentials(email, password) {
    if (!email || !EMAIL_RE.test(email)) return 'A valid email address is required.';
    if (!password || String(password).length < 6) return 'Password must be at least 6 characters.';
    return null;
}

// Create an account.
router.post('/register', (req, res) => {
    const { email, password, name, role } = req.body || {};
    const err = validCredentials(email, password);
    if (err) return res.status(400).json({ error: err });

    const normalized = String(email).trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
    if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

    const now = new Date().toISOString();
    const info = db.prepare(
        'INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(normalized, hashPassword(password), name || null, role || null, now);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

// Sign in.
router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const normalized = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized);
    if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    return res.json({ token: issueToken(user), user: publicUser(user) });
});

// Who am I (validates the token, refreshes profile).
router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    return res.json({ user: publicUser(user) });
});

module.exports = router;
