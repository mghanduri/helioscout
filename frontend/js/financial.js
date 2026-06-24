window.HelioScout = window.HelioScout || {};

/**
 * Financial Calculation Engine (Gas Displacement & LCOE)
 * Specially designed for the Libyan NOC competition context.
 */
HelioScout.Financial = (function() {

    // Database of common turbine architectures in North Africa
    const TURBINE_DATABASE = [
        { id: 'ge-9e', name: 'GE Frame 9E', manufacturer: 'GE', class: 'E-class', config: 'OCGT', isoHeatRate: 10800, efficiencyISO: 0.316, typicalCapacityMW: 125 },
        { id: 'ge-9f', name: 'GE Frame 9F', manufacturer: 'GE', class: 'F-class', config: 'OCGT', isoHeatRate: 9720, efficiencyISO: 0.351, typicalCapacityMW: 255 },
        { id: 'siemens-sgt5-2000e', name: 'Siemens SGT5-2000E', manufacturer: 'Siemens', class: 'E-class', config: 'OCGT', isoHeatRate: 10200, efficiencyISO: 0.335, typicalCapacityMW: 187 },
        { id: 'siemens-sgt5-4000f', name: 'Siemens SGT5-4000F', manufacturer: 'Siemens', class: 'F-class', config: 'OCGT', isoHeatRate: 9500, efficiencyISO: 0.359, typicalCapacityMW: 292 },
        { id: 'ccgt-eclass', name: 'CCGT (E-class)', manufacturer: 'Various', class: 'E-class', config: 'CCGT', isoHeatRate: 7200, efficiencyISO: 0.474, typicalCapacityMW: 375 },
        { id: 'ccgt-fclass', name: 'CCGT (F-class)', manufacturer: 'Various', class: 'F-class', config: 'CCGT', isoHeatRate: 6800, efficiencyISO: 0.502, typicalCapacityMW: 580 },
        { id: 'generic-ocgt', name: 'Generic OCGT (older)', manufacturer: 'Various', class: 'Legacy', config: 'OCGT', isoHeatRate: 11500, efficiencyISO: 0.296, typicalCapacityMW: 100 },
    ];

    /**
     * Derate turbine heat rate based on ambient temperature and age
     * Gas turbines lose efficiency in heat and over time.
     */
    function derateTurbineHeatRate(isoHeatRate, ambientTempC, ageYears, config) {
        let adjustedHeatRate = isoHeatRate;
        
        // 1. Ambient Temperature Derating
        // ISO conditions are 15°C. Heat rate increases (efficiency drops) by ~0.35% per °C above 15.
        if (ambientTempC > 15) {
            const tempDiff = ambientTempC - 15;
            const tempPenalty = 1 + (tempDiff * 0.0035);
            adjustedHeatRate *= tempPenalty;
        }

        // 2. Age Degradation
        // ~0.3% per year for first 10 years, ~0.5% after, capped at 15%
        let agePenalty = 1.0;
        if (ageYears <= 10) {
            agePenalty += (ageYears * 0.003);
        } else {
            agePenalty += (10 * 0.003) + ((ageYears - 10) * 0.005);
        }
        agePenalty = Math.min(agePenalty, 1.15); // Cap at 15% degradation
        
        adjustedHeatRate *= agePenalty;

        return adjustedHeatRate; // BTU/kWh
    }

    return {
        getTurbineDatabase() {
            return TURBINE_DATABASE;
        },

        getTurbineById(id) {
            return TURBINE_DATABASE.find(t => t.id === id) || TURBINE_DATABASE.find(t => t.id === 'generic-ocgt');
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
            
            // CO2 emissions: ~53.07 kg CO2 per MMBtu of natural gas
            const co2AvoidedTonnes = (gasFreedMMBtu * 53.07) / 1000;

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
            
            let capexPerKW, opexPerKWYr, lifeYears;
            const discountRate = 0.08; // 8%

            if (technology === 'solar') {
                capexPerKW = 700;
                opexPerKWYr = 10;
                lifeYears = 25;
            } else if (technology === 'wind') {
                capexPerKW = 1300;
                opexPerKWYr = 35;
                lifeYears = 25;
            } else if (technology === 'csp') {
                capexPerKW = 3500;
                opexPerKWYr = 50;
                lifeYears = 30;
            }

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
            const discountRate = 0.08;
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
        }
    };
})();
