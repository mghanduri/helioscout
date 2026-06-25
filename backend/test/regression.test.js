/**
 * Regression guard for the assumptions-register refactor and the scoring/
 * financial engines. Asserts that, for fixed inputs, the engine outputs match
 * the captured baseline EXACTLY (ignoring the volatile `timestamp` and the
 * additive `provenance`/`meta` keys). The fixtures in test/fixtures were
 * captured from the engines BEFORE constants were moved into assumptions.json;
 * this test is what protects the numbers officials will quote.
 *
 * Run with: npm test   (no extra dependencies — plain Node assert).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, 'fixtures');
const IGNORE_TOP_KEYS = ['timestamp', 'provenance', 'meta'];

function stripIgnored(assessment) {
  const a = JSON.parse(JSON.stringify(assessment));
  IGNORE_TOP_KEYS.forEach(k => delete a[k]);
  return a;
}

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
  } catch (e) {
    failures++;
    console.error('  ✗ ' + name + '\n    ' + e.message);
  }
}

// ---- 1. Backend scoring engine -------------------------------------------
console.log('Scoring engine (generateAssessment):');
const { generateAssessment } = require('../services/scoringEngine');
const apiData = JSON.parse(fs.readFileSync(path.join(FIX, 'apiData.json'), 'utf8'));
const baselineAssess = JSON.parse(fs.readFileSync(path.join(FIX, 'baseline-assessment.json'), 'utf8'));

for (const key of Object.keys(baselineAssess)) {
  check('assessment matches baseline @ ' + key, () => {
    const got = stripIgnored(generateAssessment(apiData[key]));
    const want = stripIgnored(baselineAssess[key]);
    assert.deepStrictEqual(got, want);
  });
}

// ---- 2. Frontend financial + reconciliation engines ----------------------
// These are browser IIFE modules that assign to window.* and read the register
// via HelioScout.requireAssumptions(). Shim the browser globals and inject the
// register directly (no fetch in Node).
console.log('Financial + reconciliation engines:');
global.window = global;
require('../../frontend/js/assumptions.js');
global.HelioScout.Assumptions = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'assumptions.json'), 'utf8')
);
require('../../frontend/js/financial.js');
require('../../frontend/js/reconciliation.js');
const F = global.HelioScout.Financial;
const R = global.HelioScout.Reconciliation;

const plants = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'data', 'libya-plants.json'), 'utf8')
);
const baselineFin = JSON.parse(fs.readFileSync(path.join(FIX, 'baseline-financial.json'), 'utf8'));

const fin = {
  gas: F.calculateGasDisplacement(500000, 'siemens-sgt5-2000e', 35, 15, 1.0, 10.0),
  lcoeSolar: F.calculateLCOE('solar', 100, 25),
  lcoeWind: F.calculateLCOE('wind', 100, 35),
  lcoeCsp: F.calculateLCOE('csp', 100, 40),
  npv: F.calculateNPV(70000000, 30000000, 1000000, 25),
  derate: F.deriveFleetHeatRate(10200, 35, 15, 'OCGT'),
  mapId: F.classConfigToTurbineId('E-class', 'OCGT'),
};
check('financial calculations match baseline', () => {
  assert.deepStrictEqual(fin, baselineFin.fin);
});

const recon = R.compute(plants, { utilisation: 0.45, ambientC: 35, nationalBcf: 320 });
const reconSummary = {
  totalCapacityMW: recon.totalCapacityMW,
  fleetMMBtu: recon.fleetMMBtu,
  fleetBcf: recon.fleetBcf,
  ratio: recon.ratio,
  validated: recon.validated,
  rowHeatRates: recon.rows.map(r => ({ name: r.name, heatRate: r.heatRate, gasBcf: r.gasBcf })),
};
check('reconciliation matches baseline', () => {
  assert.deepStrictEqual(reconSummary, baselineFin.recon);
});

// ---- result ---------------------------------------------------------------
if (failures) {
  console.error('\n' + failures + ' regression check(s) FAILED.');
  process.exit(1);
}
console.log('\nAll regression checks passed.');
