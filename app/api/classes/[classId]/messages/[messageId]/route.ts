import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; messageId: string }>
}

type MessageRecord = {
  id: string
  organization_id: string
  class_id: string
  kind: "text" | "announcement" | "media"
}

export async function PATCH(request: Request, context: RouteContext) {
  const { classId, messageId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const { data: messageData, error: messageError } = await supabase
    .from("class_messages")
    .select("id, organization_id, class_id, kind")
    .eq("id", messageId)
    .eq("class_id", classId)
    .maybeSingle()

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 })
  }

  const message = messageData as MessageRecord | null

  if (!message || message.kind !== "announcement") {
    return NextResponse.json(
      { error: "Announcement not found." },
      { status: 404 },
    )
  }

  const { data: canManage, error: manageError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: message.organization_id,
      target_class_id: message.class_id,
    },
  )

  if (manageError) {
    return NextResponse.json({ error: manageError.message }, { status: 500 })
  }

  if (!canManage) {
    return NextResponse.json(
      { error: "Only teachers can remove announcements from the carousel." },
      { status: 403 },
    )
  }

  const { error: updateError } = await supabase
    .from("class_messages")
    .update({ show_in_announcement_carousel: false })
    .eq("id", message.id)
    .eq("class_id", classId)
    .eq("kind", "announcement")

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
