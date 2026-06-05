import { NextResponse } from "next/server"
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

  const classRow = await loadClass(classId, supabase)
  return NextResponse.json({ class: classRow })
}
