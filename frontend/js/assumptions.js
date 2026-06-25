window.HelioScout = window.HelioScout || {};

/**
 * Assumptions register loader (frontend side).
 *
 * Fetches the served copy of the assumptions register (data/assumptions.json,
 * produced from the canonical repo-root assumptions.json by the build) and
 * exposes it as HelioScout.Assumptions so the financial and reconciliation
 * engines read dated, sourced constants instead of hardcoded literals.
 *
 * Call HelioScout.loadAssumptions() once at app start and await it before any
 * financial/reconciliation calculation. The financial engines read
 * HelioScout.Assumptions at call time and throw a clear error if it is missing.
 */
(function () {
  let loadPromise = null;

  HelioScout.Assumptions = null;

  HelioScout.loadAssumptions = function () {
    if (loadPromise) return loadPromise;
    loadPromise = fetch('data/assumptions.json')
      .then(function (res) {
        if (!res.ok) throw new Error('assumptions.json HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        HelioScout.Assumptions = data;
        return data;
      })
      .catch(function (err) {
        console.error('[assumptions] failed to load register:', err);
        throw err;
      });
    return loadPromise;
  };

  /** Convenience accessor that throws a clear error if the register is not loaded. */
  HelioScout.requireAssumptions = function () {
    if (!HelioScout.Assumptions) {
      throw new Error('Assumptions register not loaded — call HelioScout.loadAssumptions() at app start.');
    }
    return HelioScout.Assumptions;
  };
})();
