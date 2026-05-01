"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { hasClassAccessForRole } from "@/lib/education/classes"
import type { Class, User } from "@/lib/mock-data"
import { useApp } from "@/lib/store"
import {
  loadClass,
  type OrganizationClass,
  toLegacyClass,
} from "@/lib/supabase/classes"
import {
  resolveClassFeatures,
  type FeatureKey,
} from "@/lib/features/feature-registry"
import { Button } from "@/components/ui/button"

export function useClassRoute(classId: string) {
  const {
    activeOrganization,
    currentUser,
    organizationClasses,
    organizationClassesStatus,
  } = useApp()
  const cachedClass = organizationClasses.find(
    (classItem) => classItem.id === classId,
  )
  const accessibleCachedClass =
    cachedClass &&
    activeOrganization &&
    canOpenClass(cachedClass, activeOrganization.id, currentUser)
      ? cachedClass
      : null
  const [cls, setCls] = useState<Class | null>(() =>
    accessibleCachedClass ? toLegacyClass(accessibleCachedClass) : null,
  )
  const [classRow, setClassRow] = useState<OrganizationClass | null>(
    accessibleCachedClass,
  )
  const [isLoading, setIsLoading] = useState(() => !accessibleCachedClass)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const cachedClass = organizationClasses.find(
      (classItem) => classItem.id === classId,
    )

    if (!activeOrganization) {
      setCls(null)
      setClassRow(null)
      setIsLoading(false)
      setErrorMessage("Select an organization to open this class.")
      return
    }

    if (cachedClass) {
      if (!canOpenClass(cachedClass, activeOrganization.id, currentUser)) {
        setCls(null)
        setClassRow(null)
        setIsLoading(false)
        setErrorMessage("This class is not available for your selected role.")
        return
      }

      setCls(toLegacyClass(cachedClass))
      setClassRow(cachedClass)
      setIsLoading(false)
      setErrorMessage(null)
      return
    }

    if (organizationClassesStatus === "loading") {
      setIsLoading(true)
      setErrorMessage(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setErrorMessage(null)

    loadClass(classId)
      .then((classRow) => {
        if (cancelled) return
        if (!canOpenClass(classRow, activeOrganization.id, currentUser)) {
          setCls(null)
          setClassRow(null)
          setErrorMessage("This class is not available for your selected role.")
          return
        }

        setCls(toLegacyClass(classRow))
        setClassRow(classRow)
      })
      .catch((error) => {
        if (cancelled) return
        setCls(null)
        setClassRow(null)
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load class",
        )
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    activeOrganization?.id,
    classId,
    currentUser,
    organizationClasses,
    organizationClassesStatus,
  ])

  return { cls, classRow, isLoading, errorMessage }
}

function canOpenClass(
  classRow: OrganizationClass,
  activeOrganizationId: string,
  currentUser: User,
) {
  return (
    classRow.organization_id === activeOrganizationId &&
    hasClassAccessForRole(classRow, currentUser)
  )
}

export function useClassFeatureRoute(classId: string, featureKey: FeatureKey) {
  const route = useClassRoute(classId)
  const { activeOrganization, featureDefinitions } = useApp()

  if (!route.classRow || !activeOrganization) {
    return {
      ...route,
      isFeatureDisabled: false,
    }
  }

  const feature = resolveClassFeatures({
    definitions: featureDefinitions,
    organizationSettings: activeOrganization.featureSettings,
    classSettings: route.classRow.featureSettings,
  }).find((feature) => feature.key === featureKey)

  return {
    ...route,
    isFeatureDisabled: feature?.enabled === false,
  }
}

export function ClassRouteFallback({
  isLoading,
  errorMessage,
}: {
  isLoading: boolean
  errorMessage: string | null
}) {
  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading class...</div>
  }

  return (
    <div className="p-6 text-muted-foreground">
      {errorMessage ?? "Class not found."}
    </div>
  )
}

export function ClassFeatureDisabledFallback({
  classId,
  featureLabel,
}: {
  classId: string
  featureLabel: string
}) {
  return (
    <div className="p-6 max-w-xl">
      <div className="rounded-lg border bg-card p-5">
        <h1 className="text-lg font-semibold text-foreground">
          {featureLabel} is disabled
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This feature is not enabled for this class or organization.
        </p>
        <Button asChild className="mt-4" size="sm">
          <Link href={`/classes/${classId}/home`}>Go to class home</Link>
        </Button>
      </div>
    </div>
  )
}
