import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Keep in sync with supabase_setup.sql
export const REGISTRATIONS_TABLE = 'code_connect_registrations'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Demo build (VITE_DEMO=1): no backend, everything runs in the browser with sample data
export const DEMO = import.meta.env.VITE_DEMO === '1'

export const isSupabaseConfigured = DEMO || Boolean(url && key)

// null when env vars are missing, so the page still renders instead of crashing
export const supabase: SupabaseClient | null = !DEMO && url && key
  ? createClient(url!, key!, { auth: { persistSession: false } })
  : null
