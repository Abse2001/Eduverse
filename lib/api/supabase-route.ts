import { createServerClient } from "@supabase/ssr"
import {
  createClient as createSupabaseClient,
  type User,
} from "@supabase/supabase-js"
import { cookies } from "next/headers"

export async function createRouteSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Route handlers can set cookies, but this keeps the helper safe if
            // Next invokes it from a read-only server context.
          }
        },
      },
    },
  )
}

export async function requireRouteUser(request: Request) {
  const bearerToken = getBearerToken(request)

  if (bearerToken) {
    return requireBearerUser(bearerToken)
  }

  const supabase = await createRouteSupabaseClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return { user: null, supabase, error: "Authentication required" }
  }

  return { user: data.user, supabase, error: null }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")
  const [scheme, token] = authorization?.split(" ") ?? []

  if (scheme?.toLowerCase() !== "bearer" || !token) return null

  return token
}

async function requireBearerUser(bearerToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !publishableKey) {
    return {
      user: null,
      supabase: null,
      error:
        "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    }
  }

  const supabase = createSupabaseClient(supabaseUrl, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await supabase.auth.getUser(bearerToken)

  if (error || !data.user) {
    return { user: null, supabase, error: "Authentication required" }
  }

  return { user: data.user as User, supabase, error: null }
}
