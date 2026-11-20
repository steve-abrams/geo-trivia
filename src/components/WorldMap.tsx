import { useEffect, useMemo, useState } from 'react'
import { geoArea, geoCentroid, geoCircle, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { Topology } from 'topojson-specification'
import { COUNTRIES } from '../data/countries'

type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>

let atlasPromise: Promise<CountryFeature[]> | null = null
function loadAtlas() {
  atlasPromise ??= import('world-atlas/countries-50m.json').then((m) => {
    const topo = m.default as unknown as Topology
    const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>
    // Kosovo has no ISO numeric id in world-atlas; give it the id our data uses.
    return fc.features.map((f) => (f.id === undefined && f.properties.name === 'Kosovo' ? { ...f, id: 'XK' } : f))
  })
  return atlasPromise
}

/** The biggest polygon of a (multi)polygon, so e.g. France isn't framed together with French Guiana. */
function mainland(f: CountryFeature): Feature<Polygon> {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  let best = polys[0]
  let bestArea = -1
  for (const coordinates of polys) {
    const a = geoArea({ type: 'Polygon', coordinates })
    if (a > bestArea) {
      best = coordinates
      bestArea = a
    }
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: best } }
}

const W = 800
const H = 560
const TINY_PX = 60 // highlighted areas smaller than this (in px²) also get a pulsing ring

export interface WorldMapProps {
  targetId: string
  /** Show a star at this [lat, lng] (capital questions). */
  star?: [number, number] | null
  /** Reveal styling: colour the target green. */
  revealed?: boolean
}

export function WorldMap({ targetId, star, revealed }: WorldMapProps) {
  const [atlas, setAtlas] = useState<CountryFeature[] | null>(null)
  useEffect(() => {
    loadAtlas().then(setAtlas)
  }, [])

  const view = useMemo(() => {
    if (!atlas) return null
    const country = COUNTRIES.find((c) => c.id === targetId)
    const target = atlas.find((f) => f.id === targetId)
    const main = target ? mainland(target) : null
    const center: [number, number] = main ? geoCentroid(main) : country ? [country.latlng[1], country.latlng[0]] : [0, 0]
    // Angular radius of the mainland, measured from its centroid.
    let radius = 0
    if (main) for (const ring of main.geometry.coordinates) for (const p of ring) radius = Math.max(radius, geoDistance(center, p as [number, number]))
    const deg = (radius * 180) / Math.PI
    const frameDeg = Math.min(80, Math.max(14, deg * 2.6))
    const projection = geoOrthographic()
      .rotate([-center[0], -center[1]])
      .clipAngle(90)
      .fitExtent(
        [
          [20, 20],
          [W - 20, H - 20],
        ],
        geoCircle().center(center).radius(frameDeg)(),
      )
    const path = geoPath(projection)
    const targetArea = target ? path.area(target) : 0
    const ring = !target || targetArea < TINY_PX ? projection(center) : null
    const starXY = star ? projection([star[1], star[0]]) : null
    // Intro: start with the whole globe in view (centred on the target), then zoom in.
    // In an orthographic projection a zoom is a plain 2D scale about the globe's centre,
    // so we draw once at the final scale and animate a CSS transform.
    const origin = projection(center) ?? [W / 2, H / 2]
    const startScale = Math.min(1, (Math.min(W, H) / 2 - 16) / projection.scale())
    return { path, target, ring, starXY, origin, startScale }
  }, [atlas, targetId, star])

  if (!view) return <div className="map-loading">🌍 Spinning up the globe…</div>
  const { path, target, ring, starXY, origin, startScale } = view
  const sphere = path({ type: 'Sphere' }) ?? undefined
  const hl = revealed ? 'var(--map-correct)' : 'var(--map-target)'

  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map with a highlighted country">
      <defs>
        <radialGradient id="ocean" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="var(--ocean-light)" />
          <stop offset="100%" stopColor="var(--ocean-dark)" />
        </radialGradient>
      </defs>
      <g
        key={targetId}
        className="zoom-in"
        style={{ transformOrigin: `${origin[0]}px ${origin[1]}px`, '--zoom-from': startScale } as React.CSSProperties}
      >
      <path d={sphere} fill="url(#ocean)" />
      <path d={path(geoGraticule10()) ?? undefined} className="graticule" />
      {atlas!.map((f, i) =>
        f === target ? null : <path key={i} d={path(f) ?? undefined} className="land" />,
      )}
      {target && <path d={path(target) ?? undefined} className="land target" style={{ fill: hl }} />}
      {ring && (
        <g transform={`translate(${ring[0]},${ring[1]})`} className="after-zoom">
          <circle r="22" className="pulse" style={{ stroke: hl }} />
          <circle r="24" fill="none" stroke="white" strokeWidth="3" strokeDasharray="6 5" className="spin" />
          <circle r="7" style={{ fill: hl }} stroke="white" strokeWidth="2.5" />
        </g>
      )}
      {starXY && (
 <g className="after-zoom">
        <text x={starXY[0]} y={starXY[1]} className="capital-star" textAnchor="middle" dominantBaseline="central">
          ★
        </text>
        </g>
      )}
      <path d={sphere} className="sphere-edge" />
      </g>
    </svg>
  )
}
