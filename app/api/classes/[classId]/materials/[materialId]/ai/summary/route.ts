import { NextResponse } from "next/server"
import { loadAiClassAccess } from "@/lib/ai/class-context"
import { generateAiText } from "@/lib/ai/openrouter"
import { createMaterialDownloadUrl } from "@/lib/api/s3-materials"
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
  ai_summary_used_file_text: boolean
  ai_summary_generated_at: string | null
  deleted_at: string | null
}

const MATERIAL_SELECT =
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

    const extractedText = await loadTextMaterialContent(material)
    const summary = await generateAiText({
      temperature: 0.25,
      maxTokens: 1000,
      messages: [
        {
          role: "system",
          content: [
            "You are an education assistant creating study support for a class material.",
            "Return concise markdown with these sections: Summary, Key Terms, Study Checklist, Flashcards, Quick Quiz.",
            "Make flashcards and quiz questions useful for revision.",
            "If the file content is unavailable, base the output only on metadata and clearly say that the file body was not available.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Class: ${access.classRow.name} (${access.classRow.code})`,
            `Material title: ${material.title}`,
            `Description: ${material.description || "No description"}`,
            `File: ${material.original_filename}`,
            `MIME type: ${material.mime_type}`,
            `Size: ${material.size_bytes} bytes`,
            "",
            "Extracted file text:",
            extractedText ||
              "File text is not available for this material type.",
          ].join("\n"),
        },
      ],
    })
    const generatedAt = new Date().toISOString()

    if (canPersistSummary) {
      const admin = createServerClient()
      const { error: summaryUpdateError } = await admin
        .from("class_materials")
        .update({
          ai_summary: summary,
          ai_summary_used_file_text: Boolean(extractedText),
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
      usedFileText: Boolean(extractedText),
      cached: false,
      generatedAt: canPersistSummary ? generatedAt : null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}

async function loadTextMaterialContent(material: MaterialRow) {
  if (!isReadableMaterialMimeType(material.mime_type)) {
    return ""
  }

  if (
    material.mime_type === "application/pdf" &&
    material.size_bytes > 15 * 1024 * 1024
  ) {
    return ""
  }

  if (
    material.mime_type !== "application/pdf" &&
    material.size_bytes > 1024 * 1024
  ) {
    return ""
  }

  const { downloadUrl } = await createMaterialDownloadUrl({
    bucket: material.storage_bucket,
    storageKey: material.storage_key,
    fileName: material.original_filename,
    mimeType: material.mime_type,
    disposition: "inline",
  })
  const response = await fetch(downloadUrl)

  if (!response.ok) return ""

  if (material.mime_type === "application/pdf") {
    const buffer = await response.arrayBuffer()
    return extractPdfText(buffer)
  }

  return (await response.text()).slice(0, 24000)
}

async function extractPdfText(arrayBuffer: ArrayBuffer) {
  installPdfJsNodeGlobals()
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const [{ join }, { pathToFileURL }] = await Promise.all([
    import("node:path"),
    import("node:url"),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    ),
  ).href
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
  })

  try {
    const document = await loadingTask.promise
    const pageTexts: string[] = []

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()

      if (text) pageTexts.push(text)
      page.cleanup()

      if (pageTexts.join("\n\n").length >= 24000) break
    }

    await document.destroy()
    return pageTexts.join("\n\n").trim().slice(0, 24000)
  } finally {
    await loadingTask.destroy()
  }
}

function installPdfJsNodeGlobals() {
  const globalScope = globalThis as Record<string, unknown>

  globalScope.DOMMatrix ??= MinimalDOMMatrix
}

class MinimalDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    this.a *= scaleX
    this.d *= scaleY
    return this
  }

  translateSelf(translateX = 0, translateY = 0) {
    this.e += translateX
    this.f += translateY
    return this
  }
}

function isReadableMaterialMimeType(mimeType: string) {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    [
      "application/json",
      "application/javascript",
      "application/xml",
      "application/x-yaml",
    ].includes(mimeType)
  )
}

function isMissingSummaryColumnError(error: { message?: string } | null) {
  return (
    Boolean(error?.message?.includes("ai_summary")) ||
    Boolean(error?.message?.includes("schema cache"))
  )
}
