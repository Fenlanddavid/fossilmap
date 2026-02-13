# FossilMap (UK Palaeo) — offline-first MVP

This is a starter PWA-style web app (Vite + React + TypeScript) using **Dexie (IndexedDB)** for offline storage and **MapLibre GL** for an online basemap.

## Features included
- Offline Localities + Specimens + Photos (stored as blobs)
- Map with:
  - clustering
  - filters (SSSI-only, Formation dropdown, Taxon contains, Min specimens, Date range)
  - specimen counts per locality
  - click pin: zoom + highlight + locality panel
  - locality panel: specimen list w/ thumbnails
  - click specimen row: editable modal (add/remove photos, delete specimen)
  - controls: zoom to my location + add locality here

## Setup
1) Install dependencies:
```bash
npm install
```

2) Add a MapTiler key:
```bash
cp .env.example .env
# edit .env and set VITE_MAPTILER_KEY
```

3) Run:
```bash
npm run dev
```

## Notes
- For production distribution, use your own map tile provider + key.
- This is online-basemap first. Offline basemap (PMTiles) can be added later.
