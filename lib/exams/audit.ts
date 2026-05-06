import { createServerClient } from "@/lib/supabase/server"
import type { JsonValue } from "@/lib/exams/types"

export async function writeExamAuditLog(input: {
  organizationId: string
  actorUserId: string | null
  action: string
  entityType: string
  entityId: string | null
  payload?: Record<string, JsonValue>
}) {
  const supabase = createServerClient()
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    payload: input.payload ?? {},
  })

  if (error) {
    throw new Error(error.message)
  }
}
