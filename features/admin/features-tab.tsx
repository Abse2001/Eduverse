"use client"

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react"
import { LoaderCircle, PlusCircle, Puzzle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { useApp } from "@/lib/store"
import type {
  FeatureDefinition,
  FeatureSetting,
  OrganizationExtension,
} from "@/lib/supabase/features"

export function FeaturesTab() {
  const {
    activeOrganization,
    featureDefinitions,
    featureDefinitionsStatus,
    featureDefinitionsError,
    refreshFeatureDefinitions,
    updateOrganizationFeatureSetting,
    upsertOrganizationExtension,
  } = useApp()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyFeatureKey, setBusyFeatureKey] = useState<string | null>(null)
  const [isExtensionDialogOpen, setIsExtensionDialogOpen] = useState(false)
  const [extensionName, setExtensionName] = useState("")
  const [extensionDescription, setExtensionDescription] = useState("")
  const [extensionUrl, setExtensionUrl] = useState("")
  const [isPending, startTransition] = useTransition()
  const isLoading = featureDefinitionsStatus === "loading"
  const displayedErrorMessage = errorMessage ?? featureDefinitionsError

  const featureRows = useMemo(
    () =>
      buildFeatureRows(
        featureDefinitions,
        activeOrganization?.featureSettings ?? [],
      ),
    [activeOrganization?.featureSettings, featureDefinitions],
  )

  useEffect(() => {
    void refreshFeatureDefinitions().catch(() => {})
  }, [refreshFeatureDefinitions])

  function toggleFeature(featureKey: string, enabled: boolean) {
    if (!activeOrganization) return

    setErrorMessage(null)
    setBusyFeatureKey(featureKey)

    startTransition(async () => {
      const { error } = await createClient()
        .from("organization_feature_settings")
        .upsert(
          {
            organization_id: activeOrganization.id,
            feature_key: featureKey,
            enabled,
            config: {},
          },
          { onConflict: "organization_id,feature_key" },
        )

      if (error) {
        setErrorMessage(error.message)
        setBusyFeatureKey(null)
        return
      }

      updateOrganizationFeatureSetting(activeOrganization.id, {
        feature_key: featureKey,
        enabled,
        config: {},
      })
      setBusyFeatureKey(null)
    })
  }

  function createExtension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeOrganization) return

    setErrorMessage(null)

    startTransition(async () => {
      const { data, error } = await createClient()
        .from("organization_extensions")
        .insert({
          organization_id: activeOrganization.id,
          name: extensionName,
          slug: slugify(extensionName),
          description: extensionDescription,
          launch_url: extensionUrl || null,
          enabled: true,
        })
        .select(
          "id, organization_id, name, slug, description, launch_url, enabled, sort_order, config",
        )
        .single()

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setExtensionName("")
      setExtensionDescription("")
      setExtensionUrl("")
      setIsExtensionDialogOpen(false)
      upsertOrganizationExtension(
        activeOrganization.id,
        data as OrganizationExtension,
      )
    })
  }

  function toggleExtension(extensionId: string, enabled: boolean) {
    setErrorMessage(null)
    setBusyFeatureKey(extensionId)

    startTransition(async () => {
      const { data, error } = await createClient()
        .from("organization_extensions")
        .update({ enabled })
        .eq("id", extensionId)
        .select(
          "id, organization_id, name, slug, description, launch_url, enabled, sort_order, config",
        )
        .single()

      if (error) {
        setErrorMessage(error.message)
        setBusyFeatureKey(null)
        return
      }

      upsertOrganizationExtension(
        data.organization_id,
        data as OrganizationExtension,
      )
      setBusyFeatureKey(null)
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Organization Features</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {displayedErrorMessage ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertTitle>Feature update failed</AlertTitle>
                <AlertDescription>{displayedErrorMessage}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading features...
            </div>
          ) : (
            <div className="divide-y divide-border">
              {featureRows.map((feature) => (
                <FeatureSettingRow
                  key={feature.key}
                  feature={feature}
                  busyFeatureKey={busyFeatureKey}
                  isPending={isPending}
                  onToggle={toggleFeature}
                />
              ))}

              {featureRows.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No features found.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">Custom Extensions</CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setIsExtensionDialogOpen(true)}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add Extension
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {(activeOrganization?.extensions ?? []).map((extension) => (
              <div
                key={extension.id}
                className="flex items-start gap-4 px-5 py-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Puzzle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {extension.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {extension.description ||
                      extension.launch_url ||
                      "No description provided."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isPending && busyFeatureKey === extension.id ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  <Switch
                    checked={extension.enabled}
                    disabled={isPending}
                    aria-label={`Toggle ${extension.name}`}
                    onCheckedChange={(checked) =>
                      toggleExtension(extension.id, checked)
                    }
                  />
                </div>
              </div>
            ))}

            {(activeOrganization?.extensions ?? []).length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No custom extensions yet.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isExtensionDialogOpen}
        onOpenChange={setIsExtensionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add custom extension</DialogTitle>
            <DialogDescription>
              Custom extensions appear under Extensions in each class sidebar.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createExtension}>
            <div className="space-y-2">
              <Label htmlFor="extension-name">Name</Label>
              <Input
                id="extension-name"
                value={extensionName}
                onChange={(event) => setExtensionName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="extension-url">Launch URL</Label>
              <Input
                id="extension-url"
                type="url"
                value={extensionUrl}
                onChange={(event) => setExtensionUrl(event.target.value)}
                placeholder="https://example.com/tool"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="extension-description">Description</Label>
              <Textarea
                id="extension-description"
                value={extensionDescription}
                onChange={(event) =>
                  setExtensionDescription(event.target.value)
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsExtensionDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add extension"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type FeatureRow = FeatureDefinition & {
  checked: boolean
  effectiveEnabled: boolean
  parentEnabled: boolean
  children: FeatureRow[]
}

function FeatureSettingRow({
  feature,
  busyFeatureKey,
  isPending,
  onToggle,
}: {
  feature: FeatureRow
  busyFeatureKey: string | null
  isPending: boolean
  onToggle: (featureKey: string, enabled: boolean) => void
}) {
  const isBusy = isPending && busyFeatureKey === feature.key
  const isLockedByParent = !feature.parentEnabled

  return (
    <div>
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Puzzle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {feature.label}
            </p>
            <Badge variant="secondary" className="text-[10px]">
              {feature.kind}
            </Badge>
            {isLockedByParent ? (
              <Badge variant="outline" className="text-[10px]">
                Blocked by parent
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {feature.description || "No description provided."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isBusy ? (
            <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
          <Switch
            checked={feature.checked}
            disabled={isPending || isLockedByParent}
            aria-label={`Toggle ${feature.label}`}
            onCheckedChange={(checked) => onToggle(feature.key, checked)}
          />
        </div>
      </div>

      {feature.children.length > 0 ? (
        <div className="ml-9 border-l border-border">
          {feature.children.map((child) => (
            <FeatureSettingRow
              key={child.key}
              feature={child}
              busyFeatureKey={busyFeatureKey}
              isPending={isPending}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function buildFeatureRows(
  definitions: FeatureDefinition[],
  settings: FeatureSetting[],
) {
  const settingsByKey = new Map(
    settings.map((setting) => [setting.feature_key, setting]),
  )
  const rowsByKey = new Map<string, FeatureRow>()

  for (const definition of definitions) {
    rowsByKey.set(definition.key, {
      ...definition,
      checked:
        settingsByKey.get(definition.key)?.enabled ??
        definition.default_enabled,
      effectiveEnabled: false,
      parentEnabled: true,
      children: [],
    })
  }

  const rows = Array.from(rowsByKey.values()).sort(
    (left, right) => left.sort_order - right.sort_order,
  )

  for (const row of rows) {
    if (!row.parent_key) continue

    rowsByKey.get(row.parent_key)?.children.push(row)
  }

  function applyEffectiveState(row: FeatureRow, parentEnabled: boolean) {
    row.parentEnabled = parentEnabled
    row.effectiveEnabled = parentEnabled && row.checked

    for (const child of row.children) {
      applyEffectiveState(child, row.effectiveEnabled)
    }
  }

  const topLevelRows = rows.filter((row) => !row.parent_key)

  for (const row of topLevelRows) {
    applyEffectiveState(row, true)
  }

  return topLevelRows
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "extension"
  )
}
