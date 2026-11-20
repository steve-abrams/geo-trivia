import { COUNTRIES, type Continent, type Country } from '../data/countries'
import { STATES, type UsState } from '../data/states'

export type QuestionType = 'country' | 'state' | 'flag' | 'capital'
export type Difficulty = 'easy' | 'medium' | 'hard'
/** 'World' or a single continent. Ignored for US state rounds. */
export type Area = 'World' | Continent

export interface RoundConfig {
  type: QuestionType
  area: Area
}

export interface GameConfig {
  difficulty: Difficulty
  rounds: RoundConfig[] // 1–4
  questionsPerRound: number
}

export interface Option {
  id: string
  label: string
}

export interface Question {
  round: number
  idx: number
  type: QuestionType
  /** Country id (ISO numeric / "XK") or state FIPS code. */
  targetId: string
  options: Option[]
  answerId: string
}

export const OPTION_COUNT: Record<Difficulty, number> = { easy: 3, medium: 5, hard: 7 }

export type Rng = () => number

/** Small seeded PRNG so games and tests are reproducible. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** One candidate the generator can ask about, with the groupings used for "nearby" distractors. */
interface Item {
  id: string
  label: string
  near: string // tight group (subregion / census division)
  wide: string // loose group (continent / census region)
}

function countryItems(type: QuestionType, area: Area): Item[] {
  const pool = area === 'World' ? COUNTRIES : COUNTRIES.filter((c) => c.continent === area)
  return pool.map((c: Country) => ({
    id: c.id,
    label: type === 'capital' ? c.capital : c.name,
    near: c.subregion,
    wide: c.continent,
  }))
}

function stateItems(): Item[] {
  return STATES.map((s: UsState) => ({ id: s.id, label: s.name, near: s.division, wide: s.region }))
}

export function itemsFor(round: RoundConfig): Item[] {
  return round.type === 'state' ? stateItems() : countryItems(round.type, round.area)
}

/**
 * Pick `count` distractors for `target`.
 * - easy: anywhere in the pool
 * - medium: about half from the same continent/region (or subregion when the pool is one continent)
 * - hard: as many as possible from the same subregion/division, topped up from the wider group
 */
export function pickDistractors(target: Item, pool: Item[], count: number, difficulty: Difficulty, rng: Rng): Item[] {
  const usedLabels = new Set([target.label])
  const chosen: Item[] = []
  const take = (from: Item[], max: number) => {
    for (const it of shuffle(from, rng)) {
      if (chosen.length >= count || max <= 0) break
      if (it.id === target.id || usedLabels.has(it.label)) continue
      usedLabels.add(it.label)
      chosen.push(it)
      max--
    }
  }
  const sameNear = pool.filter((p) => p.near === target.near)
  const sameWide = pool.filter((p) => p.wide === target.wide)
  // If every item already shares the wide group (single-continent pool or all states), "medium" tightens to near.
  const singleWide = sameWide.length === pool.length
  if (difficulty === 'hard') {
    take(sameNear, count)
    take(sameWide, count)
  } else if (difficulty === 'medium') {
    take(singleWide ? sameNear : sameWide, Math.ceil(count / 2))
  }
  take(pool, count)
  return chosen
}

export function generateRound(round: RoundConfig, roundIdx: number, n: number, difficulty: Difficulty, rng: Rng, exclude = new Set<string>()): Question[] {
  const pool = itemsFor(round)
  const optionCount = OPTION_COUNT[difficulty]
  if (pool.length < optionCount) throw new Error(`Not enough items for ${round.type} in ${round.area}`)
  // Targets: unseen first, then allow repeats if the pool is smaller than n.
  const fresh = shuffle(pool.filter((p) => !exclude.has(`${round.type}:${p.id}`)), rng)
  const targets: Item[] = []
  while (targets.length < n) targets.push(...(fresh.length ? fresh.splice(0, n - targets.length) : shuffle(pool, rng).slice(0, n - targets.length)))
  return targets.map((target, idx) => {
    exclude.add(`${round.type}:${target.id}`)
    const options = shuffle([target, ...pickDistractors(target, pool, optionCount - 1, difficulty, rng)], rng)
    return {
      round: roundIdx,
      idx,
      type: round.type,
      targetId: target.id,
      options: options.map(({ id, label }) => ({ id, label })),
      answerId: target.id,
    }
  })
}

export function generateGame(config: GameConfig, rng: Rng = Math.random): Question[] {
  if (config.rounds.length < 1 || config.rounds.length > 4) throw new Error('A game has 1–4 rounds')
  const seen = new Set<string>()
  return config.rounds.flatMap((r, i) => generateRound(r, i, config.questionsPerRound, config.difficulty, rng, seen))
}
