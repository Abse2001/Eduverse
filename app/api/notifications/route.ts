import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type NotificationRow = {
  id: string
  organization_id: string
  class_id: string | null
  actor_user_id: string | null
  type:
    | "chat_announcement"
    | "session_started"
    | "material_added"
    | "assignment_published"
    | "assignment_submitted"
    | "assignment_graded"
  title: string
  body: string
  href: string
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export async function GET(request: Request) {
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const [notificationsResult, unreadResult] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id, organization_id, class_id, actor_user_id, type, title, body, href, metadata, read_at, created_at",
      )
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", user.id)
      .is("read_at", null),
  ])

  if (notificationsResult.error) {
    return NextResponse.json(
      { error: notificationsResult.error.message },
      { status: 500 },
    )
  }

  if (unreadResult.error) {
    return NextResponse.json(
      { error: unreadResult.error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({
    notifications: ((notificationsResult.data ?? []) as NotificationRow[]).map(
      toNotificationResponse,
    ),
    unreadCount: unreadResult.count ?? 0,
  })
}

function toNotificationResponse(row: NotificationRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    actorUserId: row.actor_user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    metadata: row.metadata,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}
