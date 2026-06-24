#!/usr/bin/env node
/**
 * Build-time env injection.
 *
 * Runs during the Vercel build (see vercel.json "buildCommand"). Reads the
 * BACKEND_URL environment variable from the Vercel project settings and writes
 * it into js/env.js, which the browser loads before js/config.js.
 *
 * IMPORTANT: only PUBLIC, non-secret values belong here — whatever is written
 * to env.js is shipped to the browser and readable by anyone. Secret keys
 * (proprietary APIs, tokens) must live in the BACKEND's environment (Railway),
 * never in a Vercel/front-end variable.
 */
const fs = require('fs');
const path = require('path');

const backendUrl = (process.env.BACKEND_URL || '').replace(/\/+$/, '');

const banner = '// AUTO-GENERATED at build time by scripts/generate-env.js — do not edit by hand.';
const contents = `${banner}\nwindow.__BACKEND_URL = ${JSON.stringify(backendUrl)};\n`;

const outPath = path.join(__dirname, '..', 'js', 'env.js');
fs.writeFileSync(outPath, contents);

console.log('[generate-env] wrote js/env.js with BACKEND_URL =', backendUrl || '(empty — frontend will fall back to localhost)');
