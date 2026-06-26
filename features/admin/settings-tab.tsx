"use client"

import { LoaderCircle, Save, Settings2 } from "lucide-react"
import { useEffect, useMemo, useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { type OrganizationMemberRow, useApp } from "@/lib/store"
import type { OrganizationSettingsPayload } from "@/lib/supabase/organization-settings"

type PermissionMode = "none" | "all" | "selected"

type PermissionDraft = Record<
  string,
  {
    canCreateClasses: boolean
    canManageOwnClasses: boolean
  }
>

function getActiveOrganizationRoles(member: OrganizationMemberRow) {
  const activeRoles = member.roles
    .filter((roleRecord) => roleRecord.status === "active")
    .map((roleRecord) => roleRecord.role)

  return activeRoles.length > 0 ? activeRoles : [member.role]
}

function getPermissionMode(
  allEnabled: boolean,
  permissions: OrganizationSettingsPayload["teacherClassPermissions"],
  key: "can_create_classes" | "can_manage_own_classes",
): PermissionMode {
  if (allEnabled) return "all"
  return permissions.some((permission) => permission[key]) ? "selected" : "none"
}

function getPermissionDraft(
  settings: OrganizationSettingsPayload | undefined,
): PermissionDraft {
  const draft: PermissionDraft = {}

  for (const permission of settings?.teacherClassPermissions ?? []) {
    draft[permission.teacher_user_id] = {
      canCreateClasses: permission.can_create_classes,
      canManageOwnClasses: permission.can_manage_own_classes,
    }
  }

  return draft
}

export function SettingsTab() {
  const {
    activeOrganization,
    organizationMembers,
    organizationUsersStatus,
    organizationUsersError,
    refreshOrganizationUsers,
    updateOrganizationSettings,
  } = useApp()
  const settings = activeOrganization?.settings
  const [publicFeaturesEnabled, setPublicFeaturesEnabled] = useState(false)
  const [createMode, setCreateMode] = useState<PermissionMode>("none")
  const [manageMode, setManageMode] = useState<PermissionMode>("none")
  const [permissionDraft, setPermissionDraft] = useState<PermissionDraft>({})
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const teacherMembers = useMemo(
    () =>
      organizationMembers.filter(
        (member) =>
          member.status === "active" &&
          getActiveOrganizationRoles(member).includes("teacher"),
      ),
    [organizationMembers],
  )
  const isLoading = organizationUsersStatus === "loading"

  useEffect(() => {
    void refreshOrganizationUsers().catch(() => {})
  }, [activeOrganization?.id, refreshOrganizationUsers])

  useEffect(() => {
    if (!settings) return

    setPublicFeaturesEnabled(settings.public_features_enabled)
    setCreateMode(
      getPermissionMode(
        settings.all_teachers_can_create_classes,
        settings.teacherClassPermissions,
        "can_create_classes",
      ),
    )
    setManageMode(
      getPermissionMode(
        settings.all_teachers_can_manage_own_classes,
        settings.teacherClassPermissions,
        "can_manage_own_classes",
      ),
    )
    setPermissionDraft(getPermissionDraft(settings))
  }, [settings])

  useEffect(() => {
    if (!organizationUsersError) return

    toast({
      title: "Could not load teachers",
      description: organizationUsersError,
      variant: "destructive",
    })
  }, [organizationUsersError, toast])

  function setTeacherPermission(
    teacherUserId: string,
    key: "canCreateClasses" | "canManageOwnClasses",
    enabled: boolean,
  ) {
    setPermissionDraft((current) => ({
      ...current,
      [teacherUserId]: {
        canCreateClasses: current[teacherUserId]?.canCreateClasses ?? false,
        canManageOwnClasses:
          current[teacherUserId]?.canManageOwnClasses ?? false,
        [key]: enabled,
      },
    }))
  }

  function saveSettings() {
    if (!activeOrganization) return

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(
            activeOrganization.id,
          )}/settings`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              publicFeaturesEnabled,
              allTeachersCanCreateClasses: createMode === "all",
              allTeachersCanManageOwnClasses: manageMode === "all",
              teacherClassPermissions: teacherMembers.map((teacher) => ({
                teacherUserId: teacher.user_id,
                canCreateClasses:
                  createMode === "selected"
                    ? (permissionDraft[teacher.user_id]?.canCreateClasses ??
                      false)
                    : false,
                canManageOwnClasses:
                  manageMode === "selected"
                    ? (permissionDraft[teacher.user_id]?.canManageOwnClasses ??
                      false)
                    : false,
              })),
            }),
          },
        )
        const payload = (await response.json().catch(() => ({}))) as {
          settings?: OrganizationSettingsPayload
          error?: string
        }

        if (!response.ok || !payload.settings) {
          throw new Error(
            payload.error ?? "Could not save organization settings",
          )
        }

        updateOrganizationSettings(activeOrganization.id, payload.settings)
        await refreshOrganizationUsers({ force: true })
        toast({ title: "Organization settings saved" })
      } catch (error) {
        toast({
          title: "Settings update failed",
          description:
            error instanceof Error
              ? error.message
              : "Could not save organization settings",
          variant: "destructive",
        })
      }
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Organization Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                Public organization features
              </Label>
              <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
                Allows public join links and organization-visible classes for
                this organization.
              </p>
            </div>
            <Switch
              checked={publicFeaturesEnabled}
              onCheckedChange={setPublicFeaturesEnabled}
              disabled={isPending}
              aria-label="Toggle public organization features"
            />
          </div>

          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-medium">Teacher class permissions</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Decide whether teachers can create classes and edit details for
                classes assigned to them.
              </p>
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <PermissionModeField
                label="Class creation"
                description="Who can create new classes."
                value={createMode}
                onValueChange={setCreateMode}
                disabled={isPending}
              />
              <PermissionModeField
                label="Class detail editing"
                description="Who can edit details for assigned classes."
                value={manageMode}
                onValueChange={setManageMode}
                disabled={isPending}
              />
            </div>

            {createMode === "selected" || manageMode === "selected" ? (
              <div className="border-t">
                <div className="flex items-center justify-between gap-3 bg-muted/30 px-4 py-3">
                  <div>
                    <h4 className="text-sm font-medium">Selected teachers</h4>
                    <p className="text-xs text-muted-foreground">
                      Choose which active teachers receive the selected
                      permissions.
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {teacherMembers.length} teachers
                  </Badge>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading teachers...
                  </div>
                ) : teacherMembers.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No active teachers found.
                  </div>
                ) : (
                  <div className="divide-y">
                    {teacherMembers.map((teacher) => (
                      <div
                        key={teacher.user_id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {teacher.profile?.display_name ?? "Unnamed teacher"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {teacher.profile?.email ?? "No email"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                          {createMode === "selected" ? (
                            <ToggleLabel
                              label="Create classes"
                              checked={
                                permissionDraft[teacher.user_id]
                                  ?.canCreateClasses ?? false
                              }
                              disabled={isPending}
                              onCheckedChange={(checked) =>
                                setTeacherPermission(
                                  teacher.user_id,
                                  "canCreateClasses",
                                  checked,
                                )
                              }
                            />
                          ) : null}
                          {manageMode === "selected" ? (
                            <ToggleLabel
                              label="Edit class details"
                              checked={
                                permissionDraft[teacher.user_id]
                                  ?.canManageOwnClasses ?? false
                              }
                              disabled={isPending}
                              onCheckedChange={(checked) =>
                                setTeacherPermission(
                                  teacher.user_id,
                                  "canManageOwnClasses",
                                  checked,
                                )
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Button
              className="gap-2"
              onClick={saveSettings}
              disabled={isPending || !activeOrganization}
            >
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PermissionModeField({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string
  description: string
  value: PermissionMode
  onValueChange: (value: PermissionMode) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No teachers</SelectItem>
          <SelectItem value="all">All teachers</SelectItem>
          <SelectItem value="selected">Selected teachers</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function ToggleLabel({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
      {label}
    </label>
  )
}
