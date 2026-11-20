import type { ReactNode } from 'react'
import { COUNTRIES } from '../data/countries'
import type { Question } from '../game/questions'
import { Flag } from './Flag'
import { UsMap } from './UsMap'
import { WorldMap } from './WorldMap'

const LETTERS = 'ABCDEFG'

export function promptFor(q: Pick<Question, 'type' | 'targetId'>): string {
  switch (q.type) {
    case 'country':
      return 'Which country is glowing? 🔎'
    case 'state':
      return 'Which state is glowing? 🔎'
    case 'flag':
      return 'Whose flag is this? 🚩'
    case 'capital': {
      const c = COUNTRIES.find((x) => x.id === q.targetId)
      return `What's the capital of ${c?.name ?? 'this country'}? ⭐`
    }
  }
}

export interface QuestionViewProps {
  question: Pick<Question, 'type' | 'targetId' | 'options' | 'answerId'>
  /** The option this player picked, if any. */
  picked?: string | null
  /** Once true, show which option was right. */
  revealed?: boolean
  /** Buttons disabled (e.g. during the map intro). */
  locked?: boolean
  /** Extra content per option, e.g. avatars of who picked it (shown on reveal). */
  badges?: Record<string, ReactNode>
  onPick?: (optionId: string) => void
}

export function QuestionView({ question: q, picked, revealed, locked, badges, onPick }: QuestionViewProps) {
  const capital = q.type === 'capital' ? COUNTRIES.find((c) => c.id === q.targetId)?.capitalLatLng : null
  return (
    <div className={`question type-${q.type}`}>
      <h2 className="prompt">{promptFor(q)}</h2>
      <div className="visual">
        {q.type === 'flag' ? (
          <Flag countryId={q.targetId} />
        ) : q.type === 'state' ? (
          <UsMap targetId={q.targetId} revealed={revealed} />
        ) : (
          <WorldMap targetId={q.targetId} star={capital} revealed={revealed} />
        )}
      </div>
      <div className={`options n${q.options.length}`}>
        {q.options.map((o, i) => {
          const state = revealed ? (o.id === q.answerId ? 'right' : o.id === picked ? 'wrong' : 'dim') : o.id === picked ? 'picked' : ''
          return (
            <button
              key={o.id}
              className={`option c${i} ${state}`}
              disabled={revealed || locked || !!picked}
              onClick={() => onPick?.(o.id)}
            >
              <span className="letter">{LETTERS[i]}</span>
              <span className="label">{o.label}</span>
              {badges?.[o.id] && <span className="badges">{badges[o.id]}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
