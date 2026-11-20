import { useCallback, useEffect, useRef, useState } from 'react'
import { call, supabase, type Answer, type DbQuestion, type Player, type Room } from '../lib/supabase'

/** Milliseconds to add to Date.now() to get the server's clock. */
let clockOffset = 0
let clockPromise: Promise<void> | null = null
export function syncClock() {
  clockPromise ??= (async () => {
    const t0 = Date.now()
    const server = new Date(await call<string>('server_now')).getTime()
    const t1 = Date.now()
    clockOffset = server - (t0 + t1) / 2
  })().catch(() => {
    clockPromise = null
  })
  return clockPromise
}
export const serverNow = () => Date.now() + clockOffset

export interface RoomState {
  room: Room | null
  players: Player[]
  questions: DbQuestion[]
  answers: Answer[]
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Live view of one room: loads everything the player may see, keeps it current via Realtime
 * (with a slow polling fallback), and nudges the server along with `tick` when a phase runs out.
 */
export function useRoom(roomId: string | null): RoomState {
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [questions, setQuestions] = useState<DbQuestion[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!roomId) return
    const [r, p, q, a] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      supabase.from('players').select('*').eq('room_id', roomId).order('joined_at'),
      supabase.from('questions').select('*').eq('room_id', roomId).order('round').order('idx'),
      supabase.from('answers').select('*').eq('room_id', roomId),
    ])
    const err = r.error ?? p.error ?? q.error ?? a.error
    if (err) return setError(err.message)
    setError(null)
    setRoom(r.data as unknown as Room | null)
    setPlayers(p.data ?? [])
    setQuestions((q.data ?? []) as unknown as DbQuestion[])
    setAnswers(a.data ?? [])
  }, [roomId])

  // Realtime: rooms + players. Any change → reload (small rooms, so a full refresh is cheap and simple).
  useEffect(() => {
    if (!roomId) return
    void syncClock()
    void refresh()
    let pending: ReturnType<typeof setTimeout> | null = null
    const soon = () => {
      if (pending) return
      pending = setTimeout(() => {
        pending = null
        void refresh()
      }, 60)
    }
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, soon)
      // Changes are only streamed once the server confirms; reload then so nothing is missed.
      .on('system', {}, (p: { extension?: string; status?: string }) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') soon()
      })
      .subscribe()
    const poll = setInterval(soon, 5000)
    const onVisible = () => document.visibilityState === 'visible' && soon()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(poll)
      if (pending) clearTimeout(pending)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [roomId, refresh])

  // Advance the game when the current phase has run out. Every player does this; the server
  // locks the room row and ignores ticks that arrive early, so it's safe to race.
  const lastTick = useRef(0)
  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.phase_ends_at) return
    const ends = new Date(room.phase_ends_at).getTime()
    const id = setInterval(() => {
      if (serverNow() < ends + 150 || Date.now() - lastTick.current < 400) return
      lastTick.current = Date.now()
      call('tick', { p_room_id: room.id })
        .then(refresh)
        .catch(() => {})
    }, 100)
    return () => clearInterval(id)
  }, [room, refresh])

  return { room, players, questions, answers, error, refresh }
}
