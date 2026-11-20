// Generated from the Supabase project (generate_typescript_types), trimmed to the Database type.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' }
  public: {
    Tables: {
      answers: {
        Row: {
          answered_at: string
          choice: string
          is_correct: boolean
          ms: number
          player_id: string
          points: number
          question_id: string
          room_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      players: {
        Row: {
          answered_question_id: string | null
          avatar: string
          color: string
          id: string
          joined_at: string
          name: string
          room_id: string
          score: number
          user_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      questions: {
        Row: {
          answer_id: string
          id: string
          idx: number
          options: Json
          room_id: string
          round: number
          target_id: string
          type: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          current_q: number
          current_round: number
          host_id: string
          id: string
          phase: string | null
          phase_ends_at: string | null
          phase_started_at: string | null
          settings: Json
          status: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      create_room: { Args: { p_avatar: string; p_color: string; p_name: string; p_settings: Json }; Returns: Json }
      join_room: { Args: { p_avatar: string; p_code: string; p_color: string; p_name: string }; Returns: Json }
      leave_room: { Args: { p_room_id: string }; Returns: undefined }
      server_now: { Args: never; Returns: string }
      skip_phase: { Args: { p_room_id: string }; Returns: undefined }
      start_game: { Args: { p_questions: Json; p_room_id: string }; Returns: undefined }
      submit_answer: { Args: { p_choice: string; p_question_id: string }; Returns: undefined }
      tick: { Args: { p_room_id: string }; Returns: undefined }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
