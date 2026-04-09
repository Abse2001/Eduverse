import { NextResponse } from "next/server"
import { AccessToken } from "livekit-server-sdk"
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

  const cls = getClassById(body.classId)

  if (!cls) {
    return NextResponse.json(
      {
        error: "Class not found.",
      },
      { status: 404 },
    )
  }

  const roomName = `class-${cls.id}`
  const metadata = JSON.stringify({
    avatar: body.user.avatar ?? body.user.name.slice(0, 2).toUpperCase(),
    role: body.user.role ?? "student",
    classId: cls.id,
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
