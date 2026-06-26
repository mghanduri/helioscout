# HelioScout

A renewable-energy siting and financial-assessment tool for Libya. Click anywhere on the
map to assess solar, wind, and CSP resource from live datasets, then quantify the **natural
gas freed for export** by displacing thermal generation with renewables — valued at both
subsidised-domestic and export-parity prices.

Built for the Libyan NOC context: the pitch isn't "clean energy," it's *liberated export
volume*. Every MMBtu of gas not burned for domestic power is gas sold abroad.

## Features

- **Resource assessment** — solar (GHI/DNI, PV yield, optimal tilt), wind (hub-height speed
  from NASA POWER long-term climatology with derived shear), and CSP (DNI suitability), each
  scored 0–100 with an overall recommendation.
- **Gas-displacement finance** — per-site gas freed, domestic vs. export-parity value, LCOE,
  CO₂ avoided, NPV and payback. The displaced turbine and its age are **auto-inferred from the
  nearest GECOL plant** (turbine class + vintage), with manual override.
- **Fleet validation** — bottom-up estimate of national gas-to-power consumption (per-plant
  derived heat rates × utilisation) reconciled against an independent published figure, so the
  heat-rate methodology is empirically anchored, not asserted.
- **Grid-connection economics** — the existing HV transmission network is on the map, and every
  assessed site reports its distance to the nearest line, the **cost to build a connecting line**
  (distance × $/km by voltage + substation bay), and the **delivered LCOE after transmission**
  (the connection CapEx annualised onto the generation LCOE).
- **Land/space feasibility** — a population-density heatmap flags sites that are physically
  infeasible for a utility-scale farm (built-up land) and gives an indicative max size/output for
  open parcels (~35 MW/km²).
- **Site comparison** — pin up to 5 assessed sites, compare side-by-side, export to CSV
  (now including delivered LCOE, grid distance, connection CapEx and land feasibility).
- **Libya & Universal modes** — full financial + fleet tooling in Libya; resource-only
  assessment anywhere in the world.

## Architecture

```
backend/   Node.js + Express API (resource fetch + scoring)
frontend/  Static vanilla-JS app (Leaflet map, Chart.js, financial engine)
```

Data sources: NASA POWER (climatology), EU PVGIS (PV output), Open-Meteo (wind cross-check /
elevation), resolved server-side via `GET /api/assess?lat=&lon=`. Map layers are pre-baked
into `frontend/data/` by the generator scripts: the **transmission network** from OpenStreetMap
via the Overpass API (`power=line`/`substation`, ≥66 kV), and the **population-density** field
from a kernel model over GeoNames / UN World Urbanization Prospects city populations.

## Run locally

**1. Backend**

```bash
cd backend
cp .env.example .env        # optional; defaults to PORT=3000
npm install
npm start                   # -> http://localhost:3000  (GET /health to check)
```

**2. Frontend** (any static server)

```bash
cd frontend
npx serve .                 # or: python3 -m http.server 8080
```

Open the served URL. When served from `localhost`, the frontend automatically targets the
backend at `http://localhost:3000`.

## Deploy

- **Backend** → any Node host (e.g. Railway). It only needs `PORT`.
- **Frontend** → any static host (e.g. Vercel; `frontend/vercel.json` is included).
- **Point the frontend at the deployed backend** — choose one (see `frontend/js/config.js`):
  - set `PROD_BACKEND_URL` in `frontend/js/config.js`, **or**
  - inject `window.__BACKEND_URL` at deploy time, **or**
  - append `?api=https://your-backend` to the URL (handy for testing).

## Project layout

| Path | Purpose |
|------|---------|
| `backend/services/dataFetcher.js` | Pulls NASA POWER / PVGIS / Open-Meteo |
| `backend/services/scoringEngine.js` | Scores solar / wind / CSP |
| `frontend/js/config.js` | Resolves `BACKEND_URL` |
| `frontend/js/financial.js` | Heat-rate derating, gas displacement, LCOE, NPV, transmission & farm sizing |
| `frontend/js/transmission.js` | Loads the grid; nearest-line distance to any point |
| `frontend/js/population-overlay.js` | Population-density heatmap (RasterOverlay) + feasibility sampling |
| `frontend/js/reconciliation.js` | Fleet gas reconciliation vs. national figure |
| `frontend/js/compare.js` | Pin / compare / CSV export |
| `frontend/data/libya-plants.json` | GECOL thermal fleet (turbine class, config, vintage) |
| `frontend/data/proposed-sites.json` | Candidate renewable sites |
| `frontend/data/libya-transmission.json` | HV transmission network (OSM/Overpass) — `node scripts/generate-transmission.js` |
| `frontend/data/libya-population.json` | Population-density grid + city list — `node scripts/generate-population-grid.js` |

## Methodology notes

- **Wind** uses NASA POWER's multi-decade climatology (WS10M/WS50M), deriving the local shear
  exponent `α = ln(v50/v10)/ln(5)` and extrapolating to a 100 m hub. Open-Meteo's short-term
  forecast is retained only as a cross-check.
- **Heat-rate derating** combines manufacturer ISO specs with an ambient derate applied at the
  warm-season temperature (not the annual mean) and a vintage-based degradation band.
- **Gas valuation** is shown at both administered-domestic and export-parity prices; the gap is
  the policy argument.
- **Delivered LCOE** adds a transmission term to the generation LCOE: the new-line CapEx
  (`distance × $/km` by voltage `+` a fixed substation-bay cost) is annualised at the same
  discount rate / asset life and divided by annual generation. All cost benchmarks live in the
  dated, sourced assumptions register (`assumptions.json`, `grid` section) — not hardcoded.
- **Land feasibility** bands the modelled population density: above the built-up threshold a site
  is treated as having no contiguous open land for a utility-scale farm; indicative sizing uses a
  PV land-power density of ~35 MW/km² (NREL total-area footprint).
- The transmission layer keeps only confirmed transmission-level lines (≥66 kV) so every rendered
  line carries a known, priceable voltage; sub-transmission/distribution is excluded.
- Geothermal is intentionally omitted — there is no defensible open data to support it for Libya.
