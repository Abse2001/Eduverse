import { NextResponse } from "next/server"
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
  content: string
  kind: "text" | "announcement" | "media"
  material_id: string | null
  media_title: string | null
  original_filename: string | null
  mime_type: string | null
  size_bytes: number | null
  material_type: "image" | "pdf" | "video" | "slide" | null
  show_in_announcement_carousel: boolean
  created_at: string
}

type ProfileRow = {
  id: string
  display_name: string
  email: string
}

type MaterialStateRow = {
  id: string
  deleted_at: string | null
}

export async function GET(_request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(_request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("class_messages")
    .select(
      "id, organization_id, class_id, sender_user_id, content, kind, material_id, media_title, original_filename, mime_type, size_bytes, material_type, show_in_announcement_carousel, created_at",
    )
    .eq("class_id", classId)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as MessageRow[]
  const senderIds = [...new Set(rows.map((row) => row.sender_user_id))]
  const materialIds = [
    ...new Set(
      rows.flatMap((row) => (row.material_id ? [row.material_id] : [])),
    ),
  ]

  const [profilesResult, materialsResult] = await Promise.all([
    senderIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", senderIds)
      : Promise.resolve({ data: [], error: null }),
    materialIds.length
      ? supabase
          .from("class_materials")
          .select("id, deleted_at")
          .in("id", materialIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (profilesResult.error) {
    return NextResponse.json(
      { error: profilesResult.error.message },
      { status: 500 },
    )
  }

  if (materialsResult.error) {
    return NextResponse.json(
      { error: materialsResult.error.message },
      { status: 500 },
    )
  }

  const profiles = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  )
  const materialStates = new Map(
    ((materialsResult.data ?? []) as MaterialStateRow[]).map((material) => [
      material.id,
      material,
    ]),
  )

  return NextResponse.json({
    messages: rows.map((row) =>
      toMessageResponse(row, profiles.get(row.sender_user_id), materialStates),
    ),
  })
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const payload = (await request.json().catch(() => null)) as {
    content?: unknown
    kind?: unknown
  } | null
  const content =
    typeof payload?.content === "string" ? payload.content.trim() : ""
  const requestedKind =
    payload?.kind === "announcement" ? "announcement" : "text"

  if (!content) {
    return NextResponse.json(
      { error: "Message text is required." },
      { status: 400 },
    )
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

  const { data: canManage, error: manageError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: classRow.organization_id,
      target_class_id: classRow.id,
    },
  )

  if (manageError) {
    return NextResponse.json({ error: manageError.message }, { status: 500 })
  }

  if (requestedKind === "announcement" && !canManage) {
    return NextResponse.json(
      { error: "Only teachers can post announcements." },
      { status: 403 },
    )
  }

  const { data: messageData, error: messageError } = await supabase
    .from("class_messages")
    .insert({
      organization_id: classRow.organization_id,
      class_id: classRow.id,
      sender_user_id: user.id,
      content,
      kind: requestedKind,
    })
    .select(
      "id, organization_id, class_id, sender_user_id, content, kind, material_id, media_title, original_filename, mime_type, size_bytes, material_type, show_in_announcement_carousel, created_at",
    )
    .single()

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 })
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("id", user.id)
    .maybeSingle()

  return NextResponse.json({
    message: toMessageResponse(
      messageData as MessageRow,
      profileData as ProfileRow | null,
      new Map(),
    ),
  })
}

function toMessageResponse(
  row: MessageRow,
  profile: ProfileRow | null | undefined,
  materialStates: Map<string, MaterialStateRow>,
) {
  const senderName =
    profile?.display_name || profile?.email?.split("@")[0] || "Unknown"

  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    senderId: row.sender_user_id,
    senderName,
    senderAvatar: initials(senderName),
    content: row.content,
    kind: row.kind,
    materialId: row.material_id,
    mediaTitle: row.media_title,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    materialType: row.material_type,
    showInAnnouncementCarousel: row.show_in_announcement_carousel,
    isMaterialDeleted: row.material_id
      ? (materialStates.get(row.material_id)?.deleted_at ?? null) !== null ||
        !materialStates.has(row.material_id)
      : false,
    createdAt: row.created_at,
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("")
}
