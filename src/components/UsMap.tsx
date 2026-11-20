import { useEffect, useMemo, useState } from 'react'
import { geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { STATES } from '../data/states'

type StateFeature = Feature<Polygon | MultiPolygon, { name: string }>
const STATE_IDS = new Set(STATES.map((s) => s.id))

let atlasPromise: Promise<{ states: StateFeature[]; borders: string }> | null = null
function loadAtlas() {
  // states-albers-10m is pre-projected (Albers USA, 975×610), Alaska/Hawaii inset.
  atlasPromise ??= import('us-atlas/states-albers-10m.json').then((m) => {
    const topo = m.default as unknown as Topology<{ states: GeometryCollection; nation: GeometryCollection }>
    const fc = feature(topo, topo.objects.states) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>
    const borders = geoPath()(mesh(topo, topo.objects.nation)) ?? ''
    return { states: fc.features.filter((f) => STATE_IDS.has(String(f.id))), borders }
  })
  return atlasPromise
}

const TINY_PX = 400

export function UsMap({ targetId, revealed }: { targetId: string; revealed?: boolean }) {
  const [atlas, setAtlas] = useState<Awaited<ReturnType<typeof loadAtlas>> | null>(null)
  useEffect(() => {
    loadAtlas().then(setAtlas)
  }, [])
  const path = useMemo(() => geoPath(), [])
  if (!atlas) return <div className="map-loading">🗺️ Unfolding the map…</div>
  const target = atlas.states.find((f) => String(f.id) === targetId)
  const hl = revealed ? 'var(--map-correct)' : 'var(--map-target)'
  const ring = target && path.area(target) < TINY_PX ? path.centroid(target) : null

  return (
    <svg className="map us" viewBox="-10 -10 995 630" role="img" aria-label="Map of the United States with a highlighted state">
      {atlas.states.map((f) => (f === target ? null : <path key={String(f.id)} d={path(f) ?? undefined} className="land" />))}
      {target && <path d={path(target) ?? undefined} className="land target" style={{ fill: hl }} />}
      <path d={atlas.borders} className="nation-edge" />
      {ring && (
        <g transform={`translate(${ring[0]},${ring[1]})`}>
          <circle r="16" className="pulse" style={{ stroke: hl }} />
        </g>
      )}
    </svg>
  )
}
