import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { loadOrganizationClasses } from "@/lib/supabase/classes"

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

  const classes = await loadOrganizationClasses(organizationId, supabase)
  return NextResponse.json({ classes })
}
