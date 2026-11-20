import confetti from 'canvas-confetti'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Timer } from '../components/bits'
import { QuestionView } from '../components/QuestionView'
import { roundLabel, TYPE_INFO, AREA_EMOJI } from '../game/settings'
import { serverNow, useRoom } from '../game/useRoom'
import { saveProfile, type Profile } from '../lib/profile'
import { duckMusic, playMusic } from '../lib/music'
import { sfx } from '../lib/sound'
import { call, ensureSignedIn, type Answer, type DbQuestion, type Player, type Room as RoomRow } from '../lib/supabase'
import { go } from '../router'
import { ProfileEditor } from './Home'
import { questionsFor } from './Setup'

type Ctx = {
  room: RoomRow
  players: Player[]
  questions: DbQuestion[]
  answers: Answer[]
  me: Player | undefined
  isHost: boolean
  refresh: () => Promise<void>
}

export function RoomScreen({ code, profile, setProfile }: { code: string; profile: Profile; setProfile: (p: Profile) => void }) {
  const [roomId, setRoomId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [needsProfile, setNeedsProfile] = useState(!profile.name.trim())

  useEffect(() => {
    if (needsProfile) return
    let cancelled = false
    ;(async () => {
      try {
        const uid = await ensureSignedIn()
        const res = await call<{ room_id: string }>('join_room', {
          p_code: code,
          p_name: profile.name.trim(),
          p_avatar: profile.avatar,
          p_color: profile.color,
        })
        if (!cancelled) {
          setUserId(uid)
          setRoomId(res.room_id)
          sfx.pop()
        }
      } catch (e) {
        if (!cancelled) setJoinError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, needsProfile])

  const state = useRoom(roomId)
  const status = state.room?.status
  useEffect(() => {
    playMusic(status === 'playing' ? 'game' : 'menu')
  }, [status])

  if (needsProfile)
    return (
      <div className="screen">
        <div className="card">
          <h3>Joining room {code} — who are you?</h3>
          <ProfileEditor profile={profile} onChange={(p) => (setProfile(p), saveProfile(p))} />
          <button className="big-btn go" disabled={!profile.name.trim()} onClick={() => setNeedsProfile(false)}>
            Join game ➜
          </button>
        </div>
      </div>
    )

  if (joinError)
    return (
      <div className="screen center">
        <div className="card">
          <h2>😕 {joinError === 'room not found' ? `We couldn't find room ${code}` : joinError === 'game already started' ? 'That game already started' : joinError}</h2>
          <button className="big-btn go" onClick={() => go('/')}>
            Back home
          </button>
        </div>
      </div>
    )

  const { room, players, questions, answers, refresh } = state
  if (!room) return <div className="screen center loading">🌍 Finding room {code}…</div>

  const me = players.find((p) => p.user_id === userId)
  const ctx: Ctx = { room, players, questions, answers, me, isHost: room.host_id === userId, refresh }

  const leave = async () => {
    if (room.status === 'playing' && !confirm('Leave this game?')) return
    await call('leave_room', { p_room_id: room.id }).catch(() => {})
    go('/')
  }

  return (
    <div className={`screen room phase-${room.phase ?? room.status}`}>
      <header className="bar">
        <button className="back" onClick={leave} aria-label="Leave game">
          🏠
        </button>
        {players.length > 1 || room.status === 'lobby' ? <span className="room-code">Room {room.code}</span> : <span className="room-code">Solo</span>}
      </header>
      {room.status === 'lobby' && <Lobby {...ctx} />}
      {room.status === 'playing' && (room.phase === 'question' || room.phase === 'reveal') && <Play {...ctx} />}
      {room.status === 'playing' && room.phase === 'round_end' && <RoundEnd {...ctx} />}
      {room.status === 'finished' && <Final {...ctx} />}
    </div>
  )
}

// ─── Lobby ───────────────────────────────────────────────────────────────────

function Lobby({ room, players, isHost, refresh }: Ctx) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const count = useRef(players.length)
  useEffect(() => {
    if (players.length > count.current) sfx.pop()
    count.current = players.length
  }, [players.length])

  const link = `${location.origin}${location.pathname}#/room/${room.code}`
  const start = async () => {
    setBusy(true)
    sfx.whoosh()
    try {
      await call('start_game', { p_room_id: room.id, p_questions: questionsFor(room.settings) })
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="lobby">
      <div className="card code-card">
        <p>Join at this page with code</p>
        <div className="big-code">{room.code}</div>
        <button
          className="btn small"
          onClick={() => {
            void navigator.clipboard?.writeText(link)
            setCopied(true)
            sfx.click()
          }}
        >
          {copied ? '✅ Link copied!' : '🔗 Copy invite link'}
        </button>
      </div>

      <div className="card">
        <h3>Players ({players.length})</h3>
        <div className="lobby-players">
          {players.map((p) => (
            <div key={p.id} className="lobby-player">
              <Avatar emoji={p.avatar} color={p.color} size={64} />
              <span>
                {p.name}
                {p.user_id === room.host_id && ' 👑'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>The game</h3>
        <ol className="round-list">
          {room.settings.rounds.map((r, i) => (
            <li key={i}>
              {TYPE_INFO[r.type].emoji} {roundLabel(r)} {r.type !== 'state' && AREA_EMOJI[r.area]}
            </li>
          ))}
        </ol>
        <p className="muted">
          {room.settings.questionsPerRound} questions per round · {room.settings.timeLimit}s each · {room.settings.difficulty}
        </p>
      </div>

      {err && <p className="error">😬 {err}</p>}
      {isHost ? (
        <button className="big-btn go" disabled={busy} onClick={start}>
          {busy ? 'Starting…' : players.length < 2 ? 'Start (just me) 🚀' : `Start with ${players.length} players 🚀`}
        </button>
      ) : (
        <p className="waiting">Waiting for the host to start… 🕐</p>
      )}
    </div>
  )
}

// ─── Question + reveal ───────────────────────────────────────────────────────

function Play({ room, players, questions, answers, me, isHost }: Ctx) {
  const q = questions.find((x) => x.round === room.current_round && x.idx === room.current_q)
  const [picked, setPicked] = useState<{ q: string; choice: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const revealed = room.phase === 'reveal'
  const opensAt = room.phase_started_at ? new Date(room.phase_started_at).getTime() : 0
  const endsAt = room.phase_ends_at ? new Date(room.phase_ends_at).getTime() : 0
  const [open, setOpen] = useState(false)

  // Unlock the answers once the map intro is over.
  useEffect(() => {
    setOpen(false)
    if (room.phase !== 'question') return
    const wait = opensAt - serverNow()
    const t = setTimeout(() => setOpen(true), Math.max(0, wait))
    return () => clearTimeout(t)
  }, [opensAt, room.phase])

  const myAnswer = q && me ? answers.find((a) => a.question_id === q.id && a.player_id === me.id) : undefined
  const myChoice = myAnswer?.choice ?? (picked && q && picked.q === q.id ? picked.choice : null)

  // Reveal effects (once per question).
  const celebrated = useRef<string | null>(null)
  useEffect(() => {
    if (!revealed || !q || celebrated.current === q.id) return
    celebrated.current = q.id
    if (myAnswer?.is_correct) {
      sfx.correct()
      void confetti({ particleCount: myAnswer.points > 10 ? 120 : 60, spread: 70, origin: { y: 0.7 } })
    } else sfx.wrong()
  }, [revealed, q, myAnswer])

  if (!q) return <div className="loading">Loading question…</div>

  const pick = async (choice: string) => {
    setPicked({ q: q.id, choice })
    sfx.click()
    try {
      await call('submit_answer', { p_question_id: q.id, p_choice: choice })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const qAnswers = answers.filter((a) => a.question_id === q.id)
  const byPlayer = new Map(players.map((p) => [p.id, p]))
  const badges: Record<string, React.ReactNode> = {}
  if (revealed && players.length > 1)
    for (const a of qAnswers) {
      const p = byPlayer.get(a.player_id)
      if (p)
        badges[a.choice] = (
          <>
            {badges[a.choice]}
            <Avatar key={p.id} emoji={p.avatar} color={p.color} size={26} title={p.name} />
          </>
        )
    }

  const total = room.settings.questionsPerRound
  const round = room.settings.rounds[room.current_round]

  return (
    <div className="play">
      <div className="play-head">
        <span className="pill">
          {TYPE_INFO[round.type].emoji} Round {room.current_round + 1}/{room.settings.rounds.length}
        </span>
        <span className="pill">
          Question {room.current_q + 1}/{total}
        </span>
        {me && <span className="pill score">⭐ {me.score}</span>}
      </div>

      <Timer key={`t-${q.id}`} opensAt={opensAt || endsAt} endsAt={endsAt} running={!revealed} />

      <QuestionView
        key={`q-${q.id}`}
        question={{ type: q.type, targetId: q.target_id, options: q.options, answerId: q.answer_id }}
        picked={myChoice}
        revealed={revealed}
        locked={!open}
        badges={badges}
        onPick={pick}
      />

      {err && !revealed && <p className="error">😬 {err}</p>}

      {revealed && (
        <div className="reveal-banner">
          {myAnswer?.is_correct ? (
            <>
              🎉 Correct! <b>+{myAnswer.points}</b>
              {myAnswer.points > 10 && ' ⚡ Fastest!'}
            </>
          ) : myAnswer ? (
            <>Oops! It was {q.options.find((o) => o.id === q.answer_id)?.label} 💪</>
          ) : (
            <>⏰ Time's up! It was {q.options.find((o) => o.id === q.answer_id)?.label}</>
          )}
          {isHost && (
            <button className="btn small next" onClick={() => call('skip_phase', { p_room_id: room.id })}>
              Next ➜
            </button>
          )}
        </div>
      )}

      {players.length > 1 && <PlayerStrip players={players} answers={qAnswers} questionId={q.id} revealed={revealed} />}
    </div>
  )
}

function PlayerStrip({ players, answers, questionId, revealed }: { players: Player[]; answers: Answer[]; questionId: string; revealed: boolean }) {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  return (
    <div className="strip">
      {sorted.map((p) => {
        const a = answers.find((x) => x.player_id === p.id)
        const answered = p.answered_question_id === questionId
        return (
          <div key={p.id} className={`strip-player ${answered ? 'answered' : ''}`}>
            <Avatar emoji={p.avatar} color={p.color} size={40} />
            <span className="strip-name">{p.name}</span>
            <span className="strip-score">{p.score}</span>
            {!revealed && answered && <span className="tick">✓</span>}
            {revealed && a && a.points > 0 && <span className="gain">+{a.points}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Round end + final ───────────────────────────────────────────────────────

function roundPoints(players: Player[], questions: DbQuestion[], answers: Answer[], round: number) {
  const ids = new Set(questions.filter((q) => q.round === round).map((q) => q.id))
  const pts = new Map(players.map((p) => [p.id, { pts: 0, right: 0 }]))
  for (const a of answers)
    if (ids.has(a.question_id) && pts.has(a.player_id)) {
      const e = pts.get(a.player_id)!
      e.pts += a.points
      if (a.is_correct) e.right++
    }
  return players.map((p) => ({ player: p, ...pts.get(p.id)! })).sort((a, b) => b.pts - a.pts)
}

function RoundEnd({ room, players, questions, answers, isHost }: Ctx) {
  const rows = useMemo(() => roundPoints(players, questions, answers, room.current_round), [players, questions, answers, room.current_round])
  const best = rows[0]?.pts ?? 0
  const winners = rows.filter((r) => r.pts === best && best > 0)
  const solo = players.length === 1
  const last = room.current_round + 1 >= room.settings.rounds.length
  const endsAt = room.phase_ends_at ? new Date(room.phase_ends_at).getTime() : 0

  useEffect(() => {
    duckMusic(1.5)
    sfx.roundEnd()
    if (best > 0) void confetti({ particleCount: 100, spread: 90, origin: { y: 0.4 } })
  }, [best])

  return (
    <div className="round-end">
      <div className="card center">
        <p className="muted">Round {room.current_round + 1} complete!</p>
        {solo ? (
          <h2>
            You got {rows[0].right} of {room.settings.questionsPerRound} right! {rows[0].right === room.settings.questionsPerRound ? '🏆' : '🌟'}
          </h2>
        ) : winners.length ? (
          <>
            <div className="winner-avatars">
              {winners.map((w) => (
                <Avatar key={w.player.id} emoji={w.player.avatar} color={w.player.color} size={96} />
              ))}
            </div>
            <h2>
              {winners.map((w) => w.player.name).join(' & ')} {winners.length > 1 ? 'win' : 'wins'} the round! 🏆
            </h2>
          </>
        ) : (
          <h2>Nobody scored this round — keep exploring! 🧭</h2>
        )}
      </div>

      {!solo && (
        <div className="card">
          <table className="scores">
            <thead>
              <tr>
                <th />
                <th>This round</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.player.id}>
                  <td>
                    <Avatar emoji={r.player.avatar} color={r.player.color} size={30} /> {r.player.name}
                  </td>
                  <td>+{r.pts}</td>
                  <td>
                    <b>{r.player.score}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="center">
        <Timer opensAt={endsAt - 8000} endsAt={endsAt} running />
        <p className="muted">{last ? 'Final results coming up…' : `Next: ${roundLabel(room.settings.rounds[room.current_round + 1])}`}</p>
        {isHost && (
          <button className="btn" onClick={() => call('skip_phase', { p_room_id: room.id })}>
            {last ? 'See results ➜' : 'Next round ➜'}
          </button>
        )}
      </div>
    </div>
  )
}

function Final({ room, players, answers, me }: Ctx) {
  const ranked = [...players].sort((a, b) => b.score - a.score)
  const top = ranked[0]?.score ?? 0
  const winners = ranked.filter((p) => p.score === top && top > 0)
  const solo = players.length === 1
  const totalQ = room.settings.questionsPerRound * room.settings.rounds.length
  const myRight = answers.filter((a) => a.player_id === me?.id && a.is_correct).length

  useEffect(() => {
    duckMusic(3)
    sfx.fanfare()
    const end = Date.now() + 2000
    const colors = ['#ff6fb5', '#ffc93d', '#3dbbff', '#2ed3a0']
    const frame = () => {
      void confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors })
      void confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
  }, [])

  return (
    <div className="final">
      <h1 className="logo">{solo ? '🎉 Game over!' : '🏆 Champions!'}</h1>
      {solo ? (
        <div className="card center">
          <Avatar emoji={me?.avatar ?? '🌍'} color={me?.color ?? '#fff'} size={110} />
          <h2>
            {myRight} of {totalQ} right · {me?.score ?? 0} points
          </h2>
          <p className="muted">
            {myRight === totalQ ? 'Perfect game! You are a geography genius! 🧠' : myRight >= totalQ * 0.7 ? 'Amazing exploring! 🧭' : 'Every game makes you smarter. Play again! 🌱'}
          </p>
        </div>
      ) : (
        <>
          <div className="podium">
            {[ranked[1], ranked[0], ranked[2]].map(
              (p, i) =>
                p && (
                  <div key={p.id} className={`podium-step step-${[2, 1, 3][i]}`}>
                    <Avatar emoji={p.avatar} color={p.color} size={[70, 96, 60][i]} />
                    <span className="podium-name">{p.name}</span>
                    <div className="podium-block">
                      <span className="place">{['🥈', '🥇', '🥉'][i]}</span>
                      <span>{p.score}</span>
                    </div>
                  </div>
                ),
            )}
          </div>
          <h2 className="center">{winners.length ? `${winners.map((w) => w.name).join(' & ')} ${winners.length > 1 ? 'win' : 'wins'}! 🎉` : 'What a game!'}</h2>
          {ranked.length > 3 && (
            <div className="card">
              <ol className="rest" start={4}>
                {ranked.slice(3).map((p) => (
                  <li key={p.id}>
                    <Avatar emoji={p.avatar} color={p.color} size={28} /> {p.name} — {p.score}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
      <div className="home-actions">
        <button className="big-btn solo" onClick={() => go(solo ? '/setup/solo' : '/setup/party')}>
          <span className="emoji">🔁</span>
          Play again
        </button>
        <button className="big-btn party" onClick={() => go('/')}>
          <span className="emoji">🏠</span>
          Home
        </button>
      </div>
    </div>
  )
}
