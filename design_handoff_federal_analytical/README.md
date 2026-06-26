# Handoff: HelioScout — Federal Analytical Redesign

## Overview
HelioScout is a renewable-energy siting and financial-assessment tool for Libya. Users click anywhere on a map to assess solar, wind, and CSP potential, then evaluate the **financial case for displacing thermal (gas) generation** with renewables — the core value proposition being the **monetary value of natural gas freed up for export**.

This redesign ("Federal Analytical") restyles the existing app into a dense, government/utility-analyst register and — critically — **promotes the gas-displacement financial analysis to a first-class assessment tab**, which the original UI under-emphasized. It is the chosen direction (Direction A) out of three explored concepts.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype demonstrating intended look, layout, and behavior. They are **not production code to copy directly**.

The existing HelioScout codebase (in the attached `helioscout/` folder) is a **vanilla JS + Leaflet** front-end (`frontend/index.html`, `frontend/js/*.js`) with a Node/Express backend. The task is to **recreate this redesign within that existing environment**, reusing its established patterns:
- Leaflet map + layer controls (`frontend/js/map.js`)
- The real financial engine (`frontend/js/financial.js`) — already implements gas-displacement, LCOE, NPV
- The real data files (`frontend/data/*.json`) — GECOL plants, proposed sites, GHI/wind grids

The HTML prototype's finance math is a **faithful port of `financial.js`** — use the real module, not the port.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are specified below and should be matched closely. Recreate the UI pixel-accurately using the codebase's existing libraries (Leaflet for the map, the existing chart approach for sparklines/bars).

## Layout — Overall Shell
A fixed 1440px-wide application frame, full-height column:

```
┌─────────────────────────────────────────────────────────────┐
│ TOPBAR  56px  (logo · search · mode toggle · user)            │
├─────────────────────────────────────────────────────────────┤
│ SOURCE STRIP  26px  (monospace provenance line) — optional    │
├──────────┬───────────────────────────────┬───────────────────┤
│ LEFT     │ MAP (flex:1)                  │ RIGHT RAIL        │
│ RAIL     │                               │ Site Assessment   │
│ 248px    │                               │ 392px             │
│ layers   │                               │ tabs + content    │
│ legend   │                               │                   │
├──────────┴───────────────────────────────┴───────────────────┤
│ BOTTOM TABLE  198px  (Proposed sites, filterable)             │
└─────────────────────────────────────────────────────────────┘
```
Body region between source strip and bottom table is `display:flex; flex:1; min-height:0`. Left rail and right rail are `flex:none` fixed widths; map is `flex:1`.

## Screens / Views
There is one primary screen (the assessment workspace) with five swappable tabs in the right rail and several interactive sub-regions.

### Topbar (height 56px, `#fff`, bottom border `#b9c6d2`, padding 0 18px, `gap:18px`)
- **Logo lockup**: sun-burst SVG icon (22px, `#103a63`) + wordmark "HelioScout" (Libre Franklin 800, 17px, letter-spacing −0.01em) + 1px divider + two-line uppercase tag "Renewable Siting & Gas-Displacement" (Libre Franklin 600, 9.5px, letter-spacing 0.14em, `#7a8794`).
- **Search field**: max-width 430px, height 34px, `#f4f7f9` bg, 1px `#d3dce4` border, radius 2px. Magnifier icon + placeholder "Search location or paste coordinates…" (IBM Plex Mono 12px, `#90a0ae`, ellipsis-truncated).
- **Mode toggle** (right): segmented control, height 32px, 1px `#d3dce4` border, radius 2px. Two buttons "Libya mode" / "Universal". Active = `#103a63` bg / `#fff` text; inactive = `#fff` bg / `#5a6b7b` text. Buttons: Libre Franklin 600, 11px, padding 0 13px.
- **User chip**: 30px circle avatar `#103a63` bg, white "RA" initials (700, 12px) + name "R. Almasi" (600, 12px) / role "Program Analyst · NOC" (500, 10px, `#8595a4`).

