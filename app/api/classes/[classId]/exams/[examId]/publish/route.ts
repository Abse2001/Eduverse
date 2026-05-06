import { NextResponse } from "next/server"
import { toExamErrorResponse } from "@/lib/exams/http"
import { publishExam } from "@/lib/exams/service"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; examId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { classId, examId } = await context.params
  const { user, supabase, error } = await requireRouteUser(request)

  if (error || !user || !supabase) {
    return NextResponse.json({ error: error }, { status: 401 })
  }

  try {
    const payload = await publishExam({
      authSupabase: supabase,
      classId,
      examId,
      userId: user.id,
    })
    return NextResponse.json({ exam: payload })
  } catch (routeError) {
    return toExamErrorResponse(routeError)
  }
}
