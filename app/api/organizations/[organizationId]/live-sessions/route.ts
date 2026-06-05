import { NextResponse } from "next/server"
import { loadClassLiveSessions } from "@/lib/api/app-context"
import { requireRouteUser } from "@/lib/api/supabase-route"

type RouteContext = {
  params: Promise<{ organizationId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { organizationId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const liveSessions = await loadClassLiveSessions(supabase, organizationId)
  return NextResponse.json({ liveSessions })
}
