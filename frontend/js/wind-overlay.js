window.HelioScout = window.HelioScout || {};

/**
 * WindOverlay
 * -----------
 * Global-Wind-Atlas-style overlay of mean wind speed at the 100 m hub height,
 * built on the shared HelioScout.RasterOverlay engine. Data: data/libya-wind.json
 * (NASA POWER WS10M/WS50M climatology extrapolated to 100 m with the same
 * power-law shear the assessment uses). Shaded with a GWA-style cool→warm ramp —
 * blue (calm) → teal → green → yellow → orange → red (windy) — on a fixed
 * 4.0–10.0 m/s scale.
 */
HelioScout.WindOverlay = HelioScout.RasterOverlay.create({
    dataUrl: 'data/libya-wind.json',
    valuesKey: 'wind',
    min: 4.0,
    max: 10.0,
    ramp: [
        [0.00, [ 44, 123, 182]],
        [0.20, [ 69, 170, 200]],
        [0.40, [120, 198, 160]],
        [0.55, [186, 221, 105]],
        [0.70, [255, 221,  80]],
        [0.85, [253, 141,  60]],
        [1.00, [215,  25,  28]]
    ],
    opacity: 0.7,
    imgClass: 'raster-overlay-img',
    legendClass: 'wind-legend',
    title: 'Wind Speed @ 100 m',
    unit: 'm/s · annual mean',
    source: 'NASA POWER climatology',
    ticks: ['4', '5.5', '7', '8.5', '10'],
    logName: 'WindOverlay'
});
