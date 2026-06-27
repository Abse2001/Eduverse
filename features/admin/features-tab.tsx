"use client"

import { LoaderCircle, PlusCircle, Puzzle } from "lucide-react"
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
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
import { useToast } from "@/hooks/use-toast"
import { getFeatureDisplayLabel } from "@/lib/features/feature-registry"
import { isOrganizationFeatureLockedDisabled } from "@/lib/features/organization-feature-summary"
import { useApp } from "@/lib/store"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
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
  const [busyFeatureKey, setBusyFeatureKey] = useState<string | null>(null)
  const [isExtensionDialogOpen, setIsExtensionDialogOpen] = useState(false)
  const [extensionName, setExtensionName] = useState("")
  const [extensionDescription, setExtensionDescription] = useState("")
  const [extensionUrl, setExtensionUrl] = useState("")
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const isLoading = featureDefinitionsStatus === "loading"

  const featureRows = useMemo(
    () =>
      buildFeatureRows(
        featureDefinitions,
        activeOrganization?.featureSettings ?? [],
      ),
    [activeOrganization?.featureSettings, featureDefinitions],
  )
  const extensionFeature = useMemo(
    () =>
      flattenFeatureRows(featureRows).find(
        (feature) => feature.key === "extensions",
      ) ?? null,
    [featureRows],
  )
  const canAddExtensions = extensionFeature?.effectiveEnabled === true
  const extensionUnavailableMessage = getExtensionUnavailableMessage(
    extensionFeature,
    isLoading,
  )

  useEffect(() => {
    void refreshFeatureDefinitions().catch(() => {})
  }, [refreshFeatureDefinitions])

  useEffect(() => {
    if (!featureDefinitionsError) return

    showFeatureError(featureDefinitionsError)
  }, [featureDefinitionsError])

  function showFeatureError(description: string) {
    toast({
      title: "Feature update failed",
      description,
      variant: "destructive",
    })
  }

  function toggleFeature(featureKey: string, enabled: boolean) {
    if (!activeOrganization) return
    const feature = featureRows
      .flatMap((row) => [row, ...row.children])
      .find((row) => row.key === featureKey)

    if (enabled && feature?.lockedDisabled) {
      showFeatureError(
        "This feature was disabled when the organization was created and cannot be enabled later.",
      )
      return
    }

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
        showFeatureError(error.message)
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

    if (!canAddExtensions) {
      showFeatureError(
        extensionUnavailableMessage ??
          "Enable Extensions before adding custom extensions.",
      )
      setIsExtensionDialogOpen(false)
      return
    }

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
        showFeatureError(error.message)
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
        showFeatureError(error.message)
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
                  extensions={activeOrganization?.extensions ?? []}
                  busyFeatureKey={busyFeatureKey}
                  canAddExtensions={canAddExtensions}
                  extensionUnavailableMessage={extensionUnavailableMessage}
                  isPending={isPending}
                  onAddExtension={() => setIsExtensionDialogOpen(true)}
                  onToggle={toggleFeature}
                  onToggleExtension={toggleExtension}
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
  lockedDisabled: boolean
  parentEnabled: boolean
  parentLabel: string | null
  children: FeatureRow[]
}

