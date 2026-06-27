import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => null)) as {
    visibleToStudents?: unknown
  } | null

  if (typeof body?.visibleToStudents !== "boolean") {
    return NextResponse.json(
      { error: "visibleToStudents must be a boolean." },
      { status: 400 },
    )
  }

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("teacher_can_toggle_results_visibility")
    .eq("id", classId)
    .maybeSingle()

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 })
  }

  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 })
  }

  const { error } = await supabase.rpc("set_class_results_visibility", {
    target_class_id: classId,
    visible_to_students: body.visibleToStudents,
    teacher_can_toggle: classRow.teacher_can_toggle_results_visibility,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
