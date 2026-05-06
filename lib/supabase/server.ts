import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js"

let serverClient: SupabaseClient<any, "public", any> | null = null

export function createServerClient() {
  if (serverClient) return serverClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    )
  }

  serverClient = createSupabaseClient<any>(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return serverClient
}
