"use client"

import { ExternalLink } from "lucide-react"
import { use } from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassRoute,
} from "@/features/classes/use-class-route"
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
    return <div className="p-6 text-muted-foreground">Extension not found.</div>
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
        <ClassPageHeader
          title={cls.name}
          code={cls.code}
          section="Extensions"
          detail={
            <p className="text-xs text-muted-foreground">
              {extension.name}
              {extension.description ? ` · ${extension.description}` : ""}
            </p>
          }
          actions={
            extension.launch_url ? (
              <Button asChild size="sm" variant="outline" className="gap-2">
                <a href={extension.launch_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open
                </a>
              </Button>
            ) : null
          }
        />
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
