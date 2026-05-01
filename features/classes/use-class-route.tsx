"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { hasClassAccessForRole } from "@/lib/education/classes"
import { getClassById, type Class } from "@/lib/mock-data"
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
  const { currentUser, organizationClasses, organizationClassesStatus } =
    useApp()
  const cachedClass = organizationClasses.find(
    (classItem) => classItem.id === classId,
  )
  const accessibleCachedClass =
    cachedClass && hasClassAccessForRole(cachedClass, currentUser)
      ? cachedClass
      : null
  const [cls, setCls] = useState<Class | null>(
    () =>
      getClassById(classId) ??
      (accessibleCachedClass ? toLegacyClass(accessibleCachedClass) : null),
  )
  const [classRow, setClassRow] = useState<OrganizationClass | null>(
    accessibleCachedClass,
  )
  const [isLoading, setIsLoading] = useState(
    () => !getClassById(classId) && !accessibleCachedClass,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const mockClass = getClassById(classId)
    const cachedClass = organizationClasses.find(
      (classItem) => classItem.id === classId,
    )

    if (mockClass) {
      setCls(mockClass)
      setClassRow(cachedClass ?? null)
      setIsLoading(false)
      setErrorMessage(null)
      return
    }

    if (cachedClass) {
      if (!hasClassAccessForRole(cachedClass, currentUser)) {
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
        if (!hasClassAccessForRole(classRow, currentUser)) {
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
  }, [classId, currentUser, organizationClasses, organizationClassesStatus])

  return { cls, classRow, isLoading, errorMessage }
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