### Source strip (height 26px, `#f4f7f9`, bottom border `#d3dce4`) — toggleable via `showSourceStrip`
Two monospace lines (IBM Plex Mono, 10.5px, `#6b7a88`), space-between:
- Left: `SOURCE: NASA POWER v9 climatology · EU PVGIS · GECOL fleet register · IEC 61215 / 61400 methodology`
- Right: `UTC 14:22:06 · CRS EPSG:4326 · LAST SYNC 00:14`

### Left rail (width 248px, `#fff`, right border `#d3dce4`, scrollable column)
- **Section title** "Map Layers" (Libre Franklin 700, 10px, letter-spacing 0.14em, uppercase, `#7a8794`, padding 14px 16px 8px).
- **Layer groups** each preceded by a sub-label (700, 9px, letter-spacing 0.12em, uppercase, `#a6b3bf`): Basemap, Resource, Infrastructure.
- **Layer toggle rows** (padding 6px 16px, Libre Franklin 500, 12.5px, cursor pointer):
  - Checkbox: 15px square, radius 2px. Checked = `#103a63` bg + `#103a63` border + white checkmark SVG; unchecked = `#fff` bg + `#b9c6d2` border.
  - Rows: **Satellite imagery** (off), **Solar irradiance (GHI)** (on, right-aligned "85%" opacity readout in mono 9.5px `#a6b3bf`), **Wind speed · 100m** (off), **GECOL thermal plants** (on), **Proposed RE sites** (on), **Assessment grid** (off).
- **Methodology block**: sub-label "Methodology", a full-width button "Reconcile fleet gas" (height 38px, `#f4f7f9` bg, 1px `#b9c6d2` border, radius 2px, 600 11.5px, chart icon `#103a63`), and helper text (500, 10px, `#a6b3bf`): "Bottom-up fleet gas vs. national reference — validates heat-rate method."
- **Legend** (pinned to bottom via `margin-top:auto`, top border `#e4eaef`): title "Legend — GECOL plants", three rows with 9px ringed dots — Operational `#1f9d6b`, Partially operational `#d99a16`, Offline / damaged `#c0392b`.

### Map (flex:1, scrollable, desert base)
In production this is the existing **Leaflet** map. The prototype renders a stylized SVG stand-in. Reproduce these overlay chrome elements with real Leaflet controls/markers:
- **Zoom control** top-right: stacked +/− buttons, 30px square, `#fff`, 1px `#c5d0da` border.
- **North/scale chip** top-left: height 28px, `rgba(255,255,255,.94)`, compass SVG + "N · 1:4,000,000" (IBM Plex Mono 11px).
- **Coordinate readout** bottom-left: dark chip `rgba(19,40,58,.92)`, height 28px, "26.5000°N  14.0000°E · Fezzan" (mono 11px, `#dce6ee`).
- **GHI legend** bottom-right: title "GHI · kWh/m²/day", 150×8px gradient bar `linear-gradient(90deg,#fde9c8,#f6c267,#ef9a3a,#df6a1e,#b5400d)`, scale 4.0–7.0.
- **Markers**: GECOL plants = filled dark circle (`#13283a`) ringed by status color (green/amber/red, see legend). Proposed sites = 45°-rotated squares (diamonds), white fill, stroke by type (Solar PV `#e8821e`, Wind `#1f6fb2`, Hybrid `#7a5cb2`, CSP `#c08a16`). Selected site = dashed-circle crosshair in `#103a63`.

### Right rail — Site Assessment (width 392px, `#fff`, left border `#d3dce4`, scrollable column)
- **Header** (padding 14px 18px 12px, bottom border `#e4eaef`): eyebrow "Site Assessment" (700, 10px uppercase, `#7a8794`) + right-aligned id "#LY-FZ-01" (mono 10px, `#a6b3bf`); title "Fezzan Solar Hub" (700, 18px) + type pill "SOLAR PV" (600 10px, `#b5560f` text, `#fbedd9` bg, 1px `#f0d2a3` border, radius 2px); coordinate line "26.5000°N · 14.0000°E · nearest grid: Sabha substation" (mono 11px, `#6b7a88`).
- **Suitability block** (padding 15px 18px, flex gap 16px): a 62px square grade badge (2px `#103a63` border, radius 3px, `#f4f7f9` bg) showing letter "A" (800, 26px, `#103a63`); beside it: "92 /100" + right-aligned "High suitability" (`#1f9d6b`), a 5-segment bar (all filled `#103a63`), and caption "Composite of resource, terrain, grid & land constraints".
- **Tabs** (bottom border `#d3dce4`, padding 0 8px): Solar · Wind · CSP · Charts · **Finance** (Finance only shown in Libya mode). Each: Libre Franklin 600, 12px, padding 11px 12px, 2px bottom border. Active = `#103a63` border + text; inactive = transparent border + `#8595a4` text.

