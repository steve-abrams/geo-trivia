// A robot player for testing multiplayer: joins a room and answers each question.
// Usage: node --env-file=.env scripts/bot.mjs ABCD [name] [accuracy 0-1]
import { createClient } from '@supabase/supabase-js'

const [code, name = 'Robo', accuracy = '0.6'] = process.argv.slice(2)
if (!code) throw new Error('usage: bot.mjs <ROOM CODE> [name] [accuracy]')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
await sb.auth.signInAnonymously()
const { data: joined, error } = await sb.rpc('join_room', { p_code: code, p_name: name, p_avatar: '🤖', p_color: '#8395a7' })
if (error) throw error
console.log(`🤖 ${name} joined ${code}`)

const answered = new Set()
for (;;) {
  const { data: room } = await sb.from('rooms').select('*').eq('id', joined.room_id).single()
  if (room.status === 'finished') break
  if (room.phase === 'question') {
    const { data: q } = await sb.from('questions').select('*').eq('room_id', room.id).eq('round', room.current_round).eq('idx', room.current_q).single()
    if (q && !answered.has(q.id)) {
      answered.add(q.id)
      const wait = new Date(room.phase_started_at).getTime() - Date.now() + 800 + Math.random() * 3000
      setTimeout(async () => {
        const right = Math.random() < +accuracy
        const wrong = q.options.filter((o) => o.id !== q.answer_id)
        const choice = right ? q.answer_id : wrong[Math.floor(Math.random() * wrong.length)].id
        const { error } = await sb.rpc('submit_answer', { p_question_id: q.id, p_choice: choice })
        console.log(`  R${q.round + 1}Q${q.idx + 1}: ${right ? '✅' : '❌'} ${error ? error.message : ''}`)
      }, Math.max(0, wait))
    }
  } else if (room.phase_ends_at && Date.now() > new Date(room.phase_ends_at).getTime() + 300) {
    await sb.rpc('tick', { p_room_id: room.id })
  }
  await new Promise((r) => setTimeout(r, 300))
}
const { data: players } = await sb.from('players').select('name, score').eq('room_id', joined.room_id).order('score', { ascending: false })
console.log('🏁 final:', players.map((p) => `${p.name} ${p.score}`).join(', '))
process.exit()
