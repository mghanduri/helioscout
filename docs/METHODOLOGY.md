# HelioScout — Methodology Note

**Version:** matches the assumptions register (`assumptions.json` → `meta.version`).
**Status:** English. An Arabic translation and a formal branded export are planned
(roadmap W2 / W7 / W8) and are not part of this note.

This note describes how HelioScout produces every number it shows: the data
sources, the resource-scoring logic and the basis for each threshold, the
gas-displacement and financial calculations, and the fleet reconciliation that
anchors the heat-rate method against an independent figure. It exists so the tool
can be cited in a policy paper and defended under technical review.

All constants referenced here live in the dated, sourced **assumptions register**
(`assumptions.json`), which both the backend scoring engine and the frontend
financial engine read at runtime. Where a value is marked `UNSOURCED` in that
file, it has not been independently verified and must be confirmed by the
assumptions owner before official use.

---

## 1. Data sources

| Source | Used for | Dataset / version | Notes |
|---|---|---|---|
| **NASA POWER** | GHI, DNI, 10 m & 50 m wind, temperature | Climatology (multi-decade monthly normals) | Primary resource source. |
| **EU PVGIS** | PV energy yield, optimal tilt | API **v5.3**, `PVcalc`, fixed mount, 14% system loss | When unavailable/out of coverage, PV yield falls back to NASA GHI (see §3.1). |
| **Open-Meteo** | Wind cross-check, elevation | Forecast (14-day hourly wind at 10/80/100/120 m) | Cross-check and elevation only — never the basis for the wind score. |
| **Nominatim (OpenStreetMap)** | Place names (reverse geocode + search) | Proxied server-side with attribution | Unresolved locations are labelled honestly by coordinate. |

Each assessment response carries a `provenance` block (source, dataset version,
retrieval timestamp, assumptions-register version) that the UI surfaces in the
**Data sources & assumptions** panel.

---

## 2. Resource scoring and threshold basis

Scores are 0–100 per technology with an overall weighted recommendation. The
band cut-offs are defined in `assumptions.scoring`; the basis for each is recorded
in `assumptions.scoring._basis` and summarised here.

### 2.1 Solar (GHI)

Global Horizontal Irradiance (kWh/m²/day) is mapped to bands from *Exceptional*
(> 6.5) down to *Poor* (≤ 2.5). The cut-offs are a siting heuristic calibrated to
Libya's resource range — much of the country exceeds 6 kWh/m²/day GHI (Global
Solar Atlas / NASA POWER). A warm-climate temperature penalty reduces the score
when the annual mean exceeds 25 °C (moderate) and 28 °C (high), reflecting PV
efficiency loss at elevated cell temperature.

### 2.2 Wind (100 m hub height)

Mean wind speed extrapolated to a 100 m hub is mapped to the **IEC 61400-1** wind
turbine classes (Class I down to Class IV), with ~6 m/s as the commonly cited
floor for commercial onshore viability. The shear used for extrapolation is
derived from the data, not assumed (see §3.2).

### 2.3 CSP (annual DNI)

Annual Direct Normal Irradiance (kWh/m²/yr) is banded against the widely cited CSP
viability range: ~2000 kWh/m²/yr is the practical minimum for bankable CSP and
~2500+ kWh/m²/yr is considered excellent (IRENA / NREL / SolarPACES CSP resource
guidance).

### 2.4 Overall score and recommendation

The composite score weights solar 50%, wind 35%, CSP 15% when all three are
available (solar 60% / CSP 40% when wind data is absent). The recommendation
favours wind when it beats solar by a set margin, suggests a hybrid when both
solar and wind clear a threshold, and flags CSP when its score is excellent. All
of these parameters are in `assumptions.scoring` rather than hardcoded.

---

## 3. Derived methods

### 3.1 PV yield fallback

