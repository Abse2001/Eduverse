import { NextResponse } from "next/server"
import { toExamErrorResponse } from "@/lib/exams/http"
import {
  createExam,
  loadClassExamApiData,
  loadManagerExamDetail,
  parseUpsertExamInput,
} from "@/lib/exams/service"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error } = await requireRouteUser(request)

  if (error || !user || !supabase) {
    return NextResponse.json({ error: error }, { status: 401 })
  }

  try {
    const requestUrl = new URL(request.url)
    const detailExamId = requestUrl.searchParams.get("detailExamId")

    if (detailExamId) {
      const payload = await loadManagerExamDetail({
        authSupabase: supabase,
        classId,
        examId: detailExamId,
        userId: user.id,
      })
      return NextResponse.json({ exam: payload })
    }

    const payload = await loadClassExamApiData({
      authSupabase: supabase,
      classId,
      userId: user.id,
    })
    return NextResponse.json(payload)
  } catch (routeError) {
    return toExamErrorResponse(routeError)
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error } = await requireRouteUser(request)

  if (error || !user || !supabase) {
    return NextResponse.json({ error: error }, { status: 401 })
  }

  try {
    const body = parseUpsertExamInput(await request.json().catch(() => null))
    const payload = await createExam({
      authSupabase: supabase,
      classId,
      userId: user.id,
      body,
    })
    return NextResponse.json({ exam: payload })
  } catch (routeError) {
    return toExamErrorResponse(routeError)
  }
}
