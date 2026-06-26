/**
 * Authentication helpers: password hashing, JWT issue/verify, and the
 * `requireAuth` Express middleware that protects the /api/me/* routes.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// In production set a strong JWT_SECRET in the environment. The dev fallback is
// deliberately obvious so a missing secret is noticed rather than silently weak.
const JWT_SECRET = process.env.JWT_SECRET || 'helioscout-dev-secret-change-me';
const JWT_TTL = process.env.JWT_TTL || '30d';

if (!process.env.JWT_SECRET) {
    console.warn('[auth] JWT_SECRET not set — using an insecure development secret. ' +
        'Set JWT_SECRET in the environment before any real deployment.');
}

function hashPassword(plain) {
    return bcrypt.hashSync(plain, 10);
}
function verifyPassword(plain, hash) {
    return bcrypt.compareSync(plain, hash);
}

function issueToken(user) {
    return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_TTL });
}

/** Strip secret columns before returning a user to the client. */
function publicUser(row) {
    if (!row) return null;
    return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at };
}

function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.sub;
        req.userEmail = payload.email;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired session.' });
    }
}

module.exports = { hashPassword, verifyPassword, issueToken, publicUser, requireAuth };
