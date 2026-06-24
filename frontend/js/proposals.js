/**
 * HelioScout.Proposals — Manages pre-loaded proposed RE sites and existing power plants
 * Loads data from JSON files, provides filtering, nearest-plant lookup,
 * and generates HTML cards and Leaflet marker icons.
 */
window.HelioScout = window.HelioScout || {};

HelioScout.Proposals = (function () {
  let sites = [];
  let plants = [];

  /* ───────── type icons & colours (ISO/IEC-aligned SVG symbols) ───────── */
  /*
   * Solar PV  — IEC 60617-11 / IEC 61215 (crystalline silicon PV modules)
   * Wind      — IEC 60617-11 / IEC 61400 (wind energy generation systems)
   * CSP       — IEC 62862 (concentrated solar power systems)
   * Hybrid    — Combined Solar PV + Wind (composite symbol)
   */

  var ICONS = {
    solar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    wind:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><line x1="12" y1="10.5" x2="12" y2="4"/><line x1="10.7" y1="12.75" x2="5" y2="16"/><line x1="13.3" y1="12.75" x2="19" y2="16"/><line x1="12" y1="13.5" x2="12" y2="22"/><line x1="10" y1="22" x2="14" y2="22"/></svg>',
    csp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><path d="M4 18Q8 6 12 8Q16 6 20 18"/><line x1="12" y1="8" x2="12" y2="18"/><circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>',
    hybrid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="8" r="2.5"/><line x1="7" y1="3" x2="7" y2="5"/><line x1="7" y1="11" x2="7" y2="13"/><line x1="2" y1="8" x2="4" y2="8"/><line x1="10" y1="8" x2="12" y2="8"/><circle cx="18" cy="10" r="1" fill="currentColor" stroke="none"/><line x1="18" y1="9" x2="18" y2="5"/><line x1="16.7" y1="10.75" x2="14" y2="12.5"/><line x1="19.3" y1="10.75" x2="22" y2="12.5"/><line x1="18" y1="11" x2="18" y2="21"/></svg>',
    plant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none"/></svg>',
    mfg:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M2 20V12l6-5v5l6-5v5h5V7"/><path d="M2 20h20"/></svg>',
    fuel:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 22C8.5 22 6 19.5 6 16c0-2 .7-3.5 2-5.5 0 2 1 3 1 3s.5-2.5 2.5-4.5c0 2 1 3 2 3s0-1.5 1.5-3.5c1.5 2.5 2 5 2 7 0 3.5-2.5 6-5 6z"/></svg>',
    capacity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    grid:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M6 3l-3 7h18l-3-7M3 10l3 11h12l3-11M12 3v7m0 11v3"/></svg>'
  };

  var TYPE_META = {
    solar:  { icon: ICONS.solar,  color: '#f59e0b', label: 'Solar PV',          std: 'IEC 61215' },
    wind:   { icon: ICONS.wind,   color: '#3b82f6', label: 'Wind',               std: 'IEC 61400' },
    hybrid: { icon: ICONS.hybrid, color: '#8b5cf6', label: 'Hybrid Solar+Wind',  std: 'IEC 61215 / IEC 61400' },
    csp:    { icon: ICONS.csp,    color: '#ef4444', label: 'CSP',                std: 'IEC 62862' }
  };

  /* ───────── helpers ───────── */

  function _haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _statusClass(status) {
    if (!status) return '';
    var s = status.toLowerCase();
    if (s === 'operational') return 'plant-card__status--operational';
    if (s.indexOf('partial') !== -1) return 'plant-card__status--partial';
    return 'plant-card__status--offline';
  }

  /* ───────── data loading ───────── */

  /**
   * Fetch both JSON data files and populate internal stores.
   * @returns {Promise<{sites: Array, plants: Array}>}
   */
  async function loadData() {
    var basePath = '';

    // Detect base path: support both root-relative and directory-relative loading
    if (typeof window !== 'undefined' && window.HELIOSCOUT_BASE) {
      basePath = window.HELIOSCOUT_BASE;
    }

    var [sitesRes, plantsRes] = await Promise.all([
      fetch(basePath + 'data/proposed-sites.json'),
      fetch(basePath + 'data/libya-plants.json')
    ]);

    if (!sitesRes.ok) throw new Error('Failed to load proposed-sites.json: ' + sitesRes.status);
    if (!plantsRes.ok) throw new Error('Failed to load libya-plants.json: ' + plantsRes.status);

    sites = await sitesRes.json();
    plants = await plantsRes.json();

    console.log('[Proposals] Loaded ' + sites.length + ' proposed sites, ' + plants.length + ' power plants');
    return { sites: sites, plants: plants };
  }

  /* ───────── site queries ───────── */

  /**
   * Return proposed sites, optionally filtered by type.
   * @param {'solar'|'wind'|'hybrid'|'csp'|null} filter
   * @returns {Array}
   */
  function getProposedSites(filter) {
    if (!filter) return sites.slice();
    return sites.filter(function (s) { return s.type === filter; });
  }

  /* ───────── plant queries ───────── */

  /**
   * Return all power plants.
   * @returns {Array}
   */
  function getPlants() {
    return plants.slice();
  }

  /**
   * Find a specific plant by id.
   * @param {string} id
   * @returns {Object|undefined}
   */
  function getPlantById(id) {
    return plants.find(function (p) { return p.id === id; });
  }

  /**
   * Find the nearest power plant to the given coordinates.
   * @param {number} lat
   * @param {number} lon
   * @returns {{plant: Object, distanceKm: number}|null}
   */
  function getNearestPlant(lat, lon) {
    if (plants.length === 0) return null;

    var best = null;
    var bestDist = Infinity;

    plants.forEach(function (p) {
      var d = _haversineKm(lat, lon, p.lat, p.lon);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    });

    return best ? { plant: best, distanceKm: Math.round(bestDist * 10) / 10 } : null;
  }

  /* ───────── HTML card generators ───────── */

  /**
   * Generate an HTML card for a proposed renewable energy site.
   * @param {Object} site
   * @returns {string} HTML string
   */
  function generateSiteCard(site) {
    var meta = TYPE_META[site.type] || TYPE_META.solar;

    return (
      '<div class="site-card" data-id="' + site.id + '" style="--accent:' + meta.color + '">' +
          '<div class="site-card__icon" aria-hidden="true" style="color:' + meta.color + '">' + meta.icon + '</div>' +
        '<div class="site-card__content">' +
          '<h4 class="site-card__name">' + site.name + '</h4>' +
          '<span class="site-card__type" style="background:' + meta.color + '22;color:' + meta.color + '">' + meta.label + '</span>' +
          '<p class="site-card__desc">' + site.description + '</p>' +
          '<div class="site-card__meta">' +
            '<span class="site-card__meta-item"><span class="card-detail-icon">' + ICONS.capacity + '</span>' + site.estimatedCapacityMW + ' MW</span>' +
            '<span class="site-card__meta-item"><span class="card-detail-icon">' + ICONS.grid + '</span>' + site.nearestGrid + '</span>' +
          '</div>' +
          (site.challenges
            ? '<p class="site-card__challenges"><strong>Challenges:</strong> ' + site.challenges + '</p>'
            : '') +
        '</div>' +
        '<button class="site-card__assess" data-lat="' + site.lat + '" data-lon="' + site.lon + '" title="Run assessment at this location">' +
          'Assess →' +
        '</button>' +
      '</div>'
    );
  }

  /**
   * Generate an HTML card for a GECOL power plant.
   * @param {Object} plant
   * @returns {string} HTML string
   */
  function generatePlantCard(plant) {
    return (
      '<div class="plant-card" data-id="' + plant.id + '">' +
        '<div class="plant-card__icon" aria-hidden="true" style="color:#f59e0b">' + ICONS.plant + '</div>' +
        '<div class="plant-card__content">' +
          '<h4 class="plant-card__name">' + plant.name + '</h4>' +
          (plant.nameAr ? '<span class="plant-card__name-ar">' + plant.nameAr + '</span>' : '') +
          '<div class="plant-card__specs">' +
            '<span class="plant-card__spec">' + plant.capacityMW + ' MW</span>' +
            '<span class="plant-card__spec">' + plant.config + '</span>' +
            '<span class="plant-card__spec">' + (plant.turbineClass || '—') + '</span>' +
            '<span class="plant-card__spec">Built ' + (plant.yearBuilt || '—') + '</span>' +
          '</div>' +
          '<div class="plant-card__details">' +
            '<span class="plant-card__detail"><span class="card-detail-icon">' + ICONS.mfg + '</span>' + plant.manufacturer + '</span>' +
            '<span class="plant-card__detail"><span class="card-detail-icon">' + ICONS.fuel + '</span>' + plant.fuel + '</span>' +
            '<span class="plant-card__detail ' + _statusClass(plant.status) + '"><span class="status-dot"></span>' + plant.status + '</span>' +
          '</div>' +
          (plant.notes ? '<p class="plant-card__notes">' + plant.notes + '</p>' : '') +
        '</div>' +
      '</div>'
    );
  }

  /* ───────── Leaflet marker icons ───────── */

  /**
   * Create a Leaflet DivIcon for a power plant marker.
   * Uses a distinct style from assessment/proposal markers.
   * @param {Object} plant
   * @returns {L.DivIcon}
   */
  function getPlantMarkerIcon(plant) {
    if (typeof L === 'undefined') {
      console.warn('[Proposals] Leaflet not loaded; cannot create DivIcon');
      return null;
    }

    var statusColor = '#10b981'; // operational green
    if (plant.status && plant.status.toLowerCase().indexOf('partial') !== -1) {
      statusColor = '#f59e0b'; // amber
    } else if (plant.status && plant.status.toLowerCase() === 'offline') {
      statusColor = '#ef4444'; // red
    }

    var html =
      '<div class="plant-marker" style="--status-color:' + statusColor + '; color:#f59e0b">' +
        '<div class="plant-marker__icon">' + ICONS.plant + '</div>' +
        '<div class="plant-marker__label">' + plant.capacityMW + ' MW</div>' +
      '</div>';

    return L.divIcon({
      className: 'plant-marker-container',
      html: html,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -24]
    });
  }

  /**
   * Create a Leaflet DivIcon for a proposed RE site marker.
   * @param {Object} site
   * @returns {L.DivIcon}
   */
  function getSiteMarkerIcon(site) {
    if (typeof L === 'undefined') {
      console.warn('[Proposals] Leaflet not loaded; cannot create DivIcon');
      return null;
    }

    var meta = TYPE_META[site.type] || TYPE_META.solar;

    var html =
      '<div class="proposal-marker" style="--accent:' + meta.color + '; color:' + meta.color + '">' +
        '<div class="proposal-marker__icon">' + meta.icon + '</div>' +
      '</div>';

    return L.divIcon({
      className: 'proposal-marker-container',
      html: html,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20]
    });
  }

  /* ───────── exposed interface ───────── */

  return {
    sites: sites,
    plants: plants,
    loadData: loadData,
    getProposedSites: getProposedSites,
    getPlants: getPlants,
    getPlantById: getPlantById,
    getNearestPlant: getNearestPlant,
    generateSiteCard: generateSiteCard,
    generatePlantCard: generatePlantCard,
    getPlantMarkerIcon: getPlantMarkerIcon,
    getSiteMarkerIcon: getSiteMarkerIcon
  };
})();