When PVGIS returns no result, annual PV yield is estimated as
`GHI_annual × 365 × pvFallbackEfficiency` (efficiency factor in the register).
The provenance panel marks this case explicitly so a fallback estimate is never
mistaken for a PVGIS figure.

### 3.2 Wind shear

Rather than assume a fixed exponent, the local power-law shear exponent is derived
from the NASA 10 m → 50 m speed ratio,
`α = ln(v₅₀/v₁₀) / ln(50/10)`, clamped to a physically reasonable range, then used
to extrapolate the 50 m speed to a 100 m hub. The default 1/7 exponent (α = 0.143)
is used only when the ratio cannot be derived.

### 3.3 Gas-turbine heat-rate derating

Displaced thermal generation is modelled per turbine class. Manufacturer ISO-
condition heat rates are derated for (a) warm-season ambient temperature — heat
rate rises by a fixed percentage per °C above the 15 °C ISO baseline — and (b)
vintage degradation, at one rate for the first years of life and a higher rate
thereafter, capped. Derating is applied at the warm-season representative
temperature, not the annual mean, to reflect realistic operating conditions. All
coefficients are in `assumptions.financial.derating`.

---

## 4. Financial methodology

### 4.1 Gas displacement and valuation

Renewable generation displaces gas-fired generation. Gas freed (MMBtu/yr) =
`renewable_MWh × 1000 × derated_heat_rate`. The freed gas is valued at **two**
prices — the administered domestic price and the export-parity price — and the gap
between them is the policy argument. CO₂ avoided is computed from the freed gas
using the natural-gas emission factor in the register (US EPA GHG Emission Factors
Hub, ~53.06 kg CO₂/MMBtu).

### 4.2 LCOE

Levelised Cost of Energy uses a Capital Recovery Factor,
`CRF = r(1+r)ⁿ / ((1+r)ⁿ − 1)`, with the discount rate `r`, per-technology
capex/opex and project life all drawn from `assumptions.financial`. The capex/opex
figures are indicative (IRENA / NREL ATB ranges) pending owner confirmation for
Libya.

### 4.3 NPV, payback and sensitivity

NPV discounts annual cash flow (export-parity revenue minus opex) over the project
life at the register discount rate. Because gas price is the dominant driver,
HelioScout reports a **range, not a point estimate**: NPV is recomputed at low /
expected / high export prices (± the register's `sensitivityPct`, currently ±25%),
and the UI shows the resulting low–high band alongside the headline figure.

---

## 5. Fleet reconciliation (validation)

The per-plant heat-rate method is not merely asserted — it is reconciled against an
independent figure. A bottom-up estimate of national gas-to-power consumption is
built from the GECOL thermal fleet (per-plant derated heat rate × capacity ×
8,760 h × fleet utilisation) and compared to a **named independent reference of
~320 Bcf/yr** (order-of-magnitude anchor from EIA Libya country analysis / the
Statistical Review of World Energy; Libyan generation is ~99% gas-fired). The
method is reported as *validated* when the bottom-up estimate falls within ±25% of
that reference. Fleet utilisation is the principal unknown and is exposed as a
slider; the reference and the validation band are in `assumptions.reconciliation`.

---

## 6. Provenance and assumptions ownership

- Every figure is traceable through the on-screen **Data sources & assumptions**
  panel to a named dataset/version and an as-of date.
- All numeric assumptions live in one versioned file (`assumptions.json`); the
  per-deploy copies are generated from it.
- The register names an **owner** responsible for keeping prices, the discount
  rate, capex/opex and the GECOL plant mapping current and dated. Government
  numbers go stale; this is a standing responsibility, not a one-off.

---

## 7. Scope notes

- **Geothermal is intentionally omitted** — there is no defensible open dataset for
  Libya.
- Climatology-based resource estimates carry inherent spread; the financial
  sensitivity range (§4.3) is the first-order treatment of uncertainty. A fuller
  uncertainty treatment and ground-truth validation against known Libyan sites are
  future work (roadmap W6).
