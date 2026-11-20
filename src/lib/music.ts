// Background music, synthesized live with the Web Audio API (no audio files).
// A small step sequencer schedules notes slightly ahead of time ("lookahead"),
// so timing stays tight even though JavaScript timers are jittery.

import { getAudioContext, toggle } from './sound'

export type TrackName = 'menu' | 'game'

// Chord progression I–vi–IV–V in C: C, Am, F, G (MIDI notes).
const CHORDS: Record<string, { root: number; tones: number[] }> = {
  C: { root: 36, tones: [60, 64, 67] },
  Am: { root: 33, tones: [57, 60, 64] },
  F: { root: 41, tones: [53, 57, 60] },
  G: { root: 43, tones: [55, 59, 62] },
}

interface Track {
  bpm: number
  chords: string[] // one per bar
  /** Melody: 8 eighth notes per bar. MIDI note, 0 = rest, -1 = hold the previous note. */
  melody: number[][]
  bass: (bar: number, step16: number, root: number) => number | null // returns MIDI or null
  arp: boolean // 16th-note chord sparkle
  drums: { kick: number[]; snare: number[]; hat: number[] } // 16th steps within a bar
  lead: OscillatorType
  volume: number
}

const TRACKS: Record<TrackName, Track> = {
  // Relaxed, bouncy marimba for menus and the lobby.
  menu: {
    bpm: 100,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
    melody: [
      [76, 0, 79, 0, 81, 79, 76, 0],
      [72, 0, 76, 0, 74, 72, 69, 0],
      [69, 72, 74, 0, 76, 74, 72, 0],
      [74, 0, 71, 0, 74, 76, 79, -1],
      [76, 0, 79, 0, 84, 81, 79, 0],
      [81, 79, 76, 0, 74, 76, 72, 0],
      [69, 72, 74, 76, 77, 76, 74, 72],
      [74, 76, 79, -1, 74, 0, 71, -1],
    ],
    bass: (_bar, s, root) => (s === 0 ? root : s === 8 ? root + 7 : s === 12 ? root + 12 : null),
    arp: false,
    drums: { kick: [0], snare: [], hat: [4, 12] },
    lead: 'triangle',
    volume: 0.5,
  },
  // Peppier tune while questions are on.
  game: {
    bpm: 124,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
    melody: [
      [72, 72, 0, 76, 0, 79, 76, 0],
      [69, 69, 0, 72, 0, 76, 72, 0],
      [77, 76, 74, 72, 74, 0, 69, 0],
      [71, 74, 79, 0, 77, 0, 74, 0],
      [72, 72, 0, 76, 0, 79, 84, 0],
      [81, 0, 79, 76, 0, 72, 76, 0],
      [77, 76, 74, 72, 74, 76, 77, 0],
      [79, 77, 76, 74, 71, 0, 67, 0],
    ],
    bass: (_bar, s, root) => (s % 4 === 0 ? (s % 8 === 0 ? root : root + 12) : null),
    arp: true,
    drums: { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14] },
    lead: 'square',
    volume: 0.42,
  },
}

const hz = (n: number) => 440 * 2 ** ((n - 69) / 12)

/** Everything needed to play notes into some destination (live or offline). */
interface Voice {
  ctx: BaseAudioContext
  out: AudioNode
  noise: AudioBuffer
}

