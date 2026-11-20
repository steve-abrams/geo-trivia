// End-to-end smoke test against the real Supabase project:
// two anonymous players create/join a room, play one question, and Realtime delivers the updates.
// Usage: node --env-file=.env scripts/smoke.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const mk = () => createClient(url, key, { auth: { persistSession: false } })
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`)
  if (!cond) process.exitCode = 1
}
const rpc = async (c, fn, args) => {
  const { data, error } = await c.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

const host = mk()
const guest = mk()
await host.auth.signInAnonymously()
await guest.auth.signInAnonymously()

const settings = { difficulty: 'easy', rounds: [{ type: 'flag', area: 'Europe' }], questionsPerRound: 3, timeLimit: 10 }
const room = await rpc(host, 'create_room', { p_settings: settings, p_name: 'Host', p_avatar: '🦊', p_color: '#ff8800' })
ok(/^[A-Z]{4}$/.test(room.code), `room created with code ${room.code}`)
await rpc(guest, 'join_room', { p_code: room.code, p_name: 'Guest', p_avatar: '🐼', p_color: '#00aaff' })

// Guest listens for room + player changes.
const events = []
const channel = guest
  .channel(`room:${room.room_id}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.room_id}` }, (p) =>
    events.push(`rooms:${p.new.phase ?? p.new.status}`),
  )
  .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.room_id}` }, (p) =>
    events.push(`players:${p.new.name}:${p.new.score}`),
  )
  // postgres_changes is only live once the server confirms it (after SUBSCRIBED).
  .on('system', {}, (p) => p.extension === 'postgres_changes' && p.status === 'ok' && (channel.ready = true))
channel.subscribe()
for (let i = 0; i < 50 && !channel.ready; i++) await new Promise((r) => setTimeout(r, 100))
ok(channel.ready, 'realtime subscription confirmed')

const { data: players } = await guest.from('players').select('name').eq('room_id', room.room_id)
ok(players?.length === 2, `guest sees ${players?.length} players`)

const opts = [{ id: '250', label: 'France' }, { id: '276', label: 'Germany' }, { id: '380', label: 'Italy' }]
const questions = [0, 1, 2].map((idx) => ({ round: 0, idx, type: 'flag', targetId: '250', answerId: '250', options: opts }))
await rpc(host, 'start_game', { p_room_id: room.room_id, p_questions: questions })

const { data: qs } = await guest.from('questions').select('id, idx, options').eq('room_id', room.room_id)
ok(qs?.length === 1 && qs[0].idx === 0, 'guest sees only the first question')

const serverNow = new Date(await rpc(guest, 'server_now'))
ok(Math.abs(serverNow.getTime() - Date.now()) < 5000, `server clock offset ${serverNow.getTime() - Date.now()} ms`)

await new Promise((r) => setTimeout(r, 700)) // let the 0.5 s flag intro pass
await rpc(host, 'submit_answer', { p_question_id: qs[0].id, p_choice: '250' })
await rpc(guest, 'submit_answer', { p_question_id: qs[0].id, p_choice: '250' })

await new Promise((r) => setTimeout(r, 1500))
const { data: answers } = await guest.from('answers').select('points, ms, player_id').eq('question_id', qs[0].id)
ok(answers?.length === 2, 'both answers visible after reveal')
ok(answers?.map((a) => a.points).sort().join() === '10,15', `points ${answers?.map((a) => `${a.points} (${a.ms}ms)`).join(', ')}`)

for (let i = 0; i < 50 && !(events.includes('rooms:reveal') && events.some((e) => e.endsWith(':15'))); i++)
  await new Promise((r) => setTimeout(r, 100))
console.log('realtime events:', events.join(' | '))
ok(events.includes('rooms:question') && events.includes('rooms:reveal'), 'realtime delivered phase changes')
ok(events.some((e) => e.endsWith(':15')), 'realtime delivered score updates')

await rpc(host, 'leave_room', { p_room_id: room.room_id })
await rpc(guest, 'leave_room', { p_room_id: room.room_id })
await guest.removeAllChannels()
process.exit()
