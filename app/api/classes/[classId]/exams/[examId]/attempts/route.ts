import { NextResponse } from "next/server"
import { toExamErrorResponse } from "@/lib/exams/http"
import { parseStartAttemptInput, startExamAttempt } from "@/lib/exams/service"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; examId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { classId, examId } = await context.params

  try {
    const { user, supabase, error } = await requireRouteUser(request)

    if (error || !user || !supabase) {
      return NextResponse.json({ error: error }, { status: 401 })
    }

    const body = parseStartAttemptInput(await request.json().catch(() => null))
    const payload = await startExamAttempt({
      authSupabase: supabase,
      classId,
      examId,
      userId: user.id,
      body,
    })
    return NextResponse.json({ activeExam: payload })
  } catch (routeError) {
    return toExamErrorResponse(routeError)
  }
}
