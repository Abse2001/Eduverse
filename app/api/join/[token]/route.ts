import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { createServerClient } from "@/lib/supabase/server"

type RouteContext = {
  params: Promise<{ token: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params

  try {
    const supabase = createServerClient()
    const { data: joinLink, error } = await supabase
      .from("organization_join_links")
      .select(
        "id, organization_id, purpose, default_role, enabled, approval_required, max_uses, use_count, expires_at, organizations(name, slug)",
      )
      .eq("token", token)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!joinLink || !joinLink.enabled) {
      return NextResponse.json(
        { error: "Join link not found or disabled" },
        { status: 404 },
      )
    }

    if (
      joinLink.expires_at &&
      new Date(joinLink.expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "Join link has expired" },
        { status: 410 },
      )
    }

    if (joinLink.max_uses !== null && joinLink.use_count >= joinLink.max_uses) {
      return NextResponse.json(
        { error: "Join link has reached its usage limit" },
        { status: 410 },
      )
    }

    const organization = Array.isArray(joinLink.organizations)
      ? joinLink.organizations[0]
      : joinLink.organizations

    return NextResponse.json({
      organizationId: joinLink.organization_id,
      organizationName: organization?.name ?? "Eduverse",
      organizationSlug: organization?.slug ?? null,
      purpose: joinLink.purpose,
      role: joinLink.default_role,
      approvalRequired: joinLink.approval_required,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load join link",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const { data, error } = await supabase.rpc("accept_organization_join_link", {
    join_token: token,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
