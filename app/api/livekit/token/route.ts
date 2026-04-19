import { NextResponse } from "next/server"
import { AccessToken } from "livekit-server-sdk"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getClassById } from "@/lib/mock-data"

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

async function findClassId(classId: string) {
  const mockClass = getClassById(classId)

  if (mockClass) return mockClass.id

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    )
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  const { data, error } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (error) throw error

  return data?.id ?? null
}

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

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

  let classId: string | null

  try {
    classId = await findClassId(body.classId)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not verify class.",
      },
      { status: 500 },
    )
  }

  if (!classId) {
    return NextResponse.json(
      {
        error: "Class not found.",
      },
      { status: 404 },
    )
  }

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

  return NextResponse.json({
    serverUrl,
    roomName,
    participantToken: await token.toJwt(),
  })
}
