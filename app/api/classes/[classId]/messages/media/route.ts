import { NextResponse } from "next/server"
import {
  deleteMaterialObject,
  uploadMaterialObject,
  validateMaterialUpload,
} from "@/lib/api/s3-materials"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type MessageRow = {
  id: string
  organization_id: string
  class_id: string
  sender_user_id: string
  sender_role: "student" | "teacher" | "admin"
  content: string
  kind: "media"
  material_id: string | null
  media_title: string | null
  original_filename: string | null
  mime_type: string | null
  size_bytes: number | null
  material_type: "image" | "pdf" | "video" | "slide" | null
  show_in_announcement_carousel: boolean
  created_at: string
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get("file")
  const content = formData?.get("content")
  const senderRole = parseSenderRole(formData?.get("senderRole"))

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 })
  }

  const validated = validateMaterialUpload({
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  })

  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id")
    .eq("id", classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 })
  }

  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 })
  }

  const title = titleFromFileName(validated.fileName)
  let uploadedObject: { bucket: string; storageKey: string } | null = null

  try {
    uploadedObject = await uploadMaterialObject({
      organizationId: classRow.organization_id,
      classId: classRow.id,
      fileName: validated.fileName,
      mimeType: validated.mimeType,
      body: new Uint8Array(await file.arrayBuffer()),
    })

    const { data: materialData, error: materialError } = await supabase
      .from("class_materials")
      .insert({
        organization_id: classRow.organization_id,
        class_id: classRow.id,
        uploaded_by_user_id: user.id,
        title,
        description: "Shared in chat",
        type: validated.type,
        source: "chat",
        storage_bucket: uploadedObject.bucket,
        storage_key: uploadedObject.storageKey,
        original_filename: validated.fileName,
        mime_type: validated.mimeType,
        size_bytes: validated.sizeBytes,
      })
      .select("id")
      .single()

    if (materialError) throw materialError

    const { data: messageData, error: messageError } = await supabase
      .from("class_messages")
      .insert({
        organization_id: classRow.organization_id,
        class_id: classRow.id,
        sender_user_id: user.id,
        sender_role: senderRole,
        content:
          typeof content === "string" && content.trim()
            ? content.trim()
            : defaultMediaContent(validated.type),
        kind: "media",
        material_id: materialData.id,
        media_title: title,
        original_filename: validated.fileName,
        mime_type: validated.mimeType,
        size_bytes: validated.sizeBytes,
        material_type: validated.type,
      })
      .select(
        "id, organization_id, class_id, sender_user_id, sender_role, content, kind, material_id, media_title, original_filename, mime_type, size_bytes, material_type, show_in_announcement_carousel, created_at",
      )
      .single()

    if (messageError) throw messageError

    await supabase
      .from("class_materials")
      .update({ chat_message_id: messageData.id })
      .eq("id", materialData.id)

    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle()

    const senderName =
      profileData?.display_name ||
      profileData?.email?.split("@")[0] ||
      "Unknown"

    return NextResponse.json({
      message: {
        id: (messageData as MessageRow).id,
        organizationId: (messageData as MessageRow).organization_id,
        classId: (messageData as MessageRow).class_id,
        senderId: (messageData as MessageRow).sender_user_id,
        senderRole: (messageData as MessageRow).sender_role,
        senderName,
        senderAvatar: initials(senderName),
        content: (messageData as MessageRow).content,
        kind: (messageData as MessageRow).kind,
        materialId: (messageData as MessageRow).material_id,
        mediaTitle: (messageData as MessageRow).media_title,
        originalFilename: (messageData as MessageRow).original_filename,
        mimeType: (messageData as MessageRow).mime_type,
        sizeBytes: (messageData as MessageRow).size_bytes,
        materialType: (messageData as MessageRow).material_type,
        showInAnnouncementCarousel: (messageData as MessageRow)
          .show_in_announcement_carousel,
        isMaterialDeleted: false,
        createdAt: (messageData as MessageRow).created_at,
      },
    })
  } catch (error) {
    if (uploadedObject) {
      await deleteMaterialObject(uploadedObject).catch(() => null)
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not share media.",
      },
      { status: 500 },
    )
  }
}

function parseSenderRole(value: unknown): "student" | "teacher" | "admin" {
  return value === "teacher" || value === "admin" ? value : "student"
}

function titleFromFileName(fileName: string) {
  return (
    fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Chat media"
  )
}

function defaultMediaContent(type: "image" | "pdf" | "video" | "slide") {
  if (type === "image") return "Shared an image"
  if (type === "pdf") return "Shared a PDF"
  if (type === "video") return "Shared a video"
  return "Shared slides"
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("")
}
