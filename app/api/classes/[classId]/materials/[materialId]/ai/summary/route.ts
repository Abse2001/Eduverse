import { NextResponse } from "next/server"
import { loadAiClassAccess } from "@/lib/ai/class-context"
import { type AiChatMessage, generateAiText } from "@/lib/ai/openrouter"
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
  ai_extracted_content: string | null
  ai_extracted_content_used_file_content: boolean
  ai_extracted_content_generated_at: string | null
  deleted_at: string | null
}

const MATERIAL_SELECT =
  "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, ai_summary, ai_summary_used_file_text, ai_summary_generated_at, ai_extracted_content, ai_extracted_content_used_file_content, ai_extracted_content_generated_at, deleted_at"
const MATERIAL_SELECT_SUMMARY =
  "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, ai_summary, ai_summary_used_file_text, ai_summary_generated_at, deleted_at"
const MATERIAL_SELECT_LEGACY =
  "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, deleted_at"
const DEFAULT_OPENROUTER_VISION_MODEL = "google/gemini-2.5-flash"
const MAX_TEXT_MATERIAL_BYTES = 1024 * 1024
const MAX_PDF_TEXT_BYTES = 15 * 1024 * 1024
const MAX_VISUAL_MATERIAL_BYTES = 20 * 1024 * 1024
const MAX_EXTRACTED_TEXT_LENGTH = 24000
const MAX_EXTRACTED_CONTENT_LENGTH = 32000

type StudyMaterialContent = {
  extractedText: string
  visualPageDataUrls: string[]
  usedFileContent: boolean
  unavailableReason: string
}

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

    if (
      canUseCachedSummary({
        canPersistSummary,
        canPersistExtractedContent,
        material,
      })
    ) {
      return NextResponse.json({
        summary: material.ai_summary,
        usedFileText: material.ai_summary_used_file_text ?? false,
        cached: true,
        generatedAt: material.ai_summary_generated_at ?? null,
      })
    }

    const studyContent = material.ai_extracted_content
      ? cachedStudyContent(material)
      : await loadStudyMaterialContent(material)
    const extractedContent =
      material.ai_extracted_content ||
      (await generateMaterialExtractedContent({ material, studyContent }))
    const summary = await generateAiText({
      temperature: 0.25,
      maxTokens: 1400,
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
          content: buildStudyPromptContent({
            access,
            material,
            extractedContent,
            unavailableReason: studyContent.unavailableReason,
          }),
        },
      ],
    })
    const generatedAt = new Date().toISOString()

    if (canPersistSummary) {
      const admin = createServerClient()
      const updatePayload = {
        ai_summary: summary,
        ai_summary_used_file_text: studyContent.usedFileContent,
        ai_summary_generated_at: generatedAt,
        ...(canPersistExtractedContent
          ? {
              ai_extracted_content: extractedContent || null,
              ai_extracted_content_used_file_content:
                studyContent.usedFileContent,
              ai_extracted_content_generated_at: extractedContent
                ? generatedAt
                : null,
            }
          : {}),
      }
      const { error: summaryUpdateError } = await admin
        .from("class_materials")
        .update(updatePayload)
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
      usedFileText: studyContent.usedFileContent,
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

async function loadStudyMaterialContent(
  material: MaterialRow,
): Promise<StudyMaterialContent> {
  if (
    !isReadableMaterialMimeType(material.mime_type) &&
    !isVisualMaterialMimeType(material.mime_type)
  ) {
    return unavailableStudyContent(
      "File text or visual content is not available for this material type.",
    )
  }

  if (
    material.mime_type === "application/pdf" &&
    material.size_bytes > MAX_VISUAL_MATERIAL_BYTES
  ) {
    return unavailableStudyContent(
      "This PDF is too large to safely read in the study generator.",
    )
  }

  if (
    material.mime_type.startsWith("image/") &&
    material.size_bytes > MAX_VISUAL_MATERIAL_BYTES
  ) {
    return unavailableStudyContent(
      "This image is too large to safely read in the study generator.",
    )
  }

  if (
    material.mime_type !== "application/pdf" &&
    !material.mime_type.startsWith("image/") &&
    material.size_bytes > MAX_TEXT_MATERIAL_BYTES
  ) {
    return unavailableStudyContent(
      "This text material is too large to safely read in the study generator.",
    )
  }

  const { downloadUrl } = await createMaterialDownloadUrl({
    bucket: material.storage_bucket,
    storageKey: material.storage_key,
    fileName: material.original_filename,
    mimeType: material.mime_type,
    disposition: "inline",
  })
  const response = await fetch(downloadUrl)

  if (!response.ok) {
    return unavailableStudyContent("The material file could not be downloaded.")
  }

  if (material.mime_type === "application/pdf") {
    const pdfBytes = new Uint8Array(await response.arrayBuffer())
    const extractedText =
      material.size_bytes <= MAX_PDF_TEXT_BYTES
        ? await extractPdfText(pdfBytes)
        : ""

    if (extractedText) {
      return {
        extractedText,
        visualPageDataUrls: [],
        usedFileContent: true,
        unavailableReason: "",
      }
    }

    const visualPageDataUrls = await renderPdfPagesToImageDataUrls(pdfBytes)

    return {
      extractedText: "",
      visualPageDataUrls,
      usedFileContent: visualPageDataUrls.length > 0,
      unavailableReason:
        visualPageDataUrls.length > 0
          ? "This PDF had no extractable text, so every page was read visually from rendered page images."
          : "This PDF had no extractable text and its pages could not be rendered as images.",
    }
  }

  if (material.mime_type.startsWith("image/")) {
    const buffer = await response.arrayBuffer()
    return {
      extractedText: "",
      visualPageDataUrls: [
        bufferToDataUrl({
          arrayBuffer: buffer,
          mimeType: material.mime_type,
        }),
      ],
      usedFileContent: true,
      unavailableReason: "This material is an image, so it was read visually.",
    }
  }

  const extractedText = (await response.text())
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_LENGTH)

  return {
    extractedText,
    visualPageDataUrls: [],
    usedFileContent: Boolean(extractedText),
    unavailableReason: extractedText
      ? ""
      : "This file did not contain readable text.",
  }
}

