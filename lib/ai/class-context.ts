import type { SupabaseClient, User } from "@supabase/supabase-js"

type RouteSupabase = SupabaseClient

type ClassRow = {
  id: string
  organization_id: string
  name: string
  code: string
  subject: string
  description: string
  schedule_text: string | null
  room: string | null
  semester: string | null
}

type ClassMembershipRow = {
  role: "student" | "teacher" | "ta"
}

export async function loadAiClassAccess({
  classId,
  supabase,
  user,
}: {
  classId: string
  supabase: RouteSupabase
  user: User
}) {
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select(
      "id, organization_id, name, code, subject, description, schedule_text, room, semester",
    )
    .eq("id", classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) throw classError
  const classRow = classData as ClassRow | null

  if (!classRow) {
    return { error: "Class not found.", status: 404 as const }
  }

  const [manageResult, membershipResult] = await Promise.all([
    supabase.rpc("can_manage_class", {
      target_org_id: classRow.organization_id,
      target_class_id: classRow.id,
    }),
    supabase
      .from("class_memberships")
      .select("role")
      .eq("organization_id", classRow.organization_id)
      .eq("class_id", classRow.id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  if (manageResult.error) throw manageResult.error
  if (membershipResult.error) throw membershipResult.error

  const membership = membershipResult.data as ClassMembershipRow | null
  const canManage = manageResult.data === true

  if (!canManage && !membership) {
    return {
      error: "You do not have access to this class.",
      status: 403 as const,
    }
  }

  return {
    classRow,
    canManage,
    role: canManage ? "teacher" : (membership?.role ?? "student"),
  }
}

export async function loadClassAiContext({
  classId,
  supabase,
}: {
  classId: string
  supabase: RouteSupabase
}) {
  const [materialsResult, assignmentsResult, messagesResult, examsResult] =
    await Promise.all([
      supabase
        .from("class_materials")
        .select("title, description, type, original_filename, mime_type")
        .eq("class_id", classId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("class_assignments")
        .select("title, description, due_at, max_score, status")
        .eq("class_id", classId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true })
        .limit(10),
      supabase
        .from("class_messages")
        .select("sender_role, content, kind, created_at")
        .eq("class_id", classId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("exams")
        .select(
          "title, duration_minutes, total_points, start_at, end_at, status",
        )
        .eq("class_id", classId)
        .order("start_at", { ascending: true })
        .limit(8),
    ])

  if (materialsResult.error) throw materialsResult.error
  if (assignmentsResult.error) throw assignmentsResult.error
  if (messagesResult.error) throw messagesResult.error
  if (examsResult.error) throw examsResult.error

  return {
    materials: materialsResult.data ?? [],
    assignments: assignmentsResult.data ?? [],
    exams: examsResult.data ?? [],
    recentMessages: [...(messagesResult.data ?? [])].reverse(),
  }
}

export function formatClassContext(input: {
  classRow: ClassRow
  context: Awaited<ReturnType<typeof loadClassAiContext>>
}) {
  const { classRow, context } = input
  const materials = context.materials
    .map(
      (material) =>
        `- ${material.title} (${material.type}, ${material.original_filename}): ${
          material.description || "No description"
        }`,
    )
    .join("\n")
  const assignments = context.assignments
    .map(
      (assignment) =>
        `- ${assignment.title} (${assignment.status}, ${assignment.max_score} pts, due ${assignment.due_at}): ${
          assignment.description || "No notes"
        }`,
    )
    .join("\n")
  const recentMessages = context.recentMessages
    .map(
      (message) =>
        `- ${message.sender_role} ${message.kind}: ${message.content}`,
    )
    .join("\n")
  const exams = context.exams
    .map(
      (exam) =>
        `- ${exam.title} (${exam.status}, ${exam.total_points} pts, ${exam.duration_minutes} min, starts ${exam.start_at ?? "unscheduled"}, ends ${exam.end_at ?? "unscheduled"})`,
    )
    .join("\n")

  return [
    `Class: ${classRow.name} (${classRow.code})`,
    `Subject: ${classRow.subject || "Unspecified"}`,
    `Description: ${classRow.description || "No description"}`,
    `Schedule: ${classRow.schedule_text || "No schedule"}`,
    `Room: ${classRow.room || "No room"}`,
    `Semester: ${classRow.semester || "No semester"}`,
    "",
    "Materials:",
    materials || "- None",
    "",
    "Assignments:",
    assignments || "- None",
    "",
    "Exams:",
    exams || "- None",
    "",
    "Recent class messages:",
    recentMessages || "- None",
  ].join("\n")
}
