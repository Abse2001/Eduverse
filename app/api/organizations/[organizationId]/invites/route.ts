import { NextResponse } from "next/server"
import { sendOrganizationInviteEmail } from "@/lib/email/gmail"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { loadEnabledOrganizationFeatureSummaries } from "@/lib/features/organization-feature-summary"

type RouteContext = {
  params: Promise<{ organizationId: string }>
}

type InviteRequestBody = {
  email?: string
  role?: "org_admin" | "teacher" | "student"
}

const ROLE_LABELS = {
  org_admin: "an admin",
  teacher: "a teacher",
  student: "a student",
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

  const body = (await request.json().catch(() => ({}))) as InviteRequestBody
  const email = body.email?.trim()
  const role = body.role

  if (!email) {
    return NextResponse.json(
      { error: "Invite email is required" },
      { status: 400 },
    )
  }

  if (!role || !(role in ROLE_LABELS)) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("invite_organization_member", {
    target_org_id: organizationId,
    invited_email: email,
    invited_role: role,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (data?.result === "membership") {
    return NextResponse.json({
      result: "membership",
      email: data.email,
      role: data.role,
      emailStatus: "not_required",
    })
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single()

  const { data: invite } = await supabase
    .from("organization_invites")
    .select("token")
    .eq("id", data?.invite_id)
    .single()
  const features = await loadEnabledOrganizationFeatureSummaries(
    supabase,
    organizationId,
  ).catch(() => [])

  const inviteUrl = invite?.token ? getInviteUrl(request, invite.token) : null

  if (!inviteUrl) {
    return NextResponse.json({
      result: "invite",
      inviteId: data?.invite_id,
      email: data?.email,
      role: data?.role,
      emailStatus: "failed",
      emailError: "Invite token was not available",
    })
  }

  const emailResult = await sendOrganizationInviteEmail({
    to: data?.email ?? email,
    organizationName: organization?.name ?? "Eduverse",
    roleLabel: ROLE_LABELS[role],
    inviteUrl,
    features,
  })

  return NextResponse.json({
    result: "invite",
    inviteId: data?.invite_id,
    email: data?.email,
    role: data?.role,
    inviteUrl,
    emailStatus: emailResult.status,
    emailError: emailResult.status === "failed" ? emailResult.error : null,
  })
}

function getInviteUrl(request: Request, token: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")

  if (configuredUrl) return `${configuredUrl}/invite/${token}`

  const requestUrl = new URL(request.url)
  return `${requestUrl.origin}/invite/${token}`
}
