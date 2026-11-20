# 🌍 Geo Trivia

**Play:** https://steve-abrams.github.io/geo-trivia/

A family geography party game: name the country, the US state, the flag or the capital.
Play solo, or Jackbox-style with friends using a room code.

Built with React + Vite + TypeScript, Supabase (Postgres, Realtime, anonymous auth) and hosted on GitHub Pages.

## Develop

```bash
npm install
npm run dev     # http://localhost:5173/geo-trivia/
npm test        # vitest
npm run build
npm run smoke   # end-to-end check against the live Supabase project
npm run bot -- ABCD Robo 0.7   # a robot player joins room ABCD (70% accuracy) for multiplayer testing
```

`.env` holds the Supabase URL and the **publishable** key (safe to commit; it's shipped to every browser anyway).

## Backend

`supabase/migrations/` is the schema, applied to project `ebioryxdimdgpssllkwg`:

- Players are **anonymous Supabase users**. Tables are read-only to clients (RLS: you only see rooms you're in,
  only questions shown so far, and other players' answers only after the reveal).
- All writes go through RPCs: `create_room`, `join_room`, `start_game` (host sends the generated questions),
  `submit_answer` (graded with server time), `tick` (any player advances an expired phase), `skip_phase`, `leave_room`.
- Scoring: 10 points per correct answer, +5 for the fastest when 2+ players are right.
- Realtime: `rooms` and `players` are in the `supabase_realtime` publication.
- A daily `pg_cron` job deletes rooms older than a day and stale anonymous users.

The question lab (`#/lab`) accepts `?type=country|state|flag|capital` and `?id=<target>` to pin a specific map.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: tests, build, publish to GitHub Pages.

## Data

- Maps: [world-atlas](https://github.com/topojson/world-atlas) (countries-50m) and [us-atlas](https://github.com/topojson/us-atlas) (states-albers-10m), drawn with d3-geo.
- Countries: [world-countries](https://github.com/mledoze/countries), UN members plus Vatican City, Palestine, Taiwan and Kosovo.
- Capital coordinates: [Natural Earth](https://www.naturalearthdata.com/) populated places. Regenerate `src/data/countries.json` with
  `node scripts/build-data.mjs <ne_10m_populated_places_simple.geojson>`.
- Flags: [flag-icons](https://github.com/lipis/flag-icons).
