import type { SupabaseClient, User } from "@supabase/supabase-js"

type RouteSupabase = SupabaseClient

type ClassRow = {
  id: string
  organization_id: string
  name: string
  code: string
  description: string
  room: string | null
  semester: string | null
}

type ClassMembershipRow = {
  role: "student" | "teacher" | "ta"
}

type MaterialContextRow = {
  title: string
  description: string
  type: string
  original_filename: string
  mime_type: string
  ai_extracted_content?: string | null
  ai_extracted_content_generated_at?: string | null
  ai_summary?: string | null
  ai_summary_generated_at?: string | null
}

const MATERIAL_CONTEXT_SELECT =
  "title, description, type, original_filename, mime_type, ai_extracted_content, ai_extracted_content_generated_at, ai_summary, ai_summary_generated_at"
const MATERIAL_CONTEXT_SUMMARY_SELECT =
  "title, description, type, original_filename, mime_type, ai_summary, ai_summary_generated_at"
const MATERIAL_CONTEXT_SELECT_LEGACY =
  "title, description, type, original_filename, mime_type"
const MATERIAL_CONTENT_CHARACTER_LIMIT = 4000
const MATERIALS_CONTEXT_CHARACTER_LIMIT = 28000

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
    .select("id, organization_id, name, code, description, room, semester")
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
  let [materialsResult, assignmentsResult, messagesResult, examsResult] =
    await Promise.all([
      supabase
        .from("class_materials")
        .select(MATERIAL_CONTEXT_SELECT)
        .eq("class_id", classId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .returns<MaterialContextRow[]>(),
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

  if (isMissingExtractedContentColumnError(materialsResult.error)) {
    materialsResult = await supabase
      .from("class_materials")
      .select(MATERIAL_CONTEXT_SUMMARY_SELECT)
      .eq("class_id", classId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<MaterialContextRow[]>()
  }

  if (isMissingSummaryColumnError(materialsResult.error)) {
    materialsResult = await supabase
      .from("class_materials")
      .select(MATERIAL_CONTEXT_SELECT_LEGACY)
      .eq("class_id", classId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<MaterialContextRow[]>()
  }

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
  const materials = formatMaterialsContext(context.materials)
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
    `Description: ${classRow.description || "No description"}`,
    `Room: ${classRow.room || "No room"}`,
    `Term: ${classRow.semester || "No term"}`,
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

function formatMaterialsContext(materials: MaterialContextRow[]) {
  if (materials.length === 0) return ""

  const lines: string[] = []
  let characterCount = 0

  for (const material of materials) {
    const materialLines = [
      `- ${material.title} (${material.type}, ${material.original_filename}, ${material.mime_type})`,
      `  Description: ${material.description || "No description"}`,
    ]

    if (material.ai_extracted_content) {
      materialLines.push(
        `  Extracted content: ${compactMaterialContent(material.ai_extracted_content)}`,
      )
    } else if (material.ai_summary) {
      materialLines.push(
        `  Extracted content: Not generated yet.`,
        `  Study summary fallback: ${compactMaterialContent(material.ai_summary)}`,
      )
    } else {
      materialLines.push("  Extracted content: Not generated yet.")
    }

    const entry = materialLines.join("\n")
    const entryLength = entry.length + 1

    if (
      lines.length > 0 &&
      characterCount + entryLength > MATERIALS_CONTEXT_CHARACTER_LIMIT
    ) {
      lines.push(
        `- ${materials.length - lines.length} more material(s) exist in this class but their details were trimmed from the AI context budget.`,
      )
      break
    }

    lines.push(entry)
    characterCount += entryLength
  }

  return lines.join("\n")
}

function compactMaterialContent(content: string) {
  return content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MATERIAL_CONTENT_CHARACTER_LIMIT)
}

function isMissingSummaryColumnError(error: { message?: string } | null) {
  return (
    Boolean(error?.message?.includes("ai_summary")) ||
    Boolean(error?.message?.includes("schema cache"))
  )
}

function isMissingExtractedContentColumnError(
  error: { message?: string } | null,
) {
  return (
    Boolean(error?.message?.includes("ai_extracted_content")) ||
    Boolean(error?.message?.includes("schema cache"))
  )
}
