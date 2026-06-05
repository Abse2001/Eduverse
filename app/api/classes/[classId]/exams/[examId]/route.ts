import { NextResponse } from "next/server"
import { toExamErrorResponse } from "@/lib/exams/http"
import {
  deleteExam,
  loadManagerExamDetail,
  parseUpsertExamInput,
  updateExam,
} from "@/lib/exams/service"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; examId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { classId, examId } = await context.params
  const { user, supabase, error } = await requireRouteUser(request)

  if (error || !user || !supabase) {
    return NextResponse.json({ error: error }, { status: 401 })
  }

  try {
    const payload = await loadManagerExamDetail({
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

export async function PATCH(request: Request, context: RouteContext) {
  const { classId, examId } = await context.params
  const { user, supabase, error } = await requireRouteUser(request)

  if (error || !user || !supabase) {
    return NextResponse.json({ error: error }, { status: 401 })
  }

  try {
    const body = parseUpsertExamInput(await request.json().catch(() => null))
    const payload = await updateExam({
      authSupabase: supabase,
      classId,
      examId,
      userId: user.id,
      body,
    })
    return NextResponse.json({ exam: payload })
  } catch (routeError) {
    return toExamErrorResponse(routeError)
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { classId, examId } = await context.params
  const { user, supabase, error } = await requireRouteUser(request)

  if (error || !user || !supabase) {
    return NextResponse.json({ error: error }, { status: 401 })
  }

  try {
    const payload = await deleteExam({
      authSupabase: supabase,
      classId,
      examId,
      userId: user.id,
    })
    return NextResponse.json(payload)
  } catch (routeError) {
    return toExamErrorResponse(routeError)
  }
}
