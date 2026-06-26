window.HelioScout = window.HelioScout || {};

/**
 * PopulationOverlay
 * -----------------
 * Population-density heatmap built on the shared HelioScout.RasterOverlay
 * engine. Data: data/libya-population.json (kernel-density field synthesized
 * from GeoNames / UN city populations — see scripts/generate-population-grid.js).
 *
 * Two roles:
 *   1. Visual — shows where people live so reviewers can see grid-load context.
 *   2. Feasibility — sampleAt(lat, lon) feeds the land/space-constraint check:
 *      a solar farm on built-up land is physically infeasible regardless of
 *      resource quality.
 *
 * The fixed colour domain runs 0 → ~600 persons/km². Empty desert (near-zero
 * density) fades fully transparent via alphaOf so the heatmap reads as a halo
 * around population centres rather than a flat wash over the whole country.
 */
HelioScout.PopulationOverlay = HelioScout.RasterOverlay.create({
    dataUrl: 'data/libya-population.json',
    valuesKey: 'density',
    min: 0,
    max: 600,
    ramp: [
        [0.00, [ 30,  58, 138]],  // deep blue — sparse
        [0.20, [ 37,  99, 235]],
        [0.40, [ 16, 185, 129]],  // green
        [0.60, [250, 204,  21]],  // amber
        [0.80, [249, 115,  22]],  // orange
        [1.00, [220,  38,  38]]   // red — dense / built-up
    ],
    // Fade in from transparent: below ~3% of the domain (~18 persons/km²) the
    // pixel is invisible, ramping to ~0.78 opacity in dense cores.
    alphaOf: function (t) {
        if (t < 0.03) return 0;
        return Math.min(0.78, 0.15 + t * 0.9);
    },
    opacity: 1,
    imgClass: 'raster-overlay-img',
    legendClass: 'population-legend',
    title: 'Population Density',
    unit: 'persons/km² · kernel model',
    source: 'GeoNames / UN WUP',
    ticks: ['0', '150', '300', '450', '600+'],
    logName: 'PopulationOverlay'
});
