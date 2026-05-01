"use client"

import { use } from "react"
import { ExternalLink, Puzzle } from "lucide-react"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassRoute,
} from "@/features/classes/use-class-route"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { resolveClassFeatures } from "@/lib/features/feature-registry"
import { useApp } from "@/lib/store"

export default function CustomExtensionPage({
  params,
}: {
  params: Promise<{ classId: string; extensionId: string }>
}) {
  const { classId, extensionId } = use(params)
  const { activeOrganization, featureDefinitions } = useApp()
  const { cls, classRow, isLoading, errorMessage } = useClassRoute(classId)

  if (!cls || !classRow || !activeOrganization) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  const extensionFeature = resolveClassFeatures({
    definitions: featureDefinitions,
    organizationSettings: activeOrganization.featureSettings,
    classSettings: classRow.featureSettings,
    organizationExtensions: activeOrganization.extensions,
    classExtensionSettings: classRow.extensionSettings,
  }).find((feature) => feature.customExtension?.id === extensionId)

  if (!extensionFeature?.customExtension) {
    return (
      <div className="p-6 text-muted-foreground">Extension not found.</div>
    )
  }

  if (!extensionFeature.enabled) {
    return (
      <ClassFeatureDisabledFallback
        classId={classId}
        featureLabel={extensionFeature.label}
      />
    )
  }

  const extension = extensionFeature.customExtension

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-primary" />
            <h1 className="truncate text-lg font-semibold text-foreground">
              {extension.name}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {extension.description || cls.name}
          </p>
        </div>
        {extension.launch_url ? (
          <Button asChild size="sm" variant="outline" className="gap-2">
            <a href={extension.launch_url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open
            </a>
          </Button>
        ) : null}
      </div>

      {extension.launch_url ? (
        <iframe
          src={extension.launch_url}
          title={extension.name}
          className="min-h-0 flex-1 border-0 bg-background"
          sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
        />
      ) : (
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{extension.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This extension does not have a launch URL configured yet.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
