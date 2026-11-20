// Sound effects synthesized with the Web Audio API (no audio files).
// Browsers only allow audio after a user gesture; the first click unlocks it.

const KEY = 'geo-trivia:muted'
let ctx: AudioContext | null = null
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<(m: boolean) => void>()

function audio(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function isMuted() {
  return muted
}
export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem(KEY, m ? '1' : '0')
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(m))
}
export function onMuteChange(l: (m: boolean) => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, slideTo?: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + at
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12) // MIDI note → Hz

export const sfx = {
  click: () => tone(660, 0, 0.08, 'triangle', 0.12),
  pop: () => tone(500, 0, 0.12, 'sine', 0.18, 900),
  whoosh: () => tone(200, 0, 0.5, 'sine', 0.06, 1200),
  tick: () => tone(1200, 0, 0.05, 'square', 0.04),
  correct: () => [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), i * 0.08, 0.18, 'triangle', 0.16)),
  wrong: () => {
    tone(220, 0, 0.18, 'sawtooth', 0.08, 180)
    tone(160, 0.18, 0.3, 'sawtooth', 0.08, 110)
  },
  timeUp: () => tone(440, 0, 0.4, 'square', 0.06, 220),
  roundEnd: () => [67, 72, 76, 72, 79].forEach((n, i) => tone(NOTE(n), i * 0.12, 0.2, 'triangle', 0.14)),
  fanfare: () =>
    [
      [60, 0],
      [64, 0.15],
      [67, 0.3],
      [72, 0.45],
      [67, 0.7],
      [72, 0.85],
    ].forEach(([n, t]) => {
      tone(NOTE(n), t, 0.3, 'triangle', 0.16)
      tone(NOTE(n - 12), t, 0.3, 'sine', 0.08)
    }),
}
