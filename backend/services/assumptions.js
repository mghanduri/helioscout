/**
 * Assumptions register loader (backend side).
 *
 * Loads the single source-of-truth assumptions register so the scoring engine
 * reads dated, sourced constants instead of hardcoded literals. Prefers the
 * per-deploy synced copy (backend/assumptions.json, written by
 * scripts/sync-assumptions.js on prestart/postinstall) and falls back to the
 * canonical file at the repo root — so it works locally with no build step and
 * regardless of how the Railway deploy root is configured.
 */
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  path.resolve(__dirname, '..', 'assumptions.json'),       // synced copy in backend/
  path.resolve(__dirname, '..', '..', 'assumptions.json'), // canonical at repo root
];

function load() {
  for (const p of CANDIDATES) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      // try next candidate
    }
  }
  throw new Error(
    'assumptions.json not found. Looked in: ' + CANDIDATES.join(', ') +
    '. Run `node scripts/sync-assumptions.js` or ensure the repo-root assumptions.json is present.'
  );
}

const assumptions = load();

/**
 * Pick the first band whose threshold the value clears. Bands are ordered
 * descending by `min`; a band with `min === null` is the catch-all (always
 * matches). `inclusive` selects >= (wind/CSP) vs > (solar) to preserve the
 * exact comparison semantics of the original hardcoded thresholds.
 */
function bandLookup(value, bands, inclusive) {
  for (const b of bands) {
    if (b.min == null) return b;
    if (inclusive ? value >= b.min : value > b.min) return b;
  }
  return bands[bands.length - 1];
}

module.exports = { assumptions, bandLookup };
