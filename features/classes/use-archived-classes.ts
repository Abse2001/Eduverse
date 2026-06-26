"use client"

import { useEffect, useState } from "react"
export { groupClassesByTermAndStage as groupArchivedClassesByTerm } from "@/lib/education/classes"
import { useApp } from "@/lib/store"
import type { OrganizationClass } from "@/lib/supabase/classes"

type ArchivedClassesResponse = {
  classes: OrganizationClass[]
}

type ArchivedClassesStatus = "idle" | "loading" | "ready" | "error"
type ArchivedClassesCacheEntry = {
  classes: OrganizationClass[] | null
  request: Promise<OrganizationClass[]> | null
}

const archivedClassesCache = new Map<string, ArchivedClassesCacheEntry>()
const archivedClassesListeners = new Map<
  string,
  Set<(classes: OrganizationClass[]) => void>
>()

export function useArchivedClasses() {
  const { activeOrganization, authUser } = useApp()
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

    const cacheKey = getArchivedClassesCacheKey(
      activeOrganization.id,
      authUser?.id ?? null,
    )
    const cachedClasses = readArchivedClassesCache(cacheKey)
    setStatus(cachedClasses ? "ready" : "loading")
    setErrorMessage(null)

    try {
      const nextClasses = await loadArchivedClasses(activeOrganization.id, {
        cacheKey,
        force: true,
      })
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
    if (!activeOrganization) {
      void refresh()
      return
    }

    const cacheKey = getArchivedClassesCacheKey(
      activeOrganization.id,
      authUser?.id ?? null,
    )
    const cachedClasses = readArchivedClassesCache(cacheKey)
    if (cachedClasses) {
      setClasses(cachedClasses)
      setStatus("ready")
      setErrorMessage(null)
    } else {
      setClasses([])
      setStatus("loading")
    }

    const unsubscribe = subscribeArchivedClasses(cacheKey, (nextClasses) => {
      setClasses(nextClasses)
      setStatus("ready")
      setErrorMessage(null)
    })

    void refresh()

    return unsubscribe
  }, [activeOrganization?.id, authUser?.id])

  return {
    archivedClasses: classes,
    archivedClassesStatus: status,
    archivedClassesError: errorMessage,
    refreshArchivedClasses: refresh,
  }
}

async function loadArchivedClasses(
  organizationId: string,
  { cacheKey, force = false }: { cacheKey: string; force?: boolean },
) {
  const cached = archivedClassesCache.get(cacheKey)

  if (!force && cached?.classes) {
    return cached.classes
  }

  if (cached?.request) {
    return cached.request
  }

  const request = fetchArchivedClasses(organizationId)
    .then((classes) => {
      writeArchivedClassesCache(cacheKey, classes)
      return classes
    })
    .finally(() => {
      const latestCached = archivedClassesCache.get(cacheKey)
      if (latestCached?.request === request) {
        latestCached.request = null
      }
    })

  archivedClassesCache.set(cacheKey, {
    classes: cached?.classes ?? null,
    request,
  })

  return request
}

async function fetchArchivedClasses(organizationId: string) {
  const response = await fetch(
    `/api/organizations/${encodeURIComponent(organizationId)}/class-history`,
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

  return "classes" in payload ? payload.classes : []
}

function readArchivedClassesCache(cacheKey: string) {
  return archivedClassesCache.get(cacheKey)?.classes ?? null
}

function subscribeArchivedClasses(
  cacheKey: string,
  listener: (classes: OrganizationClass[]) => void,
) {
  const listeners = archivedClassesListeners.get(cacheKey) ?? new Set()
  listeners.add(listener)
  archivedClassesListeners.set(cacheKey, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      archivedClassesListeners.delete(cacheKey)
    }
  }
}

function writeArchivedClassesCache(
  cacheKey: string,
  classes: OrganizationClass[],
) {
  const current = archivedClassesCache.get(cacheKey)
  archivedClassesCache.set(cacheKey, {
    classes,
    request: current?.request ?? null,
  })

  for (const listener of archivedClassesListeners.get(cacheKey) ?? []) {
    listener(classes)
  }
}

function getArchivedClassesCacheKey(
  organizationId: string,
  userId: string | null,
) {
  return `${organizationId}:${userId ?? "anonymous"}`
}
