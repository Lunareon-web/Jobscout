import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export type Database = {
  public: {
    Tables: {
      jobs: {
        Row: {
          id: string
          titel: string
          unternehmen: string
          ort: string
          plz: string | null
          datum: string | null
          url: string
          quelle: string
          beschreibung: string | null
          arbeitszeit: string | null
          kategorie: string
          search_run_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['jobs']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>
      }
      favorites: {
        Row: {
          id: string
          user_id: string
          job_id: string
          notiz: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['favorites']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['favorites']['Insert']>
      }
      search_runs: {
        Row: {
          id: string
          config: Record<string, unknown>
          result_count: number
          sources_log: Record<string, unknown>[]
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['search_runs']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['search_runs']['Insert']>
      }
    }
  }
}
