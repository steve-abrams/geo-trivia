import { useEffect, useRef, useState } from 'react'
import { isMuted, onMuteChange, setMuted, sfx } from '../lib/sound'
import { serverNow } from '../game/useRoom'

export function Avatar({ emoji, color, size = 44, title }: { emoji: string; color: string; size?: number; title?: string }) {
  return (
    <span className="avatar" title={title} style={{ background: color, width: size, height: size, fontSize: size * 0.58 }}>
      {emoji}
    </span>
  )
}

export function MuteButton() {
  const [m, setM] = useState(isMuted())
  useEffect(() => {
    const off = onMuteChange(setM)
    return () => void off()
  }, [])
  return (
    <button className="mute" aria-label={m ? 'Turn sound on' : 'Turn sound off'} onClick={() => setMuted(!m)}>
      {m ? '🔇' : '🔊'}
    </button>
  )
}

/** Re-renders every animation frame while mounted; returns server time in ms. */
function useServerTime(active: boolean) {
  const [now, setNow] = useState(serverNow())
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      setNow(serverNow())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return now
}

/** Countdown bar. Before `opensAt` it shows "Get ready". Ticks during the last 5 seconds. */
export function Timer({ opensAt, endsAt, running }: { opensAt: number; endsAt: number; running: boolean }) {
  const now = useServerTime(running)
  const total = endsAt - opensAt
  const left = Math.max(0, endsAt - Math.max(now, opensAt))
  const secs = Math.ceil(left / 1000)
  const ready = now < opensAt
  const lastSec = useRef(secs)
  useEffect(() => {
    if (running && !ready && secs !== lastSec.current && secs <= 5 && secs > 0) sfx.tick()
    if (running && secs === 0 && lastSec.current > 0) sfx.timeUp()
    lastSec.current = secs
  }, [secs, running, ready])
  const pct = running ? (left / total) * 100 : 0
  return (
    <div className={`timer ${secs <= 5 && running && !ready ? 'hurry' : ''}`}>
      <div className="timer-bar" style={{ width: `${ready ? 100 : pct}%` }} />
      <span className="timer-label">{!running ? "Time's up!" : ready ? 'Get ready…' : `${secs}s`}</span>
    </div>
  )
}
