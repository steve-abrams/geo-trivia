export interface Profile {
  name: string
  avatar: string
  color: string
}

export const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐯', '🐨', '🐵', '🦄', '🐙', '🐧', '🦖', '🐢', '🦉', '🐬', '🦒', '🐞', '🐳', '🦩']
export const COLORS = ['#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1', '#48dbfb', '#54a0ff', '#5f27cd', '#ff6fb5', '#10ac84', '#8395a7']

const KEY = 'geo-trivia:profile'

export function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return p && p.name ? p : null
  } catch {
    return null
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* private mode: keep it in memory only */
  }
}

export function randomProfile(): Profile {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
  return { name: '', avatar: pick(AVATARS), color: pick(COLORS) }
}
