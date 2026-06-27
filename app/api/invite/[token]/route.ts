import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { loadEnabledOrganizationFeatureSummaries } from "@/lib/features/organization-feature-summary"
import { createServerClient as createPrivilegedSupabaseClient } from "@/lib/supabase/server"

type RouteContext = {
  params: Promise<{ token: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params
  const { user, error: authError } = await requireRouteUser(request)

  if (authError || !user) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const supabase = createPrivilegedSupabaseClient()
  const { data: invite, error } = await supabase
    .from("organization_invites")
    .select(
      "organization_id, email, role, status, expires_at, organizations(name, slug)",
    )
    .eq("token", token)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!invite || invite.status !== "invited") {
    return NextResponse.json(
      { error: "Invite not found or unavailable" },
      { status: 404 },
    )
  }

  if (normalizeEmail(invite.email) !== normalizeEmail(user.email)) {
    return NextResponse.json(
      { error: "Invite not found or unavailable" },
      { status: 404 },
    )
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "Invite not found or unavailable" },
      { status: 404 },
    )
  }

  const organization = Array.isArray(invite.organizations)
    ? invite.organizations[0]
    : invite.organizations
  const { features, error: featuresError } = await loadInviteFeatures(
    supabase,
    invite.organization_id,
  )

  if (featuresError) {
    return NextResponse.json({ error: featuresError }, { status: 500 })
  }

  return NextResponse.json({
    organizationId: invite.organization_id,
    organizationName: organization?.name ?? "Eduverse",
    organizationSlug: organization?.slug ?? null,
    role: invite.role,
    features,
  })
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? ""
}

async function loadInviteFeatures(
  supabase: ReturnType<typeof createPrivilegedSupabaseClient>,
  organizationId: string,
) {
  try {
    return {
      features: await loadEnabledOrganizationFeatureSummaries(
        supabase,
        organizationId,
      ),
      error: null,
    }
  } catch (error) {
    return {
      features: [],
      error:
        error instanceof Error
          ? error.message
          : "Could not load invite features",
    }
  }
}