#### Tab: Solar
2-column metric grid (each cell padding 13px 18px, internal 1px `#e4eaef` borders). Label = 700 9px uppercase `#8595a4`; value = IBM Plex Mono 20px `#16202b` with small `#8595a4` unit suffix:
- Annual GHI `7.05 kWh/m²/d` · PV yield `2,010 kWh/kWp` · Capacity factor `22.9 %` · Optimal tilt `26 °` · Avg temp `24.1 °C` · Temp impact `−4.2 % yield` (value in `#c0392b`).
- Below: "Solar PV score" row with "94 · Excellent" (mono, `#1f9d6b`) and a 94%-filled bar (`#103a63` on `#e4eaef`, height 8px).

#### Tab: Wind
Same grid pattern: Wind speed · 100m `4.2 m/s` · Power density `62 W/m²` · Wind class `1 · poor` · Est. cap. factor `11.4 %` · Wind speed · 50m `3.8 m/s` · Wind speed · 10m `3.1 m/s`. Score "31 · Poor" (`#c0392b`), bar 31% filled `#7d96a8`. Note (500 11px `#8595a4`): inland Fezzan winds are weak; coastal sites carry the wind program.

#### Tab: CSP
Grid: DNI `7.42 kWh/m²/d` · Annual DNI `2,708 /yr` · CSP suitability `High` (`#1f9d6b`) · Storage viable `Yes`. Score "88 · Strong" (`#1f9d6b`), bar 88% `#103a63`.

#### Tab: Charts
- "Monthly GHI profile" — 12 vertical bars (heights vary 46–100%), summer months `#e8821e`/`#cf5b14`, winter months blue tones; month-letter axis (mono 8px `#a6b3bf`).
- "Resource scores" — three labelled horizontal bars: Solar PV 94, CSP 88, Wind 31.

#### Tab: Finance (Libya mode only) — THE HERO TAB
- **Intro**: "Gas-displacement analysis" (700 13px) + body (500 11px `#8595a4`): "Value of natural gas freed for export by displacing thermal generation. Displaced turbine auto-inferred from nearest GECOL plant."
- **Headline card**: `#103a63` bg, radius 3px, padding 14px 16px, white text. Eyebrow "Gas freed for export · annual" (600 9px uppercase, `#9cc0de`); big value (e.g. `$119.4M`, 800 27px) + "/ yr at export parity" (mono 12px `#9cc0de`); two sub-stats (mono 11px): Gas volume `… MMBtu`, Domestic value `$…`.
- **Config controls** (padding 14px 18px, gap 13px):
  - **Project capacity** slider (10–1000 MW, step 10, default 500). Value label right-aligned mono `#103a63`.
  - **Displaced turbine** `<select>` (height 34px, `#f8fafb` bg, 1px `#d3dce4`): GE Frame 9E/9F, Siemens SGT5-2000E/4000F, CCGT E/F-class, Generic OCGT. Label notes "· nearest: Sabha PS".
  - **Plant age** slider (0–40 yr, step 1, default 20).
  - **Domestic** ($0.5–5/MMBtu, step 0.1, default 1.0) and **Export parity** ($4–20/MMBtu, step 0.5, default 10) sliders, side by side.
  - Caption (mono 9.5px `#a6b3bf`): "$/MMBtu · warm-season ambient 38 °C · heat rate derated for ambient + vintage".
- **Result metric grid** (2-col, same style as Solar): LCOE · solar `$… /MWh` · CO₂ avoided `… t/yr` · Payback `… yr` · Annual yield `… GWh`.
- **NPV card**: 1px `#103a63` border, radius 3px, `#f4f7f9` bg, space-between. Left: "25-yr NPV · export parity" (700 9px uppercase) + "8% discount · solar capex $700/kW". Right: big value (e.g. `$…`, 800 24px `#103a63`).

