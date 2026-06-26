/**
 * HelioScout.Compare — Site comparison and ranking module
 * Manages pinned site assessments for side-by-side comparison,
 * table generation, ranking, and CSV export.
 */
window.HelioScout = window.HelioScout || {};

HelioScout.Compare = (function () {
  const MAX_PINS = 5;
  let pinnedSites = [];

  /* ───────── helpers ───────── */

  function _generateId(lat, lon) {
    return `${lat.toFixed(4)}_${lon.toFixed(4)}`;
  }

  function _fmt(val, decimals) {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'number') return val.toFixed(decimals ?? 1);
    return String(val);
  }

  function _scoreClass(score) {
    if (score === null || score === undefined) return '';
    if (score >= 80) return 'score--excellent';
    if (score >= 60) return 'score--good';
    if (score >= 40) return 'score--moderate';
    return 'score--poor';
  }

  function _recommendation(composite) {
    if (composite === null || composite === undefined) return '—';
    if (composite >= 80) return 'Excellent — Immediate Priority';
    if (composite >= 65) return 'Strong — High Priority';
    if (composite >= 50) return 'Moderate — Worth Exploring';
    if (composite >= 35) return 'Marginal — Conditional';
    return 'Poor — Not Recommended';
  }

  /* ───────── public API ───────── */

  /**
   * Add a site assessment to the comparison set.
   * @param {Object} siteData — { id, name, lat, lon, solar, wind, csp, composite, financial }
   * @returns {boolean} true if added, false if at capacity or duplicate
   */
  function pinSite(siteData) {
    if (pinnedSites.length >= MAX_PINS) {
      console.warn('[Compare] Maximum pins reached (' + MAX_PINS + ')');
      return false;
    }
    const id = siteData.id || _generateId(siteData.lat, siteData.lon);
    if (pinnedSites.some(function (s) { return s.id === id; })) {
      console.warn('[Compare] Site already pinned:', id);
      return false;
    }
    pinnedSites.push(Object.assign({}, siteData, { id: id }));
    return true;
  }

  /**
   * Remove a pinned site by its id.
   * @param {string} siteId
   */
  function unpinSite(siteId) {
    pinnedSites = pinnedSites.filter(function (s) { return s.id !== siteId; });
  }

  /**
   * Check whether coordinates are already in the comparison set.
   * @param {number} lat
   * @param {number} lon
   * @returns {boolean}
   */
  function isPinned(lat, lon) {
    var checkId = _generateId(lat, lon);
    return pinnedSites.some(function (s) { return s.id === checkId; });
  }

  /**
   * Return all currently pinned sites.
   * @returns {Array}
   */
  function getPinnedSites() {
    return pinnedSites.slice(); // defensive copy
  }

  /**
   * Clear every pinned site.
   */
  function clearAll() {
    pinnedSites = [];
  }

  /**
   * Build an HTML comparison table for all pinned sites.
   * @returns {string} HTML string
   */
  function generateComparisonTable() {
    if (pinnedSites.length === 0) {
      return '<div class="compare-empty">' +
        '<p>No sites pinned for comparison.</p>' +
        '<p class="compare-empty__hint">Click the 📌 pin icon on any site assessment to add it here (max ' + MAX_PINS + ').</p>' +
        '</div>';
    }

    var rows = [];

    // Header row
    rows.push('<tr><th class="compare-table__label">Metric</th>');
    pinnedSites.forEach(function (s) {
      rows.push(
        '<th class="compare-table__site">' +
          '<span class="compare-table__site-name">' + (s.name || s.id) + '</span>' +
          '<span class="compare-table__coords">' + _fmt(s.lat, 4) + '°N, ' + _fmt(s.lon, 4) + '°E</span>' +
          '<button class="compare-table__unpin" data-site-id="' + s.id + '" title="Remove">✕</button>' +
        '</th>'
      );
    });
    rows.push('</tr>');

    // Metric rows definition: [label, accessor, decimals, unit, isScore]
    var metrics = [
      // Solar
      ['Solar GHI', function (s) { return s.solar && s.solar.ghi; }, 1, 'kWh/m²/day', false],
      ['PV Output', function (s) { return s.solar && s.solar.pvOutput; }, 0, 'kWh/kWp/yr', false],
      ['Solar Score', function (s) { return s.solar && s.solar.score; }, 0, '/100', true],

      // Wind
      ['Wind Speed (100m)', function (s) { return s.wind && s.wind.speed100m; }, 1, 'm/s', false],
      ['Capacity Factor', function (s) { return s.wind && s.wind.capacityFactor; }, 1, '%', false],
      ['Wind Score', function (s) { return s.wind && s.wind.score; }, 0, '/100', true],

      // CSP
      ['CSP DNI', function (s) { return s.csp && s.csp.dni; }, 0, 'kWh/m²/yr', false],
      ['CSP Score', function (s) { return s.csp && s.csp.score; }, 0, '/100', true],

      // Composite
      ['Composite Score', function (s) { return s.composite; }, 0, '/100', true],
      ['Recommendation', function (s) { return _recommendation(s.composite); }, null, '', false],

      // Financial (Libya mode only)
      ['LCOE (Solar PV)', function (s) { return s.financial && s.financial.lcoeSolar; }, 1, '$/MWh', false],
      ['Gas Freed', function (s) { return s.financial && s.financial.gasDisplacement; }, 0, 'MMBtu/yr', false],
      ['Gas Value (export)', function (s) { return s.financial && s.financial.gasValue; }, 1, '$M/yr', false]
    ];

    metrics.forEach(function (m) {
      var label = m[0], accessor = m[1], dec = m[2], unit = m[3], isScore = m[4];

      rows.push('<tr><td class="compare-table__label">' + label + '</td>');
      pinnedSites.forEach(function (s) {
        var val = accessor(s);
        var display;
        if (label === 'Recommendation') {
          display = val;
        } else {
          display = _fmt(val, dec) + (val !== null && val !== undefined && val !== '' ? ' ' + unit : '');
        }
        var cls = isScore ? ' ' + _scoreClass(val) : '';
        rows.push('<td class="compare-table__value' + cls + '">' + display + '</td>');
      });
      rows.push('</tr>');
    });

    return '<div class="compare-table-wrap">' +
      '<table class="compare-table">' +
      '<thead>' + rows[0] + '</thead>' +
      '<tbody>' + rows.slice(1).join('') + '</tbody>' +
      '</table>' +
      '<div class="compare-actions">' +
        '<button class="compare-actions__export" onclick="HelioScout.Compare.exportCSV()">⬇ Export CSV</button>' +
        '<button class="compare-actions__clear" onclick="HelioScout.Compare.clearAll(); if(HelioScout.Compare.onUpdate) HelioScout.Compare.onUpdate();">Clear All</button>' +
      '</div>' +
    '</div>';
  }

  /**
   * Sort pinned sites by a given metric key.
   * @param {'solar'|'wind'|'composite'|'lcoe'} metric
   * @returns {Array} sorted copy
   */
  function rankBy(metric) {
    var accessors = {
      solar:     function (s) { return (s.solar && s.solar.score) || 0; },
      wind:      function (s) { return (s.wind && s.wind.score) || 0; },
      composite: function (s) { return s.composite || 0; },
      lcoe:      function (s) { return (s.financial && s.financial.lcoeSolar) || Infinity; }
    };

    var fn = accessors[metric];
    if (!fn) {
      console.warn('[Compare] Unknown metric for ranking:', metric);
      return pinnedSites.slice();
    }

    // LCOE → ascending (lower is better); everything else → descending
    var ascending = (metric === 'lcoe');

    pinnedSites.sort(function (a, b) {
      var va = fn(a), vb = fn(b);
      return ascending ? va - vb : vb - va;
    });

    return pinnedSites.slice();
  }

  /**
   * Generate a CSV string and trigger a browser download.
   */
  function exportCSV() {
    if (pinnedSites.length === 0) {
      alert('No sites pinned for export.');
      return;
    }

    var headers = [
      'Name', 'Latitude', 'Longitude',
      'GHI (kWh/m²/day)', 'PV Output (kWh/kWp/yr)', 'Solar Score',
      'Wind Speed 100m (m/s)', 'Wind Capacity Factor (%)', 'Wind Score',
      'DNI (kWh/m²/yr)', 'CSP Score',
      'Composite Score', 'Recommendation',
      'LCOE Solar ($/MWh)',
      'Gas Freed (MMBtu/yr)', 'Gas Value Export ($M/yr)'
    ];

    var csvRows = [headers.join(',')];

    pinnedSites.forEach(function (s) {
      var row = [
        '"' + ((s.name || s.id) + '').replace(/"/g, '""') + '"',
        _fmt(s.lat, 4),
        _fmt(s.lon, 4),
        _fmt(s.solar && s.solar.ghi, 2),
        _fmt(s.solar && s.solar.pvOutput, 0),
        _fmt(s.solar && s.solar.score, 0),
        _fmt(s.wind && s.wind.speed100m, 2),
        _fmt(s.wind && s.wind.capacityFactor, 1),
        _fmt(s.wind && s.wind.score, 0),
        _fmt(s.csp && s.csp.dni, 0),
        _fmt(s.csp && s.csp.score, 0),
        _fmt(s.composite, 0),
        '"' + _recommendation(s.composite) + '"',
        _fmt(s.financial && s.financial.lcoeSolar, 2),
        _fmt(s.financial && s.financial.gasDisplacement, 0),
        _fmt(s.financial && s.financial.gasValue, 2)
      ];
      csvRows.push(row.join(','));
    });

    var csvContent = csvRows.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);

    var link = document.createElement('a');
    link.href = url;
    link.download = 'helioscout-comparison-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(function () {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /* ───────── exposed interface ───────── */

  /**
   * Replace the entire pinned set (used to hydrate from a signed-in user's
   * saved pins). Caps at MAX_PINS and ignores malformed entries.
   */
  function setPinnedSites(sites) {
    pinnedSites = (Array.isArray(sites) ? sites : [])
      .filter(function (s) { return s && (s.id || (s.lat != null && s.lon != null)); })
      .slice(0, MAX_PINS)
      .map(function (s) { return Object.assign({}, s, { id: s.id || _generateId(s.lat, s.lon) }); });
  }

  return {
    pinnedSites: pinnedSites,  // direct reference (also accessible via getter)
    pinSite: pinSite,
    unpinSite: unpinSite,
    isPinned: isPinned,
    getPinnedSites: getPinnedSites,
    setPinnedSites: setPinnedSites,
    clearAll: clearAll,
    generateComparisonTable: generateComparisonTable,
    rankBy: rankBy,
    exportCSV: exportCSV,
    onUpdate: null  // optional callback when comparison changes
  };
})();
