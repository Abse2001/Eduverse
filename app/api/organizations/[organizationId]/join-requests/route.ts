import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

type RouteContext = {
  params: Promise<{ organizationId: string }>
}

type ReviewJoinRequestBody = {
  requestId?: string
  action?: "approve" | "reject"
}

export async function POST(request: Request, context: RouteContext) {
  await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as ReviewJoinRequestBody

  if (!body.requestId) {
    return NextResponse.json(
      { error: "Join request is required" },
      { status: 400 },
    )
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "Action is required" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc(
    "review_organization_join_request",
    {
      target_request_id: body.requestId,
      approved: body.action === "approve",
    },
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
