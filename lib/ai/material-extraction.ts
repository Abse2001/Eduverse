import { generateAiText } from "@/lib/ai/openrouter"
import { createMaterialDownloadUrl } from "@/lib/api/s3-materials"

const DEFAULT_OPENROUTER_VISION_MODEL = "google/gemini-2.5-flash"
const MAX_TEXT_MATERIAL_BYTES = 1024 * 1024
const MAX_PDF_TEXT_BYTES = 15 * 1024 * 1024
const MAX_VISUAL_MATERIAL_BYTES = 20 * 1024 * 1024
const MAX_EXTRACTED_TEXT_LENGTH = 24000
const MAX_EXTRACTED_CONTENT_LENGTH = 32000

export type AiMaterialForExtraction = {
  title: string
  description: string
  storage_bucket: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
}

export type MaterialStudySummaryInput = {
  className: string
  classCode: string
  material: AiMaterialForExtraction
  extractedContent: string
  unavailableReason: string
}

export type StudyMaterialContent = {
  extractedText: string
  visualPageDataUrls: string[]
  usedFileContent: boolean
  unavailableReason: string
}

export async function extractMaterialContentForAiAgent(
  material: AiMaterialForExtraction,
) {
  const studyContent = await loadStudyMaterialContent(material)
  const extractedContent = await generateMaterialExtractedContent({
    material,
    studyContent,
  })

  return {
    extractedContent,
    usedFileContent: studyContent.usedFileContent,
  }
}

export async function loadStudyMaterialContent(
  material: AiMaterialForExtraction,
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

export async function generateMaterialExtractedContent({
  material,
  studyContent,
}: {
  material: AiMaterialForExtraction
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

export async function generateMaterialStudySummary({
  className,
  classCode,
  material,
  extractedContent,
  unavailableReason,
}: MaterialStudySummaryInput) {
  return generateAiText({
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
        content: [
          `Class: ${className} (${classCode})`,
          `Material title: ${material.title}`,
          `Description: ${material.description || "No description"}`,
          `File: ${material.original_filename}`,
          `MIME type: ${material.mime_type}`,
          `Size: ${material.size_bytes} bytes`,
          "",
          "Extracted material content:",
          extractedContent || unavailableReason,
        ].join("\n"),
      },
    ],
  })
}

export function cachedStudyContent(input: {
  ai_extracted_content: string | null
  ai_extracted_content_used_file_content: boolean | null
}): StudyMaterialContent {
  return {
    extractedText: input.ai_extracted_content ?? "",
    visualPageDataUrls: [],
    usedFileContent: input.ai_extracted_content_used_file_content ?? true,
    unavailableReason: "",
  }
}

export function isReadableMaterialMimeType(mimeType: string) {
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

export function isVisualMaterialMimeType(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/")
}

function unavailableStudyContent(reason: string): StudyMaterialContent {
  return {
    extractedText: "",
    visualPageDataUrls: [],
    usedFileContent: false,
    unavailableReason: reason,
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
