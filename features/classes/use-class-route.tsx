"use client"

import { useEffect, useState } from "react"
import { getClassById, type Class } from "@/lib/mock-data"
import { loadClass, toLegacyClass } from "@/lib/supabase/classes"

export function useClassRoute(classId: string) {
  const [cls, setCls] = useState<Class | null>(
    () => getClassById(classId) ?? null,
  )
  const [isLoading, setIsLoading] = useState(() => !getClassById(classId))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const mockClass = getClassById(classId)

    if (mockClass) {
      setCls(mockClass)
      setIsLoading(false)
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
  }, [classId])

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
