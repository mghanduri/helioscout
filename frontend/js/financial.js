window.HelioScout = window.HelioScout || {};

/**
 * Financial Calculation Engine (Gas Displacement & LCOE)
 * Specially designed for the Libyan NOC competition context.
 */
HelioScout.Financial = (function() {

    // All financial constants — the turbine database, derating coefficients,
    // LCOE/NPV parameters, gas prices and the CO2 factor — come from the dated,
    // sourced assumptions register (assumptions.json, financial section), loaded
    // by js/assumptions.js. Read at call time so the register stays the single
    // source of truth.
    function fin() {
        return HelioScout.requireAssumptions().financial;
    }

    /**
     * Derate turbine heat rate based on ambient temperature and age
     * Gas turbines lose efficiency in heat and over time. Coefficients are
     * defined in assumptions.financial.derating.
     */
    function derateTurbineHeatRate(isoHeatRate, ambientTempC, ageYears, config) {
        const d = fin().derating;
        let adjustedHeatRate = isoHeatRate;

        // 1. Ambient Temperature Derating
        // ISO conditions are isoBaselineC. Heat rate rises by ambientPctPerC per °C above it.
        if (ambientTempC > d.isoBaselineC) {
            const tempDiff = ambientTempC - d.isoBaselineC;
            const tempPenalty = 1 + (tempDiff * d.ambientPctPerC);
            adjustedHeatRate *= tempPenalty;
        }

        // 2. Age Degradation
        // ageEarlyPctPerYr for the first ageEarlyYears, then ageLatePctPerYr, capped at ageCap.
        let agePenalty = 1.0;
        if (ageYears <= d.ageEarlyYears) {
            agePenalty += (ageYears * d.ageEarlyPctPerYr);
        } else {
            agePenalty += (d.ageEarlyYears * d.ageEarlyPctPerYr) + ((ageYears - d.ageEarlyYears) * d.ageLatePctPerYr);
        }
        agePenalty = Math.min(agePenalty, 1 + d.ageCap); // Cap degradation

        adjustedHeatRate *= agePenalty;

        return adjustedHeatRate; // BTU/kWh
    }

    return {
        getTurbineDatabase() {
            return fin().turbines;
        },

        getTurbineById(id) {
            const turbines = fin().turbines;
            return turbines.find(t => t.id === id) || turbines.find(t => t.id === 'generic-ocgt');
        },

        /**
         * Map a plant's turbine class + configuration to the closest TURBINE_DATABASE id.
         * Used to auto-select the displaced turbine from the nearest GECOL plant.
         * @param {string} turbineClass — e.g. 'E-class', 'F-class', 'Legacy'
         * @param {string} config — 'OCGT' or 'CCGT'
         * @returns {string} turbine id
         */
        classConfigToTurbineId(turbineClass, config) {
            const cls = (turbineClass || '').toLowerCase();
            const cfg = (config || '').toUpperCase();
            const fClass = cls.indexOf('f') !== -1; // 'f-class'
            const eClass = cls.indexOf('e') !== -1; // 'e-class'

            if (cfg === 'CCGT') {
                return fClass ? 'ccgt-fclass' : 'ccgt-eclass';
            }
            // OCGT (default)
            if (fClass) return 'siemens-sgt5-4000f'; // representative F-class OCGT
            if (eClass) return 'siemens-sgt5-2000e'; // representative E-class OCGT
            return 'generic-ocgt'; // legacy / unknown
        },

        /**
         * Public wrapper around the internal ambient + age derating, used by the
         * fleet reconciliation module. Returns BTU/kWh.
         */
        deriveFleetHeatRate(isoHeatRate, ambientTempC, ageYears, config) {
            return derateTurbineHeatRate(isoHeatRate, ambientTempC, ageYears, config);
        },

        /**
         * Calculate gas displaced by renewable energy generation
         */
        calculateGasDisplacement(annualMWhRenewable, turbineId, ambientTempC, ageYears, domPriceUSD, expPriceUSD) {
            const turbine = this.getTurbineById(turbineId);
            
            // Get actual heat rate considering local conditions
            const adjustedHeatRate = derateTurbineHeatRate(turbine.isoHeatRate, ambientTempC, ageYears, turbine.config);
            
            // 1 MWh = 1000 kWh. Total BTUs = MWh * 1000 * HeatRate
            const totalBtu = annualMWhRenewable * 1000 * adjustedHeatRate;
            
            // 1 MMBtu = 1,000,000 BTU
            const gasFreedMMBtu = totalBtu / 1000000;
            
            // CO2 emissions factor (kg CO2 per MMBtu of natural gas) from the register.
            const co2AvoidedTonnes = (gasFreedMMBtu * fin().co2FactorKgPerMMBtu.value) / 1000;

            // Financial Value
            const domesticValue = gasFreedMMBtu * domPriceUSD;
            const exportValue = gasFreedMMBtu * expPriceUSD;

            return {
                turbineName: turbine.name,
                adjustedHeatRate,
                gasFreedMMBtu,
                co2AvoidedTonnes,
                domesticValue,
                exportValue
            };
        },

        /**
         * Calculate Levelized Cost of Energy (simplified)
         */
        calculateLCOE(technology, capacityMW, capacityFactorPercent) {
            const capacityKW = capacityMW * 1000;
            const annualMWh = capacityMW * 8760 * (capacityFactorPercent / 100);

            const F = fin();
            const discountRate = F.discountRate.value;
            const t = F.tech[technology] || {};
            const capexPerKW = t.capexPerKW;
            const opexPerKWYr = t.opexPerKWYr;
            const lifeYears = t.lifeYears;

            const totalCapex = capexPerKW * capacityKW;
            const annualOpex = opexPerKWYr * capacityKW;

            // CRF = r(1+r)^n / ((1+r)^n - 1)
            const crf = (discountRate * Math.pow(1 + discountRate, lifeYears)) / (Math.pow(1 + discountRate, lifeYears) - 1);
            
            // LCOE = (CAPEX * CRF + OPEX) / Annual_Generation
            const annualizedCost = (totalCapex * crf) + annualOpex;
            const lcoe = annualizedCost / annualMWh;

            return {
                lcoe, // USD/MWh
                totalCapex,
                annualOpex,
                annualMWh
            };
        },

        /**
         * Calculate NPV based on export parity revenue
         */
        calculateNPV(capex, annualRevenue, annualOpex, lifeYears) {
            const discountRate = fin().discountRate.value;
            const annualCashFlow = annualRevenue - annualOpex;
            
            let npv = -capex;
            for (let year = 1; year <= lifeYears; year++) {
                npv += annualCashFlow / Math.pow(1 + discountRate, year);
            }

            const paybackYears = capex / annualCashFlow;

            return {
                npv,
                annualCashFlow,
                paybackYears: paybackYears > lifeYears ? null : paybackYears
            };
        },

        /**
         * NPV sensitivity to the export gas price — the dominant NPV driver.
         * Recomputes NPV at low/expected/high export prices (±sensitivityPct from
         * the register) so officials see a range, not a single point estimate.
         * @returns {{expected:number, low:number, high:number, prices:{low,expected,high}, pct:number}}
         */
        calculateNPVSensitivity(opts) {
            const { capex, annualOpex, gasFreedMMBtu, exportPrice, lifeYears } = opts;
            const pct = fin().gasPrices.sensitivityPct;
            const prices = {
                low: exportPrice * (1 - pct),
                expected: exportPrice,
                high: exportPrice * (1 + pct)
            };
            const npvAt = (price) =>
                this.calculateNPV(capex, gasFreedMMBtu * price, annualOpex, lifeYears).npv;
            return {
                low: npvAt(prices.low),
                expected: npvAt(prices.expected),
                high: npvAt(prices.high),
                prices,
                pct
            };
        }
    };
})();
