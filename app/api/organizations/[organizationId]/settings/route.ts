import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { loadOrganizationSettings } from "@/lib/supabase/organization-settings"

type RouteContext = {
  params: Promise<{ organizationId: string }>
}

type SettingsRequestBody = {
  publicFeaturesEnabled?: boolean
  allTeachersCanCreateClasses?: boolean
  allTeachersCanManageOwnClasses?: boolean
  teacherClassPermissions?: Array<{
    teacherUserId?: string
    canCreateClasses?: boolean
    canManageOwnClasses?: boolean
  }>
}

export async function GET(request: Request, context: RouteContext) {
  const { organizationId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const { data: isMember, error: membershipError } = await supabase.rpc(
    "is_org_member",
    { target_org_id: organizationId },
  )

  if (membershipError) {
    return NextResponse.json(
      { error: membershipError.message },
      { status: 400 },
    )
  }

  if (!isMember) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    )
  }

  const settingsByOrganization = await loadOrganizationSettings(
    [organizationId],
    supabase,
  )
  const settings = settingsByOrganization.get(organizationId)

  return NextResponse.json({ settings })
}

export async function PATCH(request: Request, context: RouteContext) {
  const { organizationId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as SettingsRequestBody
  const publicFeaturesEnabled = body.publicFeaturesEnabled ?? false
  const allTeachersCanCreateClasses = body.allTeachersCanCreateClasses ?? false
  const allTeachersCanManageOwnClasses =
    body.allTeachersCanManageOwnClasses ?? false
  const teacherClassPermissions = (body.teacherClassPermissions ?? [])
    .filter((permission) => permission.teacherUserId)
    .map((permission) => ({
      teacher_user_id: permission.teacherUserId!,
      can_create_classes: Boolean(permission.canCreateClasses),
      can_manage_own_classes: Boolean(permission.canManageOwnClasses),
    }))
    .filter(
      (permission) =>
        permission.can_create_classes || permission.can_manage_own_classes,
    )

  const { error: settingsError } = await supabase.rpc(
    "update_organization_settings",
    {
      target_org_id: organizationId,
      target_public_features_enabled: publicFeaturesEnabled,
      target_all_teachers_can_create_classes: allTeachersCanCreateClasses,
      target_all_teachers_can_manage_own_classes:
        allTeachersCanManageOwnClasses,
      target_teacher_class_permissions: teacherClassPermissions,
    },
  )

  if (settingsError) {
    return NextResponse.json(
      { error: settingsError.message },
      {
        status: settingsError.message.includes("Only organization admins")
          ? 403
          : 400,
      },
    )
  }

  const settingsByOrganization = await loadOrganizationSettings(
    [organizationId],
    supabase,
  )
  const settings = settingsByOrganization.get(organizationId)

  return NextResponse.json({ settings })
}
