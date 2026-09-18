import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** false, wenn die Vercel-Env-Vars fehlen — App rendert dann trotzdem (Banner statt White Screen). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlt in den Vercel Env Vars)')
  }
  if (!client) {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return client
}

/**
 * Lazy Proxy: wirft erst bei tatsächlicher Nutzung, nie beim Import.
 * Verhindert White Screen, wenn die Env Vars im Deploy fehlen.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getSupabase() as unknown as Record<string | symbol, unknown>
    const v = c[prop]
    return typeof v === 'function' ? (v as Function).bind(c) : v
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
