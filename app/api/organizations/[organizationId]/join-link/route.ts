import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

type RouteContext = {
  params: Promise<{ organizationId: string }>
}

type JoinLinkRequestBody = {
  linkId?: string | null
  purpose?: string
  defaultRole?: "teacher" | "student"
  approvalRequired?: boolean
  enabled?: boolean
  regenerate?: boolean
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as JoinLinkRequestBody
  const purpose = body.purpose?.trim() || "General access"
  const defaultRole = body.defaultRole ?? "student"

  if (defaultRole !== "teacher" && defaultRole !== "student") {
    return NextResponse.json(
      { error: "Public join links can only grant teacher or student roles" },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.rpc("upsert_organization_join_link", {
    target_org_id: organizationId,
    target_link_id: body.linkId ?? null,
    target_purpose: purpose,
    target_default_role: defaultRole,
    target_approval_required: body.approvalRequired ?? true,
    target_enabled: body.enabled ?? false,
    regenerate_token: body.regenerate ?? false,
  })

  if (error) {
    const isDuplicateOptions = error.message.includes(
      "idx_organization_join_links_unique_options",
    )

    return NextResponse.json(
      {
        error: isDuplicateOptions
          ? "A public link with the same role and approval mode already exists."
          : error.message,
      },
      { status: 400 },
    )
  }

  return NextResponse.json({ joinLink: data })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { organizationId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as {
    linkId?: string | null
  }

  if (!body.linkId) {
    return NextResponse.json(
      { error: "Public join link is required" },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.rpc("delete_organization_join_link", {
    target_org_id: organizationId,
    target_link_id: body.linkId,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