- **Actions** (pinned bottom via `margin-top:auto`, top border `#e4eaef`, padding 14px 18px, gap 9px): primary "Pin site" (flex:1, height 36px, `#103a63` bg, white, pin icon) + secondary "Export brief" (flex:1, `#fff`, 1px `#b9c6d2` border).

### Bottom table — Proposed sites (height 198px, `#fff`, top border `#b9c6d2`)
- **Header bar** (height 42px, padding 0 18px, gap 14px): title "Proposed sites" (700 13px) + count pill (mono 11px, white on `#103a63`, radius 10px) + filter chips "All / Solar PV / Wind / Hybrid / CSP" (600 10.5px, radius 2px; active = white on `#103a63`, inactive = `#5a6b7b` with 1px `#d3dce4` border) + right-aligned "sorted by suitability ↓" (mono 10.5px `#a6b3bf`).
- **Grid columns**: `1.7fr 96px 92px 84px 96px 90px 100px 110px` → Name · Type · Capacity · GHI · Cap. factor · LCOE · Suitability · Status. Header row height 30px, `#f4f7f9` bg, labels 700 9px uppercase `#7a8794`.
- **Data rows**: height 34px, IBM Plex Mono 11.5px `#1a2733`, bottom border `#eef2f5`. Selected row tinted `#f0f6fb` with `#103a63` name. Name in Libre Franklin 600. Type colored by category (Solar PV `#b5560f`, Wind `#1f6fb2`, Hybrid `#7a5cb2`, CSP `#c08a16`). Suitability = grade badge (700 10px, white text, radius 2px, bg by grade: A `#103a63`/`#1f7d52`, B `#3b6a96`). Status text colored: Shortlisted `#1f9d6b`, Screening `#8595a4`, On hold `#c0392b`.
- **Seed data** (8 rows): Fezzan Solar Hub (500MW, A·92, selected, shortlisted), Kufra Deep Desert Solar, Jufra Solar Park, Ghadames CSP Tower, Misrata Peri-Urban Solar, Darnah Coastal Wind Farm, Gulf of Sirte Hybrid Park, Al Bayda Highland Wind. In production, populate from `frontend/data/proposed-sites.json`.

## Interactions & Behavior
- **Tab switching** (right rail): clicking a tab sets `activeTab` and swaps the panel body. Finance tab only renders when `libyaMode === true`.
- **Mode toggle**: "Libya mode" enables the Finance tab and Libya-specific data; "Universal" hides Finance (and if Finance was active, falls back to Solar).
- **Layer toggles**: each checkbox flips a boolean in a `layers` object and shows/hides the corresponding Leaflet layer.
- **Table filters**: filter chips set a `filter` value (`all`/`solar`/`wind`/`hybrid`/`csp`); rows are filtered by type; the count pill reflects the visible row count.
- **Finance controls are live**: changing capacity, turbine, age, domestic price, or export price recomputes ALL finance outputs (headline export value, gas volume, domestic value, LCOE, CO₂, payback, annual yield, NPV) synchronously on each input event.
- **Map click** (existing behavior to preserve): clicking the map sets the assessed point, fetches/derives resource values, and repopulates the right rail.

## State Management
State variables needed:
- `activeTab`: `'solar' | 'wind' | 'csp' | 'charts' | 'finance'` (default `'finance'`)
- `libyaMode`: boolean (default `true`)
- `layers`: `{ satellite, solar, wind, plants, proposed, grid }` booleans (defaults: solar/plants/proposed = true, rest false)
- `filter`: table filter string (default `'all'`)
- Finance inputs: `capacityMW` (500), `turbineId` (`'siemens-sgt5-2000e'`), `ageYears` (20), `domPrice` (1.0), `expPrice` (10), `cf` capacity-factor % (22.9)
- Selected site object (drives header + assessment values) — from map click or table row select.

