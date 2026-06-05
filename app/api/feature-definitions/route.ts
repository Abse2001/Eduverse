import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { loadFeatureDefinitions } from "@/lib/supabase/features"

export async function GET(request: Request) {
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const featureDefinitions = await loadFeatureDefinitions(supabase)
  return NextResponse.json({ featureDefinitions })
}
