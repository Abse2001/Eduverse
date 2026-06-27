"use client"

import { use } from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
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
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <ClassPageHeader
        title={cls.name}
        code={cls.code}
        section={extension.name}
      />

      {extension.launch_url ? (
        <Card className="overflow-hidden p-0">
          <iframe
            src={extension.launch_url}
            title={extension.name}
            className="h-[calc(100vh-13rem)] min-h-[32rem] w-full border-0 bg-background"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
          />
        </Card>
      ) : (
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
      )}
    </div>
  )
}