function FeatureSettingRow({
  feature,
  extensions = [],
  busyFeatureKey,
  canAddExtensions = false,
  extensionUnavailableMessage = null,
  isPending,
  onAddExtension,
  onToggle,
  onToggleExtension,
}: {
  feature: FeatureRow
  extensions?: OrganizationExtension[]
  busyFeatureKey: string | null
  canAddExtensions?: boolean
  extensionUnavailableMessage?: string | null
  isPending: boolean
  onAddExtension?: () => void
  onToggle: (featureKey: string, enabled: boolean) => void
  onToggleExtension?: (extensionId: string, enabled: boolean) => void
}) {
  const isBusy = isPending && busyFeatureKey === feature.key
  const isLockedByParent = !feature.parentEnabled
  const isLockedDisabled = feature.lockedDisabled
  const isExtensionsFeature = feature.key === "extensions"

  return (
    <div>
      <div
        className={cn(
          "flex items-start gap-4 px-5 py-4",
          isLockedDisabled && "bg-muted/30 opacity-70",
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Puzzle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {feature.label}
            </p>
            {isLockedByParent && feature.parentLabel ? (
              <Badge variant="outline" className="text-[10px]">
                Enable {feature.parentLabel.toLowerCase()}
              </Badge>
            ) : null}
            {isLockedDisabled ? (
              <Badge variant="outline" className="text-[10px]">
                Locked off
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLockedDisabled
              ? "Disabled at organization creation and cannot be enabled."
              : feature.description || "No description provided."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isBusy ? (
            <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
          {isExtensionsFeature ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              disabled={!canAddExtensions}
              onClick={onAddExtension}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add
            </Button>
          ) : null}
          <Switch
            checked={feature.checked}
            disabled={isPending || isLockedByParent || isLockedDisabled}
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
              extensions={extensions}
              busyFeatureKey={busyFeatureKey}
              canAddExtensions={canAddExtensions}
              extensionUnavailableMessage={extensionUnavailableMessage}
              isPending={isPending}
              onAddExtension={onAddExtension}
              onToggle={onToggle}
              onToggleExtension={onToggleExtension}
            />
          ))}
          {isExtensionsFeature ? (
            <ExtensionRows
              extensions={extensions}
              busyFeatureKey={busyFeatureKey}
              extensionUnavailableMessage={extensionUnavailableMessage}
              isPending={isPending}
              onToggleExtension={onToggleExtension}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ExtensionRows({
  extensions,
  busyFeatureKey,
  extensionUnavailableMessage,
  isPending,
  onToggleExtension,
}: {
  extensions: OrganizationExtension[]
  busyFeatureKey: string | null
  extensionUnavailableMessage: string | null
  isPending: boolean
  onToggleExtension?: (extensionId: string, enabled: boolean) => void
}) {
  return (
    <>
      {extensionUnavailableMessage ? (
        <div className="bg-muted/30 px-5 py-3 text-xs leading-5 text-muted-foreground">
          {extensionUnavailableMessage}
        </div>
      ) : null}

      {extensions.map((extension) => (
        <div key={extension.id} className="flex items-start gap-4 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Puzzle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {extension.name}
              </p>
              <Badge variant="outline" className="text-[10px]">
                Custom
              </Badge>
            </div>
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
              disabled={
                isPending ||
                Boolean(extensionUnavailableMessage) ||
                !onToggleExtension
              }
              aria-label={`Toggle ${extension.name}`}
              onCheckedChange={(checked) =>
                onToggleExtension?.(extension.id, checked)
              }
            />
          </div>
        </div>
      ))}

      {extensions.length === 0 ? (
        <div className="px-5 py-5 text-sm text-muted-foreground">
          No custom extensions yet.
        </div>
      ) : null}
    </>
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
    const setting = settingsByKey.get(definition.key)

    rowsByKey.set(definition.key, {
      ...definition,
      label: getFeatureDisplayLabel(definition),
      checked: setting?.enabled ?? definition.default_enabled,
      effectiveEnabled: false,
      lockedDisabled: isOrganizationFeatureLockedDisabled(setting?.config),
      parentEnabled: true,
      parentLabel: null,
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

  function applyEffectiveState(
    row: FeatureRow,
    parentEnabled: boolean,
    parentLabel: string | null,
  ) {
    row.parentEnabled = parentEnabled
    row.parentLabel = parentLabel
    row.effectiveEnabled = parentEnabled && row.checked

    for (const child of row.children) {
      applyEffectiveState(child, row.effectiveEnabled, row.label)
    }
  }

  const topLevelRows = rows.filter((row) => !row.parent_key)

  for (const row of topLevelRows) {
    applyEffectiveState(row, true, null)
  }

  return topLevelRows
}

function flattenFeatureRows(rows: FeatureRow[]): FeatureRow[] {
  return rows.flatMap((row) => [row, ...flattenFeatureRows(row.children)])
}

function getExtensionUnavailableMessage(
  extensionFeature: FeatureRow | null,
  isLoading: boolean,
) {
  if (isLoading) return "Loading extension availability..."

  if (!extensionFeature) {
    return "Extensions are not available for this organization."
  }

  if (extensionFeature.lockedDisabled) {
    return "Extensions were disabled when this organization was created and cannot be enabled."
  }

  if (!extensionFeature.effectiveEnabled) {
    return "Enable Extensions in Organization Features before adding custom extensions."
  }

  return null
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
