import { NextResponse } from "next/server"
import { loadAiClassAccess } from "@/lib/ai/class-context"
import { generateAiText } from "@/lib/ai/openrouter"
import { createMaterialDownloadUrl } from "@/lib/api/s3-materials"
import { requireRouteUser } from "@/lib/api/supabase-route"

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
  deleted_at: string | null
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

    const { data, error } = await supabase
      .from("class_materials")
      .select(
        "id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, deleted_at",
      )
      .eq("id", materialId)
      .eq("class_id", classId)
      .maybeSingle()

    if (error) throw error
    const material = data as MaterialRow | null

    if (!material || material.deleted_at) {
      return NextResponse.json(
        { error: "Material not found." },
        { status: 404 },
      )
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
            `Class: ${access.classRow.name} (${access.classRow.subject})`,
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

    return NextResponse.json({
      summary,
      usedFileText: Boolean(extractedText),
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
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) })

  try {
    const result = await parser.getText()
    return result.text.replace(/\s+\n/g, "\n").trim().slice(0, 24000)
  } finally {
    await parser.destroy()
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
