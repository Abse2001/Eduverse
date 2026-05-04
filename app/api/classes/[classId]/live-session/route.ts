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
}: {
  canManage: boolean
  classId: string
  roomName: string
  supabase: SupabaseClient
  userId: string
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
    .eq("status", "live")

  if (!canManage) {
    query = query.eq("started_by_user_id", userId)
  }

  const { error } = await query

  return error
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
      roomName: routeRoomName,
      supabase,
      userId: user.id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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

  const now = new Date().toISOString()
  const staleBefore = Date.now() - LIVE_SESSION_STALE_MS
  const { data: existingSession, error: existingError } = await supabase
    .from("class_live_sessions")
    .select("id, status, last_seen_at")
    .eq("class_id", result.classData.id)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const hasFreshLiveSession =
    existingSession?.status === "live" &&
    Date.parse(existingSession.last_seen_at) > staleBefore

  if (hasFreshLiveSession) {
    const { error } = await supabase
      .from("class_live_sessions")
      .update({
        room_name: roomName,
        started_by_user_id: user.id,
        last_seen_at: now,
        ended_at: null,
      })
      .eq("id", existingSession.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.from("class_live_sessions").upsert(
    {
      organization_id: result.classData.organization_id,
      class_id: result.classData.id,
      room_name: roomName,
      started_by_user_id: user.id,
      status: "live",
      started_at: now,
      last_seen_at: now,
      ended_at: null,
    },
    { onConflict: "class_id" },
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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

  return NextResponse.json({ ok: true })
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
  const { error } = await supabase
    .from("class_live_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("class_id", result.classData.id)
    .eq("room_name", roomName)
    .eq("status", "live")
    .is("ended_at", null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
    roomName,
    supabase,
    userId: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