function makeNoise(ctx: BaseAudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function note(v: Voice, midi: number, t: number, dur: number, type: OscillatorType, vol: number, attack = 0.01) {
  const osc = v.ctx.createOscillator()
  const g = v.ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(hz(midi), t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(v.out)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function kick(v: Voice, t: number) {
  const osc = v.ctx.createOscillator()
  const g = v.ctx.createGain()
  osc.frequency.setValueAtTime(140, t)
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  g.gain.setValueAtTime(0.5, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  osc.connect(g).connect(v.out)
  osc.start(t)
  osc.stop(t + 0.2)
}

function hiss(v: Voice, t: number, dur: number, vol: number, freq: number) {
  const src = v.ctx.createBufferSource()
  src.buffer = v.noise
  const f = v.ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = freq
  const g = v.ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(v.out)
  src.start(t)
  src.stop(t + dur + 0.02)
}

/** Schedule one 16th-note step of a track at time t. `step` counts from the start of the loop. */
function playStep(v: Voice, track: Track, step: number, t: number) {
  const s16 = 60 / track.bpm / 4
  const bars = track.chords.length
  const bar = Math.floor(step / 16) % bars
  const s = step % 16
  const chord = CHORDS[track.chords[bar]]

  // Melody on eighth notes; a following -1 extends the note.
  if (s % 2 === 0) {
    const line = track.melody[bar]
    const n = line[s / 2]
    if (n > 0) {
      let len = 1
      while (s / 2 + len < 8 && line[s / 2 + len] === -1) len++
      note(v, n, t, s16 * 2 * len * 0.9, track.lead, track.lead === 'square' ? 0.05 : 0.13)
    }
  }
  const b = track.bass(bar, s, chord.root)
  if (b !== null) note(v, b, t, s16 * 3, 'triangle', 0.22)
  if (track.arp) note(v, chord.tones[s % 3] + 12, t, s16 * 0.8, 'sine', 0.03)
  else if (s % 4 === 2) note(v, chord.tones[(s / 4) % 3 | 0], t, s16 * 3, 'sine', 0.04, 0.02)
  if (track.drums.kick.includes(s)) kick(v, t)
  if (track.drums.snare.includes(s)) hiss(v, t, 0.12, 0.12, 1500)
  if (track.drums.hat.includes(s)) hiss(v, t, 0.04, 0.05, 7000)
}

// ─── Live player ─────────────────────────────────────────────────────────────

export const musicEnabled = toggle('geo-trivia:music')

const LOOKAHEAD = 0.2 // seconds of notes scheduled ahead
const LEVEL = 1.2 // overall music level (tuned so it sits under the sound effects)
let voice: Voice | null = null
let master: GainNode | null = null
let current: TrackName | null = null
let wanted: TrackName | null = null
let step = 0
let nextTime = 0
let timer: ReturnType<typeof setInterval> | null = null
let scheduled = 0

function ensureVoice(): Voice | null {
  const ctx = getAudioContext()
  if (!ctx) return null
  if (!voice) {
    master = ctx.createGain()
    master.gain.value = 0
    // Soften the top end a little so it sits under the sound effects.
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 5000
    master.connect(lp).connect(ctx.destination)
    voice = { ctx, out: master, noise: makeNoise(ctx) }
  }
  return voice
}

function fadeTo(value: number, seconds: number) {
  if (!master || !voice) return
  const t = voice.ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.linearRampToValueAtTime(value, t + seconds)
}

function tick() {
  if (!voice || !current) return
  const track = TRACKS[current]
  const s16 = 60 / track.bpm / 4
  while (nextTime < voice.ctx.currentTime + LOOKAHEAD) {
    playStep(voice, track, step, nextTime)
    scheduled++
    step = (step + 1) % (track.chords.length * 16)
    nextTime += s16
  }
}

function start(name: TrackName) {
  const v = ensureVoice()
  if (!v) return
  current = name
  step = 0
  nextTime = v.ctx.currentTime + 0.05
  fadeTo(TRACKS[name].volume * LEVEL, 0.6)
  timer ??= setInterval(tick, 50)
  tick()
}

let generation = 0 // bumps on every change so stale fade-out callbacks do nothing

/** Bring playback in line with what's wanted, the music switch and tab visibility. */
function apply() {
  const target = musicEnabled.get() && document.visibilityState === 'visible' ? wanted : null
  const gen = ++generation
  if (target && target === current) {
    fadeTo(TRACKS[target].volume * LEVEL, 0.4) // e.g. switched back on mid-fade
    return
  }
  if (!current) {
    if (target) start(target)
    return
  }
  // Something is playing: fade it out, then start the new tune or go quiet.
  fadeTo(0, 0.3)
  setTimeout(() => {
    if (gen !== generation) return
    current = null
    if (target) start(target)
    else if (timer) {
      clearInterval(timer)
      timer = null
    }
  }, 330)
}

/** Ask for a tune (or silence). Safe to call on every render. */
export function playMusic(name: TrackName | null) {
  if (wanted === name) return
  wanted = name
  apply()
}

/** Briefly lower the music, e.g. under the winner fanfare. */
export function duckMusic(seconds: number) {
  if (!current) return
  fadeTo(TRACKS[current].volume * LEVEL * 0.25, 0.15)
  setTimeout(() => current && fadeTo(TRACKS[current].volume * LEVEL, 0.8), seconds * 1000)
}

export function musicStats() {
  return { wanted, current, scheduled, gain: master?.gain.value ?? 0, state: voice?.ctx.state ?? 'none' }
}

musicEnabled.subscribe(() => apply())
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', apply)
  // Browsers block audio until the first tap/click; start then.
  const unlock = () => {
    getAudioContext()
    if (current === null) apply()
  }
  document.addEventListener('pointerdown', unlock, { capture: true })
  document.addEventListener('keydown', unlock, { capture: true })
}

// ─── Offline rendering (for checking levels without speakers) ───────────────

export async function renderTrack(name: TrackName, seconds: number, sampleRate = 22050) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate)
  const g = ctx.createGain()
  g.gain.value = TRACKS[name].volume * LEVEL
  g.connect(ctx.destination)
  const v: Voice = { ctx, out: g, noise: makeNoise(ctx) }
  const track = TRACKS[name]
  const s16 = 60 / track.bpm / 4
  for (let i = 0, t = 0; t < seconds; i++, t += s16) playStep(v, track, i, t)
  return ctx.startRendering()
}

// Dev-only handle for checking playback from the browser console.
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __music: { musicStats, renderTrack } })
