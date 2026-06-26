import { NextResponse } from "next/server"
import {
  canViewClassForContext,
  loadClassAccessContext,
} from "@/lib/api/class-access"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { loadClass } from "@/lib/supabase/classes"

type RouteContext = {
  params: Promise<{ classId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const classRow = await loadClass(classId, supabase, user.id)
  const accessContext = await loadClassAccessContext(
    supabase,
    classRow.organization_id,
    user.id,
  )

  if (!canViewClassForContext(classRow, accessContext)) {
    return NextResponse.json(
      { error: "Class not found or unavailable" },
      { status: 404 },
    )
  }

  return NextResponse.json({ class: classRow })
}
