import type { Area, Difficulty, QuestionType, RoundConfig } from './questions'

export interface GameSettings {
  difficulty: Difficulty
  rounds: RoundConfig[]
  questionsPerRound: number
  timeLimit: number // seconds
}

export const DEFAULT_SETTINGS: GameSettings = {
  difficulty: 'medium',
  rounds: [
    { type: 'country', area: 'World' },
    { type: 'flag', area: 'World' },
  ],
  questionsPerRound: 8,
  timeLimit: 15,
}

export const TYPE_INFO: Record<QuestionType, { label: string; emoji: string; blurb: string }> = {
  country: { label: 'Name the Country', emoji: '🗺️', blurb: 'Spot the glowing country' },
  state: { label: 'Name the State', emoji: '🇺🇸', blurb: 'Find the US state' },
  flag: { label: 'Name the Flag', emoji: '🚩', blurb: 'Whose flag is waving?' },
  capital: { label: 'Name the Capital', emoji: '⭐', blurb: 'Where is the star?' },
}

export const AREA_EMOJI: Record<Area, string> = {
  World: '🌍',
  Africa: '🦁',
  Asia: '🐼',
  Europe: '🏰',
  'North America': '🦅',
  'South America': '🦜',
  Oceania: '🐨',
}

export const DIFFICULTY_INFO: Record<Difficulty, { label: string; emoji: string; blurb: string }> = {
  easy: { label: 'Easy', emoji: '🐣', blurb: '3 choices' },
  medium: { label: 'Medium', emoji: '🦊', blurb: '5 choices' },
  hard: { label: 'Hard', emoji: '🐉', blurb: '7 tricky neighbours' },
}

/** Show on the round card: "Flags · Europe" */
export function roundLabel(r: RoundConfig): string {
  return r.type === 'state' ? TYPE_INFO.state.label : `${TYPE_INFO[r.type].label} · ${r.area}`
}
