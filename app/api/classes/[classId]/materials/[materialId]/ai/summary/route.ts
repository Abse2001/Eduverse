import { NextResponse } from "next/server"
import { loadAiClassAccess } from "@/lib/ai/class-context"
import {
  cachedStudyContent,
  extractMaterialContentForAiAgent,
  generateMaterialStudySummary,
} from "@/lib/ai/material-extraction"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { createServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; materialId: string }>
}

type MaterialRow = {
  id: string
  title: string
  description: string
  type: "image" | "pdf" | "video" | "slide"
  storage_bucket: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  ai_summary: string | null
  ai_summary_used_file_text: boolean | null
  ai_summary_generated_at: string | null
  ai_extracted_content: string | null
  ai_extracted_content_used_file_content: boolean | null
  ai_extracted_content_generated_at: string | null
  deleted_at: string | null
}

const MATERIAL_SELECT =
  "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, ai_summary, ai_summary_used_file_text, ai_summary_generated_at, ai_extracted_content, ai_extracted_content_used_file_content, ai_extracted_content_generated_at, deleted_at"
const MATERIAL_SELECT_SUMMARY =
  "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, ai_summary, ai_summary_used_file_text, ai_summary_generated_at, deleted_at"
const MATERIAL_SELECT_LEGACY =
  "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, deleted_at"

export async function POST(request: Request, context: RouteContext) {
  const { classId, materialId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  try {
    const access = await loadAiClassAccess({ classId, supabase, user })
    if ("error" in access) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      )
    }

    let result = await supabase
      .from("class_materials")
      .select(MATERIAL_SELECT)
      .eq("id", materialId)
      .eq("class_id", classId)
      .maybeSingle()

    let canPersistExtractedContent = true
    if (isMissingExtractedContentColumnError(result.error)) {
      canPersistExtractedContent = false
      result = await supabase
        .from("class_materials")
        .select(MATERIAL_SELECT_SUMMARY)
        .eq("id", materialId)
        .eq("class_id", classId)
        .maybeSingle()
    }

    const canPersistSummary = !isMissingSummaryColumnError(result.error)
    if (!canPersistSummary) {
      result = await supabase
        .from("class_materials")
        .select(MATERIAL_SELECT_LEGACY)
        .eq("id", materialId)
        .eq("class_id", classId)
        .maybeSingle()
    }

    const { data, error } = result
    if (error) throw error
    const material = data as MaterialRow | null

    if (!material || material.deleted_at) {
      return NextResponse.json(
        { error: "Material not found." },
        { status: 404 },
      )
    }

    if (canPersistSummary && material.ai_summary) {
      return NextResponse.json({
        summary: material.ai_summary,
        usedFileText: material.ai_summary_used_file_text ?? false,
        cached: true,
        generatedAt: material.ai_summary_generated_at ?? null,
      })
    }

    const {
      extractedContent,
      usedFileContent,
      unavailableReason,
      extractedGeneratedAt,
    } = await ensureExtractedContent({
      canPersistExtractedContent,
      classId,
      material,
    })
    const summary = await generateMaterialStudySummary({
      className: access.classRow.name,
      classCode: access.classRow.code,
      material,
      extractedContent,
      unavailableReason,
    })
    const generatedAt = new Date().toISOString()

    if (canPersistSummary) {
      const admin = createServerClient()
      const { error: summaryUpdateError } = await admin
        .from("class_materials")
        .update({
          ai_summary: summary,
          ai_summary_used_file_text: usedFileContent,
          ai_summary_generated_at: generatedAt,
        })
        .eq("id", material.id)
        .eq("class_id", classId)

      if (
        summaryUpdateError &&
        !isMissingSummaryColumnError(summaryUpdateError)
      ) {
        throw summaryUpdateError
      }
    }

    return NextResponse.json({
      summary,
      usedFileText: usedFileContent,
      cached: false,
      generatedAt: canPersistSummary ? generatedAt : extractedGeneratedAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}

async function ensureExtractedContent({
  canPersistExtractedContent,
  classId,
  material,
}: {
  canPersistExtractedContent: boolean
  classId: string
  material: MaterialRow
}) {
  if (material.ai_extracted_content) {
    const cachedContent = cachedStudyContent(material)
    return {
      extractedContent: material.ai_extracted_content,
      usedFileContent: cachedContent.usedFileContent,
      unavailableReason: cachedContent.unavailableReason,
      extractedGeneratedAt: material.ai_extracted_content_generated_at,
    }
  }

  const { extractedContent, usedFileContent } =
    await extractMaterialContentForAiAgent(material)
  const extractedGeneratedAt = new Date().toISOString()

  if (canPersistExtractedContent) {
    const admin = createServerClient()
    const { error } = await admin
      .from("class_materials")
      .update({
        ai_extracted_content: extractedContent || null,
        ai_extracted_content_used_file_content: usedFileContent,
        ai_extracted_content_generated_at: extractedContent
          ? extractedGeneratedAt
          : null,
      })
      .eq("id", material.id)
      .eq("class_id", classId)

    if (error && !isMissingExtractedContentColumnError(error)) {
      throw error
    }
  }

  return {
    extractedContent,
    usedFileContent,
    unavailableReason: extractedContent
      ? ""
      : "File content is not available for this material.",
    extractedGeneratedAt,
  }
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
