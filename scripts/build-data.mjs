// Builds src/data/countries.json from the world-countries package plus
// capital-city coordinates from Natural Earth's populated places.
// Usage: node scripts/build-data.mjs path/to/ne_10m_populated_places_simple.geojson
// Download: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const countries = require('world-countries')

const nePath = process.argv[2]
if (!nePath) throw new Error('pass the Natural Earth populated places geojson path')
const places = JSON.parse(fs.readFileSync(nePath, 'utf8')).features.map((f) => f.properties)

// UN members plus observers / widely-recognised extras.
const EXTRA = ['VA', 'PS', 'TW', 'XK']

// Natural Earth gaps.
const CAPITAL_OVERRIDES = { XK: [42.663, 21.166], NR: [-0.547, 166.921] }

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

function continentOf(c) {
  if (c.region === 'Americas') return c.subregion === 'South America' ? 'South America' : 'North America'
  return c.region
}

const missing = []
const out = countries
  .filter((c) => c.unMember || EXTRA.includes(c.cca2))
  .map((c) => {
    const capital = c.capital[0]
    const mine = places.filter((p) => p.iso_a2 === c.cca2 || p.adm0_a3 === c.cca3 || p.sov_a3 === c.cca3)
    const capName = norm(capital)
    const pick =
      mine.find((p) => p.adm0cap === 1 && (norm(p.name) === capName || norm(p.nameascii) === capName)) ||
      mine.find((p) => norm(p.name) === capName || norm(p.nameascii) === capName || capName.startsWith(norm(p.nameascii))) ||
      mine.find((p) => p.adm0cap === 1)
    if (!pick && !CAPITAL_OVERRIDES[c.cca2]) missing.push(`${c.cca2} ${c.name.common} (${capital})`)
    return {
      id: c.ccn3 || c.cca2, // world-atlas feature id (ISO numeric); Kosovo has none
      code: c.cca2.toLowerCase(), // flag-icons file name
      name: c.name.common,
      capital,
      capitalLatLng: CAPITAL_OVERRIDES[c.cca2] ?? (pick ? [round(pick.latitude), round(pick.longitude)] : null),
      latlng: c.latlng.map(round),
      continent: continentOf(c),
      subregion: c.subregion,
      area: c.area,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

function round(n) {
  return Math.round(n * 1000) / 1000
}

fs.writeFileSync(new URL('../src/data/countries.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(`wrote ${out.length} countries`)
if (missing.length) console.log('no capital coordinates for:\n  ' + missing.join('\n  '))
