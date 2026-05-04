import { NextResponse } from "next/server"
import { AccessToken } from "livekit-server-sdk"
import { notificationHref, sendNotification } from "@/lib/api/notifications"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

interface TokenRequestBody {
  classId?: string
  user?: {
    id?: string
    name?: string
    avatar?: string
    role?: string
  }
}

export async function POST(request: Request) {
  const { user, supabase, error: authError } = await requireRouteUser(request)
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  if (!apiKey || !apiSecret || !serverUrl) {
    return NextResponse.json(
      {
        error:
          "Live session env vars are missing. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL.",
      },
      { status: 500 },
    )
  }

  const body = (await request
    .json()
    .catch(() => null)) as TokenRequestBody | null

  if (!body?.classId || !body.user?.id || !body.user?.name) {
    return NextResponse.json(
      {
        error:
          "A classId and user identity are required to join a live session.",
      },
      { status: 400 },
    )
  }

  if (body.user.id !== user.id) {
    return NextResponse.json(
      {
        error: "Live session user must match the authenticated user.",
      },
      { status: 403 },
    )
  }

  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id, name, teacher_user_id")
    .eq("id", body.classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) {
    return NextResponse.json(
      {
        error: classError.message,
      },
      { status: 500 },
    )
  }

  if (!classData) {
    return NextResponse.json(
      {
        error: "Class not found.",
      },
      { status: 404 },
    )
  }

  const [{ data: canManage, error: manageError }, { data: isMember }] =
    await Promise.all([
      supabase.rpc("can_manage_class", {
        target_org_id: classData.organization_id,
        target_class_id: classData.id,
      }),
      supabase.rpc("is_class_member", {
        target_org_id: classData.organization_id,
        target_class_id: classData.id,
      }),
    ])

  if (manageError) {
    return NextResponse.json({ error: manageError.message }, { status: 500 })
  }

  if (!canManage && !isMember) {
    return NextResponse.json(
      {
        error: "Class membership required to join this live session.",
      },
      { status: 403 },
    )
  }

  const classId = classData.id
  const roomName = `class-${classId}`
  const metadata = JSON.stringify({
    avatar: body.user.avatar ?? body.user.name.slice(0, 2).toUpperCase(),
    role: body.user.role ?? "student",
    classId,
  })

  const token = new AccessToken(apiKey, apiSecret, {
    identity: body.user.id,
    name: body.user.name,
    metadata,
  })

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  if (classData.teacher_user_id === user.id) {
    const cooldownBucket = Math.floor(Date.now() / (10 * 60 * 1000))

    await sendNotification({
      supabase,
      organizationId: classData.organization_id,
      actorUserId: user.id,
      target: { type: "class", classId },
      notificationType: "session_started",
      title: "Live session started",
      body: `${classData.name} is live now.`,
      href: notificationHref({ classId, section: "session" }),
      metadata: {
        roomName,
      },
      eventKey: `session_started:${classId}:${cooldownBucket}`,
    }).catch(() => null)
  }

  return NextResponse.json({
    serverUrl,
    roomName,
    participantToken: await token.toJwt(),
  })
}
