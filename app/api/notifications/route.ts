import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type NotificationRow = {
  id: string
  organization_id: string
  class_id: string | null
  recipient_role: "org_owner" | "org_admin" | "teacher" | "student"
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

  const url = new URL(request.url)
  const organizationId = url.searchParams.get("organizationId")
  let notificationsQuery = supabase
    .from("notifications")
    .select(
      "id, organization_id, class_id, recipient_role, actor_user_id, type, title, body, href, metadata, read_at, created_at",
    )
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30)
  let unreadQuery = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", user.id)
    .is("read_at", null)

  if (organizationId) {
    notificationsQuery = notificationsQuery.eq(
      "organization_id",
      organizationId,
    )
    unreadQuery = unreadQuery.eq("organization_id", organizationId)
  }

  const [notificationsResult, unreadResult] = await Promise.all([
    notificationsQuery,
    unreadQuery,
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
    recipientRole: row.recipient_role,
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
