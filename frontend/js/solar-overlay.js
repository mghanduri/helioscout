window.HelioScout = window.HelioScout || {};

/**
 * SolarOverlay
 * ------------
 * Global-Solar-Atlas-style overlay of Global Horizontal Irradiance, built on the
 * shared HelioScout.RasterOverlay engine. Data: data/libya-ghi.json (real NASA
 * POWER GHI climatology). Shaded with the GSA-style ColorBrewer YlOrBr ramp —
 * pale yellow → saturated orange → deep oxblood red — on a fixed 4.0–7.0 scale.
 */
HelioScout.SolarOverlay = HelioScout.RasterOverlay.create({
    dataUrl: 'data/libya-ghi.json',
    valuesKey: 'ghi',
    min: 4.0,
    max: 7.0,
    ramp: [
        [0.00, [255, 255, 212]],
        [0.18, [254, 227, 145]],
        [0.36, [254, 196,  79]],
        [0.54, [254, 153,  41]],
        [0.70, [236, 112,  20]],
        [0.85, [204,  76,   2]],
        [1.00, [140,  45,   4]]
    ],
    opacity: 0.7,
    imgClass: 'raster-overlay-img',
    legendClass: 'solar-legend',
    title: 'Solar Irradiance (GHI)',
    unit: 'kWh/m²/day · annual mean',
    source: 'NASA POWER climatology',
    ticks: ['4.0', '4.75', '5.5', '6.25', '7.0'],
    logName: 'SolarOverlay'
});
