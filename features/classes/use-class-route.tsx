"use client"

import { useEffect, useState } from "react"
import { getClassById, type Class } from "@/lib/mock-data"
import { useApp } from "@/lib/store"
import { loadClass, toLegacyClass } from "@/lib/supabase/classes"

export function useClassRoute(classId: string) {
  const { organizationClasses, organizationClassesStatus } = useApp()
  const cachedClass = organizationClasses.find(
    (classItem) => classItem.id === classId,
  )
  const [cls, setCls] = useState<Class | null>(
    () =>
      getClassById(classId) ??
      (cachedClass ? toLegacyClass(cachedClass) : null),
  )
  const [isLoading, setIsLoading] = useState(
    () => !getClassById(classId) && !cachedClass,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const mockClass = getClassById(classId)
    const cachedClass = organizationClasses.find(
      (classItem) => classItem.id === classId,
    )

    if (mockClass) {
      setCls(mockClass)
      setIsLoading(false)
      setErrorMessage(null)
      return
    }

    if (cachedClass) {
      setCls(toLegacyClass(cachedClass))
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
        setCls(toLegacyClass(classRow))
      })
      .catch((error) => {
        if (cancelled) return
        setCls(null)
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
  }, [classId, organizationClasses, organizationClassesStatus])

  return { cls, isLoading, errorMessage }
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
