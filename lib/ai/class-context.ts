import type { SupabaseClient, User } from "@supabase/supabase-js"
import { extractMaterialContentForAiAgent } from "@/lib/ai/material-extraction"
import { createServerClient } from "@/lib/supabase/server"

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
  id: string
  title: string
  description: string
  type: string
  storage_bucket: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  ai_extracted_content?: string | null
  ai_extracted_content_generated_at?: string | null
  ai_extracted_content_used_file_content?: boolean | null
}

const MATERIAL_CONTEXT_SELECT =
  "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, ai_extracted_content, ai_extracted_content_generated_at, ai_extracted_content_used_file_content"
const MATERIAL_CONTEXT_SELECT_LEGACY =
  "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes"
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
  ensureMaterialContent = false,
}: {
  classId: string
  supabase: RouteSupabase
  ensureMaterialContent?: boolean
}) {
  let canPersistExtractedContent = true
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
    canPersistExtractedContent = false
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

  const materials =
    ensureMaterialContent && canPersistExtractedContent
      ? await ensureClassMaterialsExtractedContent(
          materialsResult.data ?? [],
          classId,
        )
      : (materialsResult.data ?? [])

  return {
    materials,
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

function isMissingExtractedContentColumnError(
  error: { message?: string } | null,
) {
  return (
    Boolean(error?.message?.includes("ai_extracted_content")) ||
    Boolean(error?.message?.includes("schema cache"))
  )
}

async function ensureClassMaterialsExtractedContent(
  materials: MaterialContextRow[],
  classId: string,
) {
  const admin = createServerClient()
  const hydratedMaterials: MaterialContextRow[] = []

  for (const material of materials) {
    if (material.ai_extracted_content) {
      hydratedMaterials.push(material)
      continue
    }

    try {
      const { extractedContent, usedFileContent } =
        await extractMaterialContentForAiAgent(material)

      if (!extractedContent) {
        hydratedMaterials.push(material)
        continue
      }

      const generatedAt = new Date().toISOString()
      const { error } = await admin
        .from("class_materials")
        .update({
          ai_extracted_content: extractedContent,
          ai_extracted_content_used_file_content: usedFileContent,
          ai_extracted_content_generated_at: generatedAt,
        })
        .eq("id", material.id)
        .eq("class_id", classId)

      if (error) throw error

      hydratedMaterials.push({
        ...material,
        ai_extracted_content: extractedContent,
        ai_extracted_content_used_file_content: usedFileContent,
        ai_extracted_content_generated_at: generatedAt,
      })
    } catch {
      hydratedMaterials.push(material)
    }
  }

  return hydratedMaterials
}
