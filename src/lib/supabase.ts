import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import type { Option, QuestionType } from '../game/questions'
import type { GameSettings } from '../game/settings'

export const supabase = createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

export type Room = Omit<Database['public']['Tables']['rooms']['Row'], 'settings' | 'status' | 'phase'> & {
  settings: GameSettings
  status: 'lobby' | 'playing' | 'finished'
  phase: 'question' | 'reveal' | 'round_end' | 'finished' | null
}
export type Player = Database['public']['Tables']['players']['Row']
export type DbQuestion = Omit<Database['public']['Tables']['questions']['Row'], 'options' | 'type'> & {
  options: Option[]
  type: QuestionType
}
export type Answer = Database['public']['Tables']['answers']['Row']

/** Signs in anonymously once; the session is kept in localStorage so refreshes keep the same player. */
export async function ensureSignedIn(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user.id
  const { data: signIn, error } = await supabase.auth.signInAnonymously()
  if (error || !signIn.user) throw error ?? new Error('Could not sign in')
  return signIn.user.id
}

/** Calls an RPC and throws a friendly Error on failure. */
export async function call<T = unknown>(fn: keyof Database['public']['Functions'], args?: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.rpc(fn as any, args as any)
  if (error) throw new Error(error.message)
  return data as T
}
