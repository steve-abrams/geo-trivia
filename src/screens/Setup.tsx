import { useState } from 'react'
import { CONTINENTS } from '../data/countries'
import { generateGame, type Area, type Difficulty, type QuestionType, type RoundConfig } from '../game/questions'
import { AREA_EMOJI, DEFAULT_SETTINGS, DIFFICULTY_INFO, TYPE_INFO, type GameSettings } from '../game/settings'
import type { Profile } from '../lib/profile'
import { sfx } from '../lib/sound'
import { call, ensureSignedIn } from '../lib/supabase'
import { go } from '../router'

const KEY = 'geo-trivia:settings'
function loadSettings(): GameSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const TYPES = Object.keys(TYPE_INFO) as QuestionType[]
const AREAS: Area[] = ['World', ...CONTINENTS]

/** Turn generated questions into the shape start_game expects. */
export function questionsFor(settings: GameSettings) {
  return generateGame(settings).map((q) => ({
    round: q.round,
    idx: q.idx,
    type: q.type,
    targetId: q.targetId,
    answerId: q.answerId,
    options: q.options,
  }))
}

export function Setup({ mode, profile }: { mode: 'solo' | 'party'; profile: Profile }) {
  const [s, setS] = useState<GameSettings>(loadSettings)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const update = (patch: Partial<GameSettings>) => {
    sfx.click()
    setS((prev) => ({ ...prev, ...patch }))
  }
  const setRound = (i: number, patch: Partial<RoundConfig>) => update({ rounds: s.rounds.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  const start = async () => {
    setBusy(true)
    setErr(null)
    sfx.whoosh()
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
    try {
      await ensureSignedIn()
      const room = await call<{ room_id: string; code: string }>('create_room', {
        p_settings: s,
        p_name: profile.name.trim(),
        p_avatar: profile.avatar,
        p_color: profile.color,
      })
      if (mode === 'solo') await call('start_game', { p_room_id: room.room_id, p_questions: questionsFor(s) })
      go(`/room/${room.code}`)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="screen setup">
      <header className="bar">
        <button className="back" onClick={() => go('/')}>
          ← Back
        </button>
        <h2>{mode === 'solo' ? '🎮 Solo game' : '🎉 Party game'}</h2>
      </header>

      <section className="card">
        <h3>How hard?</h3>
        <div className="seg">
          {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((d) => (
            <button key={d} className={`seg-btn ${s.difficulty === d ? 'on' : ''}`} onClick={() => update({ difficulty: d })}>
              <span className="emoji">{DIFFICULTY_INFO[d].emoji}</span>
              <b>{DIFFICULTY_INFO[d].label}</b>
              <small>{DIFFICULTY_INFO[d].blurb}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Rounds</h3>
        <div className="rounds">
          {s.rounds.map((r, i) => (
            <div className="round-card" key={i}>
              <div className="round-head">
                <b>Round {i + 1}</b>
                {s.rounds.length > 1 && (
                  <button className="remove" aria-label={`Remove round ${i + 1}`} onClick={() => update({ rounds: s.rounds.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                )}
              </div>
              <div className="type-grid">
                {TYPES.map((t) => (
                  <button key={t} className={`type-btn ${r.type === t ? 'on' : ''}`} onClick={() => setRound(i, { type: t })}>
                    <span className="emoji">{TYPE_INFO[t].emoji}</span>
                    {TYPE_INFO[t].label.replace('Name the ', '')}
                  </button>
                ))}
              </div>
              {r.type !== 'state' && (
                <label className="area">
                  Where?
                  <select value={r.area} onChange={(e) => setRound(i, { area: e.target.value as Area })}>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {AREA_EMOJI[a]} {a === 'World' ? 'Whole world' : a}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ))}
          {s.rounds.length < 4 && (
            <button className="add-round" onClick={() => update({ rounds: [...s.rounds, { type: 'country', area: 'World' }] })}>
              + Add a round
            </button>
          )}
        </div>
      </section>

      <section className="card two-col">
        <label>
          Questions per round
          <select value={s.questionsPerRound} onChange={(e) => update({ questionsPerRound: +e.target.value })}>
            {[5, 8, 10, 12, 15].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Seconds per question
          <select value={s.timeLimit} onChange={(e) => update({ timeLimit: +e.target.value })}>
            {[10, 15, 20, 30, 45].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </section>

      {err && <p className="error">😬 {err}</p>}
      <button className="big-btn go" disabled={busy} onClick={start}>
        {busy ? 'Getting ready…' : mode === 'solo' ? "Let's play! 🚀" : 'Create room 🚪'}
      </button>
    </div>
  )
}
