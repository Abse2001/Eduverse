import type { SupabaseClient } from "@supabase/supabase-js"

export type NotificationType =
  | "chat_announcement"
  | "session_started"
  | "material_added"
  | "assignment_published"
  | "assignment_submitted"
  | "assignment_graded"

type NotificationTarget =
  | {
      type: "class"
      classId: string
    }
  | {
      type: "person"
      userId: string
      classId?: string | null
    }

export type SendNotificationInput = {
  supabase: SupabaseClient
  organizationId: string
  actorUserId: string
  target: NotificationTarget
  notificationType: NotificationType
  title: string
  body?: string
  href: string
  metadata?: Record<string, unknown>
  eventKey?: string
}

export async function sendNotification({
  supabase,
  organizationId,
  actorUserId,
  target,
  notificationType,
  title,
  body = "",
  href,
  metadata = {},
  eventKey,
}: SendNotificationInput) {
  if (target.type === "class") {
    const { error } = await supabase.rpc("create_class_notification", {
      target_org_id: organizationId,
      target_class_id: target.classId,
      notification_actor_user_id: actorUserId,
      notification_type: notificationType,
      notification_title: title,
      notification_body: body,
      notification_href: href,
      notification_metadata: metadata,
      notification_event_key: eventKey ?? null,
    })

    if (error) throw error
    return
  }

  const { error } = await supabase.rpc("create_person_notification", {
    target_org_id: organizationId,
    target_class_id: target.classId ?? null,
    target_recipient_user_id: target.userId,
    notification_actor_user_id: actorUserId,
    notification_type: notificationType,
    notification_title: title,
    notification_body: body,
    notification_href: href,
    notification_metadata: metadata,
    notification_event_key: eventKey ?? null,
  })

  if (error) throw error
}

export function notificationHref({
  classId,
  section,
  itemId,
}: {
  classId: string
  section: "chat" | "session" | "materials" | "assignments"
  itemId?: string
}) {
  const base = `/classes/${encodeURIComponent(classId)}/${section}`
  if (!itemId) return base
  return `${base}?notification=${encodeURIComponent(itemId)}`
}