## Financial Engine (port reference — use the real `financial.js`)
The prototype reproduces this math; the real module lives at `frontend/js/financial.js`. Key formulas:
- **Turbine ISO heat rates** (Btu/kWh): GE 9E 10800, GE 9F 9720, Siemens SGT5-2000E 10200, SGT5-4000F 9500, CCGT E 7200, CCGT F 6800, Generic OCGT 11500.
- **Heat-rate derate**: `hr = iso`; if ambient > 15 °C, `hr *= 1 + (ambient−15)*0.0035`; age penalty `ap = 1 + (age≤10 ? age*0.003 : 0.03 + (age−10)*0.005)`, capped at 1.15; `hr *= ap`. Ambient assumed 38 °C (warm season).
- **Annual generation**: `annualMWh = capacityMW * 8760 * cf`.
- **Gas freed**: `gasMMBtu = annualMWh * 1000 * hr / 1e6`.
- **CO₂ avoided**: `gasMMBtu * 53.07 / 1000` (t/yr).
- **Values**: `domesticValue = gasMMBtu * domPrice`; `exportValue = gasMMBtu * expPrice`.
- **LCOE (solar)**: capex `$700/kW`, opex `$10/kW/yr`, `r=0.08`, `n=25`; `CRF = r(1+r)^n / ((1+r)^n − 1)`; `LCOE = (capex*CRF + opex) / annualMWh`.
- **NPV (export parity)**: annual cash `= exportValue − opex`; `NPV = −capex + Σ cash/(1+r)^y` for y=1..25.
- **Payback**: `capex / cash` (if cash > 0).
- **USD formatting**: ≥1e9 → `$x.xxB`, ≥1e6 → `$x.xM`, ≥1e3 → `$xk`, else `$x`.

## Design Tokens
**Colors**
- Primary navy `#103a63`; ink `#16202b` / `#18222e` / `#1a2733`
- Neutrals: page `#eef1f4` / `#dde4ea`; panel `#fff`; fill `#f4f7f9` / `#f8fafb`; tint-selected `#f0f6fb`
- Borders: `#b9c6d2` (strong), `#d3dce4` (default), `#e4eaef` / `#eef2f5` (hairline), `#c5d0da` (frame)
- Text muted: `#7a8794`, `#8595a4`, `#6b7a88`, `#90a0ae`, `#a6b3bf`, `#5a6b7b`
- Status: success/operational `#1f9d6b`; warning/partial `#d99a16`; danger/offline `#c0392b`; grade-B blue `#3b6a96`; grade-A green `#1f7d52`
- Resource accents: solar orange `#e8821e` / `#cf5b14` / `#b5560f`; wind blue `#1f6fb2`; hybrid `#7a5cb2`; CSP `#c08a16`
- GHI ramp: `#fde9c8 → #f6c267 → #ef9a3a → #df6a1e → #b5400d`

**Typography**
- UI sans: **Libre Franklin** (400/500/600/700/800)
- Data/mono: **IBM Plex Mono** (400/500/600) — used for all numeric values, coordinates, ids, provenance lines
- Scale: eyebrows 9–10px uppercase letter-spacing 0.10–0.14em; body 11–12.5px; metric values 18–20px; headline values 24–27px; section titles 13–18px

**Radius**: 2px (controls, chips, bars), 3px (cards/badges), 10px (count pill). **Borders**: 1px throughout; 2px for emphasis (grade badge, active tab underline). No heavy shadows — only the outer frame shadow `0 10px 40px rgba(20,40,70,.16)`.

## Assets
- **Icons**: all inline SVG (sun-burst logo, magnifier, compass, pin, chart, checkmark). No icon library required; reuse the codebase's icon system if one exists.
- **Map tiles**: existing Leaflet basemap (satellite + street). The prototype's SVG map is a placeholder only.
- **Data**: `frontend/data/libya-plants.json`, `proposed-sites.json`, `libya-ghi.json`, `libya-wind.json`.
- **Fonts**: Libre Franklin + IBM Plex Mono via Google Fonts (or self-host).

## Files
- `HelioScout - Federal Analytical.dc.html` — the high-fidelity prototype (this redesign). Open in a browser to interact with tabs, mode toggle, layer toggles, table filters, and the live finance controls.
- Reference codebase (attached `helioscout/` folder): `frontend/index.html`, `frontend/js/financial.js`, `frontend/js/map.js`, `frontend/data/*.json`, `backend/server.js`.
- `support.js` — runtime for the prototype only; **not** needed in production.
