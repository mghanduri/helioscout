/**
 * Personalization routes (per-user). Mounted at /api/me and protected by
 * requireAuth, so every query is scoped to req.userId. Covers the four
 * personalizable features: points of interest, heat-rate overrides, pinned
 * site comparisons, and financial defaults.
 */
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

/* ───────── Points of interest ───────── */

router.get('/pois', (req, res) => {
    const rows = db.prepare(
        'SELECT id, name, lat, lon, type, notes, created_at FROM points_of_interest WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.userId);
    res.json({ pois: rows });
});

router.post('/pois', (req, res) => {
    const { name, lat, lon, type, notes } = req.body || {};
    if (!name || typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ error: 'name, numeric lat and numeric lon are required.' });
    }
    const now = new Date().toISOString();
    const info = db.prepare(
        'INSERT INTO points_of_interest (user_id, name, lat, lon, type, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.userId, name, lat, lon, type || null, notes || null, now);
    const poi = db.prepare('SELECT id, name, lat, lon, type, notes, created_at FROM points_of_interest WHERE id = ?')
        .get(info.lastInsertRowid);
    res.status(201).json({ poi });
});

router.put('/pois/:id', (req, res) => {
    const { name, lat, lon, type, notes } = req.body || {};
    const existing = db.prepare('SELECT * FROM points_of_interest WHERE id = ? AND user_id = ?')
        .get(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Point of interest not found.' });
    db.prepare(
        'UPDATE points_of_interest SET name = ?, lat = ?, lon = ?, type = ?, notes = ? WHERE id = ? AND user_id = ?'
    ).run(
        name != null ? name : existing.name,
        typeof lat === 'number' ? lat : existing.lat,
        typeof lon === 'number' ? lon : existing.lon,
        type !== undefined ? type : existing.type,
        notes !== undefined ? notes : existing.notes,
        req.params.id, req.userId
    );
    const poi = db.prepare('SELECT id, name, lat, lon, type, notes, created_at FROM points_of_interest WHERE id = ?')
        .get(req.params.id);
    res.json({ poi });
});

router.delete('/pois/:id', (req, res) => {
    const info = db.prepare('DELETE FROM points_of_interest WHERE id = ? AND user_id = ?')
        .run(req.params.id, req.userId);
    if (info.changes === 0) return res.status(404).json({ error: 'Point of interest not found.' });
    res.json({ ok: true });
});

/* ───────── Heat-rate overrides ───────── */
// Returned as a { turbineId: isoHeatRate } map for easy frontend merge.

router.get('/heat-rates', (req, res) => {
    const rows = db.prepare('SELECT turbine_id, iso_heat_rate FROM heat_rate_overrides WHERE user_id = ?')
        .all(req.userId);
    const map = {};
    rows.forEach(r => { map[r.turbine_id] = r.iso_heat_rate; });
    res.json({ heatRates: map });
});

router.put('/heat-rates/:turbineId', (req, res) => {
    const value = Number(req.body && req.body.isoHeatRate);
    if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ error: 'isoHeatRate must be a positive number (Btu/kWh).' });
    }
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO heat_rate_overrides (user_id, turbine_id, iso_heat_rate, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, turbine_id) DO UPDATE SET iso_heat_rate = excluded.iso_heat_rate, updated_at = excluded.updated_at`
    ).run(req.userId, req.params.turbineId, value, now);
    res.json({ ok: true, turbineId: req.params.turbineId, isoHeatRate: value });
});

router.delete('/heat-rates/:turbineId', (req, res) => {
    db.prepare('DELETE FROM heat_rate_overrides WHERE user_id = ? AND turbine_id = ?')
        .run(req.userId, req.params.turbineId);
    res.json({ ok: true });
});

/* ───────── Pinned site comparisons ───────── */

router.get('/pins', (req, res) => {
    const rows = db.prepare('SELECT payload FROM pinned_sites WHERE user_id = ? ORDER BY created_at ASC')
        .all(req.userId);
    res.json({ pins: rows.map(r => JSON.parse(r.payload)) });
});

router.put('/pins/:siteId', (req, res) => {
    const payload = req.body && req.body.payload;
    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'A payload object is required.' });
    }
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO pinned_sites (user_id, site_id, payload, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, site_id) DO UPDATE SET payload = excluded.payload`
    ).run(req.userId, req.params.siteId, JSON.stringify(payload), now);
    res.json({ ok: true });
});

router.delete('/pins/:siteId', (req, res) => {
    db.prepare('DELETE FROM pinned_sites WHERE user_id = ? AND site_id = ?')
        .run(req.userId, req.params.siteId);
    res.json({ ok: true });
});

/* ───────── Financial defaults ───────── */

router.get('/financial-defaults', (req, res) => {
    const row = db.prepare('SELECT payload FROM financial_defaults WHERE user_id = ?').get(req.userId);
    res.json({ defaults: row ? JSON.parse(row.payload) : null });
});

router.put('/financial-defaults', (req, res) => {
    const payload = req.body && req.body.payload;
    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'A payload object is required.' });
    }
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO financial_defaults (user_id, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
    ).run(req.userId, JSON.stringify(payload), now);
    res.json({ ok: true });
});

module.exports = router;
