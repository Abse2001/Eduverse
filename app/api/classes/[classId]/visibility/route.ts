import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type VisibilityRequestBody = {
  hidden?: boolean
}

export async function PATCH(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as VisibilityRequestBody

  if (typeof body.hidden !== "boolean") {
    return NextResponse.json(
      { error: "Hidden state is required" },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.rpc("set_class_hidden", {
    target_class_id: classId,
    hidden_from_user: body.hidden,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
