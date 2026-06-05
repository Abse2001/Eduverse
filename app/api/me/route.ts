import { NextResponse } from "next/server"
import { loadCurrentUserPayload } from "@/lib/api/app-context"
import { requireRouteUser } from "@/lib/api/supabase-route"
import type { OrganizationUserRole } from "@/lib/supabase/app-user"

export async function GET(request: Request) {
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const payload = await loadCurrentUserPayload(supabase, user)
  return NextResponse.json(payload)
}

export async function PATCH(request: Request) {
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as {
    defaultOrganizationId?: string
    activeOrganizationRole?: OrganizationUserRole
    organizationId?: string
  }

  if (body.defaultOrganizationId) {
    const { error } = await supabase
      .from("profiles")
      .update({ default_organization_id: body.defaultOrganizationId })
      .eq("id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  if (body.activeOrganizationRole) {
    if (!body.organizationId) {
      return NextResponse.json(
        {
          error:
            "organizationId is required when setting activeOrganizationRole",
        },
        { status: 400 },
      )
    }

    const { error } = await supabase.rpc("set_selected_organization_role", {
      target_org_id: body.organizationId,
      target_role: body.activeOrganizationRole,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  const payload = await loadCurrentUserPayload(supabase, user)
  return NextResponse.json(payload)
}