async function extractPdfText(pdfBytes: Uint8Array) {
  installPdfJsNodeGlobals()
  const [pdfjs, pdfWorker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ])
  installPdfJsWorker(pdfWorker)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
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

      if (pageTexts.join("\n\n").length >= MAX_EXTRACTED_TEXT_LENGTH) break
    }

    await document.destroy()
    return pageTexts.join("\n\n").trim().slice(0, MAX_EXTRACTED_TEXT_LENGTH)
  } finally {
    await loadingTask.destroy()
  }
}

async function renderPdfPagesToImageDataUrls(pdfBytes: Uint8Array) {
  const canvasModule = await import("@napi-rs/canvas")
  installPdfJsCanvasGlobals(canvasModule)
  const [pdfjs, pdfWorker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ])
  installPdfJsWorker(pdfWorker)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
  })

  try {
    const document = await loadingTask.promise
    const pageDataUrls: string[] = []

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const maxDimension = Math.max(baseViewport.width, baseViewport.height)
      const scale = Math.min(1.75, 1600 / maxDimension)
      const viewport = page.getViewport({ scale })
      const canvas = canvasModule.createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      )
      const canvasContext = canvas.getContext("2d")

      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise

      pageDataUrls.push(canvas.toDataURL("image/png"))
      page.cleanup()
    }

    await document.destroy()
    return pageDataUrls
  } finally {
    await loadingTask.destroy()
  }
}

