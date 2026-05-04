import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

export async function DELETE(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { supabase, error: authError } = await requireRouteUser(request)

  if (authError || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id")
    .eq("id", classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 })
  }

  if (!classData) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 })
  }

  const { data: canManage, error: manageError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: classData.organization_id,
      target_class_id: classData.id,
    },
  )

  if (manageError) {
    return NextResponse.json({ error: manageError.message }, { status: 500 })
  }

  if (!canManage) {
    return NextResponse.json(
      { error: "Only class managers can end live sessions." },
      { status: 403 },
    )
  }

  const { error } = await supabase
    .from("class_live_sessions")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("class_id", classData.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
