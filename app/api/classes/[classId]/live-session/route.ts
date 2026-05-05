import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { notificationHref, sendNotification } from "@/lib/api/notifications"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

const LIVE_SESSION_STALE_MS = 5 * 60 * 1000

type RouteContext = {
  params: Promise<{ classId: string }>
}

type LiveSessionRequestBody = {
  action?: "end"
  liveSessionId?: string
  roomName?: string
}

async function readLiveSessionBody(request: Request) {
  return (await request
    .json()
    .catch(() => null)) as LiveSessionRequestBody | null
}

async function loadClassWithPermissions({
  classId,
  supabase,
}: {
  classId: string
  supabase: SupabaseClient
}) {
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id, name, teacher_user_id")
    .eq("id", classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) {
    return { error: classError.message, status: 500 as const }
  }

  if (!classData) {
    return { error: "Class not found.", status: 404 as const }
  }

  const { data: canManage, error: manageError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: classData.organization_id,
      target_class_id: classData.id,
    },
  )

  if (manageError) {
    return { error: manageError.message, status: 500 as const }
  }

  return { canManage: Boolean(canManage), classData }
}

function requireCanManage(
  result: Awaited<ReturnType<typeof loadClassWithPermissions>>,
) {
  if ("error" in result) return result

  if (!result.canManage) {
    return {
      error: "Only class managers can update live sessions.",
      status: 403 as const,
    }
  }

  return result
}

async function endLiveSession({
  canManage,
  classId,
  roomName,
  supabase,
  userId,
  liveSessionId,
}: {
  canManage: boolean
  classId: string
  roomName: string
  supabase: SupabaseClient
  userId: string
  liveSessionId?: string
}) {
  const now = new Date().toISOString()
  let query = supabase
    .from("class_live_sessions")
    .update({
      status: "ended",
      ended_at: now,
      last_seen_at: now,
    })
    .eq("class_id", classId)
    .eq("room_name", roomName)
    .in("status", ["pending", "live"])

  if (liveSessionId) {
    query = query.eq("live_session_id", liveSessionId)
  }

  if (!canManage) {
    query = query.eq("started_by_user_id", userId)
  }

  const { data, error } = await query.select("id").maybeSingle()

  if (error) {
    return { message: error.message, status: 500 as const }
  }

  if (!data) {
    return {
      message: "No matching live session is active.",
      status: 409 as const,
    }
  }

  return null
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = await readLiveSessionBody(request)
  const routeRoomName = body?.roomName || `class-${classId}`

  if (body?.action === "end") {
    const error = await endLiveSession({
      canManage: false,
      classId,
      liveSessionId: body.liveSessionId,
      roomName: routeRoomName,
      supabase,
      userId: user.id,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json({ ok: true })
  }

  const result = await loadClassWithPermissions({ classId, supabase })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const roomName = body?.roomName || `class-${result.classData.id}`
  const managedResult = requireCanManage(result)

  if ("error" in managedResult) {
    return NextResponse.json(
      {
        error: managedResult.error,
      },
      { status: managedResult.status },
    )
  }

  if (!body?.liveSessionId) {
    return NextResponse.json(
      { error: "A liveSessionId is required to mark a session live." },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const staleBefore = new Date(Date.now() - LIVE_SESSION_STALE_MS).toISOString()
  const { data: liveSession, error } = await supabase
    .from("class_live_sessions")
    .update({
      room_name: roomName,
      started_by_user_id: user.id,
      status: "live",
      last_seen_at: now,
      ended_at: null,
    })
    .eq("class_id", result.classData.id)
    .eq("room_name", roomName)
    .eq("live_session_id", body.liveSessionId)
    .in("status", ["pending", "live"])
    .is("ended_at", null)
    .gt("last_seen_at", staleBefore)
    .select("live_session_id")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!liveSession) {
    return NextResponse.json(
      { error: "No matching claimed live session is active." },
      { status: 409 },
    )
  }

  if (result.classData.teacher_user_id === user.id) {
    const cooldownBucket = Math.floor(Date.now() / (10 * 60 * 1000))

    await sendNotification({
      supabase,
      organizationId: result.classData.organization_id,
      actorUserId: user.id,
      target: { type: "class", classId: result.classData.id },
      notificationType: "session_started",
      title: "Live session started",
      body: `${result.classData.name} is live now.`,
      href: notificationHref({
        classId: result.classData.id,
        section: "session",
      }),
      metadata: {
        roomName,
      },
      eventKey: `session_started:${result.classData.id}:${cooldownBucket}`,
    }).catch(() => null)
  }

  return NextResponse.json({
    ok: true,
    liveSessionId: liveSession.live_session_id,
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { supabase, error: authError } = await requireRouteUser(request)

  if (authError || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const result = requireCanManage(
    await loadClassWithPermissions({ classId, supabase }),
  )

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const body = await readLiveSessionBody(request)
  const roomName = body?.roomName || `class-${result.classData.id}`
  let query = supabase
    .from("class_live_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("class_id", result.classData.id)
    .eq("room_name", roomName)
    .eq("status", "live")
    .is("ended_at", null)

  if (body?.liveSessionId) {
    query = query.eq("live_session_id", body.liveSessionId)
  }

  const { data, error } = await query.select("id").maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json(
      { error: "No matching live session is active." },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const result = await loadClassWithPermissions({ classId, supabase })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const body = await readLiveSessionBody(request)
  const roomName = body?.roomName || `class-${result.classData.id}`
  const error = await endLiveSession({
    canManage: result.canManage,
    classId: result.classData.id,
    liveSessionId: body?.liveSessionId,
    roomName,
    supabase,
    userId: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json({ ok: true })
}
