"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { LoaderCircle, Puzzle, RotateCcw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { createClient } from "@/lib/supabase/client"
import { useApp } from "@/lib/store"
import type { FeatureDefinition, FeatureSetting } from "@/lib/supabase/features"

export function FeaturesTab() {
  const {
    activeOrganization,
    featureDefinitions,
    featureDefinitionsStatus,
    featureDefinitionsError,
    refreshFeatureDefinitions,
    refreshCurrentUser,
  } = useApp()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [busyFeatureKey, setBusyFeatureKey] = useState<string | null>(null)
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
    setSuccessMessage(null)
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

      await refreshCurrentUser()
      setSuccessMessage("Organization features updated.")
      setBusyFeatureKey(null)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Organization Features</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void refreshFeatureDefinitions({ force: true })}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
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

        {successMessage ? (
          <div className="p-4">
            <Alert>
              <AlertTitle>Updated</AlertTitle>
              <AlertDescription>{successMessage}</AlertDescription>
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
