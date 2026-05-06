import { NextResponse } from "next/server"
import { toExamErrorResponse } from "@/lib/exams/http"
import {
  parseIntegrityEventInput,
  recordExamIntegrityEvent,
} from "@/lib/exams/service"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; examId: string; attemptId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { classId, examId, attemptId } = await context.params

  try {
    const { user, supabase, error } = await requireRouteUser(request)

    if (error || !user || !supabase) {
      return NextResponse.json({ error: error }, { status: 401 })
    }

    const body = parseIntegrityEventInput(
      await request.json().catch(() => null),
    )
    const payload = await recordExamIntegrityEvent({
      authSupabase: supabase,
      classId,
      examId,
      attemptId,
      userId: user.id,
      body,
    })
    return NextResponse.json(payload)
  } catch (routeError) {
    return toExamErrorResponse(routeError)
  }
}
