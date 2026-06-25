#!/usr/bin/env node
/**
 * Copy the canonical repo-root assumptions.json into backend/ so the running
 * service ships with its own copy of the register (robust to the Railway deploy
 * root configuration). Mirrors the generate-env.js build-artifact pattern.
 *
 * Runs on `prestart` and `postinstall`. A no-op (warning only) if the canonical
 * file is absent — the loader falls back to the root path in that case.
 */
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', '..', 'assumptions.json');
const dest = path.resolve(__dirname, '..', 'assumptions.json');

try {
  fs.copyFileSync(src, dest);
  console.log('[sync-assumptions] copied', src, '->', dest);
} catch (e) {
  console.warn('[sync-assumptions] could not copy canonical assumptions.json:', e.message,
    '\n[sync-assumptions] loader will fall back to the repo-root file if reachable.');
}
