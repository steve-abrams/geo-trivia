import { describe, expect, it } from 'vitest'
import { COUNTRIES, CONTINENTS } from '../data/countries'
import { STATES } from '../data/states'
import { generateGame, generateRound, itemsFor, mulberry32, OPTION_COUNT, type Area, type Difficulty, type QuestionType } from './questions'

const TYPES: QuestionType[] = ['country', 'state', 'flag', 'capital']
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard']
const AREAS: Area[] = ['World', ...CONTINENTS]
const byId = new Map(COUNTRIES.map((c) => [c.id, c]))

describe('data', () => {
  it('has 50 states and ~197 countries with capitals and coordinates', () => {
    expect(STATES).toHaveLength(50)
    expect(new Set(STATES.map((s) => s.id)).size).toBe(50)
    expect(COUNTRIES.length).toBeGreaterThan(190)
    for (const c of COUNTRIES) {
      expect(c.capital, c.name).toBeTruthy()
      expect(c.capitalLatLng, c.name).toHaveLength(2)
      expect(CONTINENTS).toContain(c.continent)
    }
  })
})

describe('generateRound', () => {
  for (const type of TYPES)
    for (const difficulty of DIFFS)
      for (const area of type === 'state' ? (['World'] as Area[]) : AREAS)
        it(`${type} / ${difficulty} / ${area}`, () => {
          for (let seed = 1; seed <= 25; seed++) {
            const qs = generateRound({ type, area }, 0, 8, difficulty, mulberry32(seed))
            expect(qs).toHaveLength(8)
            // no repeated targets within a round (all pools have >= 8 items)
            expect(new Set(qs.map((q) => q.targetId)).size).toBe(8)
            for (const q of qs) {
              expect(q.options).toHaveLength(OPTION_COUNT[difficulty])
              expect(new Set(q.options.map((o) => o.id)).size).toBe(q.options.length)
              expect(new Set(q.options.map((o) => o.label)).size).toBe(q.options.length)
              expect(q.options.filter((o) => o.id === q.answerId)).toHaveLength(1)
              expect(q.targetId).toBe(q.answerId)
              if (type !== 'state' && area !== 'World') {
                for (const o of q.options) expect(byId.get(o.id)!.continent).toBe(area)
              }
              if (type === 'capital') expect(q.options.find((o) => o.id === q.answerId)!.label).toBe(byId.get(q.answerId)!.capital)
            }
          }
        })

  it('puts the correct answer in different positions', () => {
    const positions = new Set(
      generateRound({ type: 'country', area: 'World' }, 0, 30, 'hard', mulberry32(7)).map((q) => q.options.findIndex((o) => o.id === q.answerId)),
    )
    expect(positions.size).toBeGreaterThan(3)
  })
})

describe('difficulty', () => {
  // Share of distractors in the target's continent, averaged over many world-wide questions.
  function sameContinentShare(difficulty: Difficulty) {
    let same = 0
    let total = 0
    for (let seed = 1; seed <= 40; seed++)
      for (const q of generateRound({ type: 'country', area: 'World' }, 0, 10, difficulty, mulberry32(seed))) {
        const cont = byId.get(q.answerId)!.continent
        for (const o of q.options) if (o.id !== q.answerId) (total++, (same += +(byId.get(o.id)!.continent === cont)))
      }
    return same / total
  }
  it('makes distractors more local as difficulty rises', () => {
    const easy = sameContinentShare('easy')
    const medium = sameContinentShare('medium')
    const hard = sameContinentShare('hard')
    expect(easy).toBeLessThan(0.35)
    expect(medium).toBeGreaterThan(0.45)
    expect(hard).toBeGreaterThan(0.9)
  })

  it('hard state questions mostly use the same census division', () => {
    const div = new Map(STATES.map((s) => [s.id, s.division]))
    let same = 0
    let total = 0
    for (let seed = 1; seed <= 20; seed++)
      for (const q of generateRound({ type: 'state', area: 'World' }, 0, 10, 'hard', mulberry32(seed)))
        for (const o of q.options) if (o.id !== q.answerId) (total++, (same += +(div.get(o.id) === div.get(q.answerId))))
    expect(same / total).toBeGreaterThan(0.5)
  })
})

describe('generateGame', () => {
  it('numbers rounds and avoids repeating a target across rounds of the same type', () => {
    const qs = generateGame(
      {
        difficulty: 'medium',
        questionsPerRound: 8,
        rounds: [
          { type: 'country', area: 'Europe' },
          { type: 'country', area: 'Europe' },
          { type: 'flag', area: 'World' },
          { type: 'state', area: 'World' },
        ],
      },
      mulberry32(3),
    )
    expect(qs).toHaveLength(32)
    expect(qs.map((q) => q.round)).toEqual([0, 1, 2, 3].flatMap((r) => Array(8).fill(r)))
    const europe = qs.filter((q) => q.type === 'country').map((q) => q.targetId)
    expect(new Set(europe).size).toBe(16)
  })

  it('reuses targets only when a pool runs out', () => {
    expect(itemsFor({ type: 'country', area: 'South America' })).toHaveLength(12)
    const qs = generateGame(
      { difficulty: 'easy', questionsPerRound: 8, rounds: [{ type: 'flag', area: 'South America' }, { type: 'flag', area: 'South America' }] },
      mulberry32(5),
    )
    const ids = qs.map((q) => q.targetId)
    expect(new Set(ids).size).toBe(12)
    expect(new Set(ids.slice(0, 8)).size).toBe(8)
  })

  it('rejects 0 or 5 rounds', () => {
    expect(() => generateGame({ difficulty: 'easy', questionsPerRound: 5, rounds: [] })).toThrow()
    expect(() => generateGame({ difficulty: 'easy', questionsPerRound: 5, rounds: Array(5).fill({ type: 'flag', area: 'World' }) })).toThrow()
  })
})
