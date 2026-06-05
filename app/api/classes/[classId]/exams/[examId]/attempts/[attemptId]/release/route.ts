import { NextResponse } from "next/server"
import { toExamErrorResponse } from "@/lib/exams/http"
import { releaseExamAttempt } from "@/lib/exams/service"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; examId: string; attemptId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { classId, examId, attemptId } = await context.params
  const { user, supabase, error } = await requireRouteUser(request)

  if (error || !user || !supabase) {
    return NextResponse.json({ error: error }, { status: 401 })
  }

  try {
    const payload = await releaseExamAttempt({
      authSupabase: supabase,
      classId,
      examId,
      attemptId,
      userId: user.id,
    })
    return NextResponse.json({ exam: payload })
  } catch (routeError) {
    return toExamErrorResponse(routeError)
  }
}
