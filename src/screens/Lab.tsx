import { useMemo, useState } from 'react'
import { CONTINENTS } from '../data/countries'
import { QuestionView } from '../components/QuestionView'
import { generateRound, mulberry32, type Area, type Difficulty, type QuestionType } from '../game/questions'

const TYPES: { id: QuestionType; label: string }[] = [
  { id: 'country', label: '🗺️ Name the country' },
  { id: 'state', label: '🇺🇸 Name the state' },
  { id: 'flag', label: '🚩 Name the flag' },
  { id: 'capital', label: '⭐ Name the capital' },
]

/** Temporary "question lab" for trying out maps and the question generator. */
export function Lab() {
  const [type, setType] = useState<QuestionType>(
    (new URLSearchParams(location.search).get('type') as QuestionType | null) ?? 'country',
  )
  const [area, setArea] = useState<Area>('World')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [seed, setSeed] = useState(1)
  const [picked, setPicked] = useState<string | null>(null)

  const question = useMemo(() => {
    const q = generateRound({ type, area }, 0, 1, difficulty, mulberry32(seed))[0]
    // ?id=<target> pins the target, handy for checking specific maps.
    const pinned = new URLSearchParams(location.search).get('id')
    return pinned && seed === 1 ? { ...q, targetId: pinned, answerId: pinned } : q
  }, [type, area, difficulty, seed])

  const next = () => {
    setPicked(null)
    setSeed(Math.floor(Math.random() * 1e9) + 1)
  }

  return (
    <main className="lab">
      <h1 className="title">
        Geo Trivia <span className="tag">question lab</span>
      </h1>
      <div className="controls">
        <select value={type} onChange={(e) => (setType(e.target.value as QuestionType), next())}>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={area} disabled={type === 'state'} onChange={(e) => (setArea(e.target.value as Area), next())}>
          {['World', ...CONTINENTS].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={difficulty} onChange={(e) => (setDifficulty(e.target.value as Difficulty), next())}>
          <option value="easy">Easy (3)</option>
          <option value="medium">Medium (5)</option>
          <option value="hard">Hard (7)</option>
        </select>
        <button className="next" onClick={next}>
          Next ➜
        </button>
      </div>
      <QuestionView question={question} picked={picked} revealed={!!picked} onPick={setPicked} />
    </main>
  )
}
