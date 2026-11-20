# 🌍 Geo Trivia

A family geography party game: name the country, the US state, the flag or the capital.
Play solo, or Jackbox-style with friends using a room code.

Built with React + Vite + TypeScript, Supabase (Postgres, Realtime, anonymous auth) and hosted on GitHub Pages.

## Develop

```bash
npm install
npm run dev     # http://localhost:5173/geo-trivia/
npm test        # vitest
npm run build
```

The question lab page accepts `?type=country|state|flag|capital` and `?id=<target>` to pin a specific map.

## Data

- Maps: [world-atlas](https://github.com/topojson/world-atlas) (countries-50m) and [us-atlas](https://github.com/topojson/us-atlas) (states-albers-10m), drawn with d3-geo.
- Countries: [world-countries](https://github.com/mledoze/countries), UN members plus Vatican City, Palestine, Taiwan and Kosovo.
- Capital coordinates: [Natural Earth](https://www.naturalearthdata.com/) populated places. Regenerate `src/data/countries.json` with
  `node scripts/build-data.mjs <ne_10m_populated_places_simple.geojson>`.
- Flags: [flag-icons](https://github.com/lipis/flag-icons).
