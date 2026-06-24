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
- **Site comparison** — pin up to 5 assessed sites, compare side-by-side, export to CSV.
- **Libya & Universal modes** — full financial + fleet tooling in Libya; resource-only
  assessment anywhere in the world.

## Architecture

```
backend/   Node.js + Express API (resource fetch + scoring)
frontend/  Static vanilla-JS app (Leaflet map, Chart.js, financial engine)
```

Data sources: NASA POWER (climatology), EU PVGIS (PV output), Open-Meteo (wind cross-check /
elevation). All resolved server-side via `GET /api/assess?lat=&lon=`.

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
| `frontend/js/financial.js` | Heat-rate derating, gas displacement, LCOE, NPV |
| `frontend/js/reconciliation.js` | Fleet gas reconciliation vs. national figure |
| `frontend/js/compare.js` | Pin / compare / CSV export |
| `frontend/data/libya-plants.json` | GECOL thermal fleet (turbine class, config, vintage) |
| `frontend/data/proposed-sites.json` | Candidate renewable sites |

## Methodology notes

- **Wind** uses NASA POWER's multi-decade climatology (WS10M/WS50M), deriving the local shear
  exponent `α = ln(v50/v10)/ln(5)` and extrapolating to a 100 m hub. Open-Meteo's short-term
  forecast is retained only as a cross-check.
- **Heat-rate derating** combines manufacturer ISO specs with an ambient derate applied at the
  warm-season temperature (not the annual mean) and a vintage-based degradation band.
- **Gas valuation** is shown at both administered-domestic and export-parity prices; the gap is
  the policy argument.
- Geothermal is intentionally omitted — there is no defensible open data to support it for Libya.