async function generateMaterialExtractedContent({
  material,
  studyContent,
}: {
  material: MaterialRow
  studyContent: StudyMaterialContent
}) {
  if (studyContent.extractedText) {
    return studyContent.extractedText.slice(0, MAX_EXTRACTED_CONTENT_LENGTH)
  }

  if (studyContent.visualPageDataUrls.length === 0) {
    return ""
  }

  return generateAiText({
    model:
      process.env.OPENROUTER_VISION_MODEL ?? DEFAULT_OPENROUTER_VISION_MODEL,
    temperature: 0.1,
    maxTokens: 3500,
    messages: [
      {
        role: "system",
        content: [
          "You extract class material content for later AI retrieval.",
          "Return detailed markdown, not a study summary.",
          "Read every attached page image in order.",
          "Include visible text, tables, labels, diagrams, formulas, page numbers, and important visual details.",
          "If a detail is inferred from an image, say it is inferred.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Material title: ${material.title}`,
              `Description: ${material.description || "No description"}`,
              `File: ${material.original_filename}`,
              `MIME type: ${material.mime_type}`,
              "",
              studyContent.unavailableReason,
              "Extract the full useful content page by page so another class AI agent can answer questions about this material later without seeing the file again.",
            ].join("\n"),
          },
          ...studyContent.visualPageDataUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ],
      },
    ],
  }).then((content) => content.slice(0, MAX_EXTRACTED_CONTENT_LENGTH))
}

function buildStudyPromptContent({
  access,
  material,
  extractedContent,
  unavailableReason,
}: {
  access: Exclude<
    Awaited<ReturnType<typeof loadAiClassAccess>>,
    { error: string }
  >
  material: MaterialRow
  extractedContent: string
  unavailableReason: string
}): AiChatMessage["content"] {
  return [
    `Class: ${access.classRow.name} (${access.classRow.code})`,
    `Material title: ${material.title}`,
    `Description: ${material.description || "No description"}`,
    `File: ${material.original_filename}`,
    `MIME type: ${material.mime_type}`,
    `Size: ${material.size_bytes} bytes`,
    "",
    "Extracted material content:",
    extractedContent || unavailableReason,
  ].join("\n")
}

function unavailableStudyContent(reason: string): StudyMaterialContent {
  return {
    extractedText: "",
    visualPageDataUrls: [],
    usedFileContent: false,
    unavailableReason: reason,
  }
}

function cachedStudyContent(material: MaterialRow): StudyMaterialContent {
  return {
    extractedText: material.ai_extracted_content ?? "",
    visualPageDataUrls: [],
    usedFileContent: material.ai_extracted_content_used_file_content ?? true,
    unavailableReason: "",
  }
}

function bufferToDataUrl({
  arrayBuffer,
  mimeType,
}: {
  arrayBuffer: ArrayBuffer
  mimeType: string
}) {
  const base64 = Buffer.from(arrayBuffer).toString("base64")
  return `data:${mimeType};base64,${base64}`
}

function installPdfJsNodeGlobals() {
  const globalScope = globalThis as Record<string, unknown>

  globalScope.DOMMatrix ??= MinimalDOMMatrix
}

function installPdfJsCanvasGlobals(
  canvasModule: typeof import("@napi-rs/canvas"),
) {
  const globalScope = globalThis as Record<string, unknown>

  globalScope.DOMMatrix = canvasModule.DOMMatrix
  globalScope.DOMPoint = canvasModule.DOMPoint
  globalScope.DOMRect = canvasModule.DOMRect
  globalScope.Image = canvasModule.Image
  globalScope.ImageData = canvasModule.ImageData
  globalScope.Path2D = canvasModule.Path2D
}

function installPdfJsWorker(workerModule: { WorkerMessageHandler: unknown }) {
  const globalScope = globalThis as Record<string, unknown>

  globalScope.pdfjsWorker ??= {
    WorkerMessageHandler: workerModule.WorkerMessageHandler,
  }
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

function isVisualMaterialMimeType(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/")
}

function canUseCachedSummary({
  canPersistSummary,
  canPersistExtractedContent,
  material,
}: {
  canPersistSummary: boolean
  canPersistExtractedContent: boolean
  material: MaterialRow
}) {
  if (!canPersistSummary || !material.ai_summary) {
    return false
  }

  if (
    canPersistExtractedContent &&
    (isReadableMaterialMimeType(material.mime_type) ||
      isVisualMaterialMimeType(material.mime_type)) &&
    !material.ai_extracted_content
  ) {
    return false
  }

  if (!isVisualMaterialMimeType(material.mime_type)) {
    return true
  }

  return material.ai_summary_used_file_text
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
