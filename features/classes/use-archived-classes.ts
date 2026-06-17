"use client"

import { useEffect, useState } from "react"
import type { OrganizationClass } from "@/lib/supabase/classes"
import { useApp } from "@/lib/store"

type ArchivedClassesResponse = {
  classes: OrganizationClass[]
}

type ArchivedClassesStatus = "idle" | "loading" | "ready" | "error"

export function useArchivedClasses() {
  const { activeOrganization } = useApp()
  const [classes, setClasses] = useState<OrganizationClass[]>([])
  const [status, setStatus] = useState<ArchivedClassesStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function refresh() {
    if (!activeOrganization) {
      setClasses([])
      setStatus("idle")
      setErrorMessage(null)
      return []
    }

    setStatus("loading")
    setErrorMessage(null)

    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(
          activeOrganization.id,
        )}/class-history`,
      )
      const payload = (await response.json().catch(() => ({}))) as
        | ArchivedClassesResponse
        | { error?: string }

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Could not load past terms",
        )
      }

      const nextClasses = "classes" in payload ? payload.classes : []
      setClasses(nextClasses)
      setStatus("ready")
      return nextClasses
    } catch (error) {
      setClasses([])
      setStatus("error")
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load past terms",
      )
      return []
    }
  }

  useEffect(() => {
    void refresh()
  }, [activeOrganization?.id])

  return {
    archivedClasses: classes,
    archivedClassesStatus: status,
    archivedClassesError: errorMessage,
    refreshArchivedClasses: refresh,
  }
}

export function groupArchivedClassesByTerm(classes: OrganizationClass[]) {
  const termMap = new Map<string, OrganizationClass[]>()

  for (const classItem of classes) {
    const label = classItem.semester?.trim() || "Unassigned Term"
    termMap.set(label, [...(termMap.get(label) ?? []), classItem])
  }

  return Array.from(termMap.entries()).map(([label, termClasses]) => ({
    label,
    classes: termClasses,
  }))
}
