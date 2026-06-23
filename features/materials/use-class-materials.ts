"use client"

import { useCallback, useEffect, useState } from "react"

export type ClassMaterialType = "image" | "pdf" | "video" | "slide"

export type ClassMaterial = {
  id: string
  organizationId: string
  classId: string
  uploadedByUserId: string
  title: string
  description: string
  type: ClassMaterialType
  source: "manual" | "chat"
  chatMessageId: string | null
  storageBucket: string
  storageKey: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  hasAiSummary: boolean
  aiSummaryGeneratedAt: string | null
  createdAt: string
  updatedAt: string
  thumbnailUrl?: string
}

type DownloadUrlResponse = {
  downloadUrl: string
  expiresIn: number
  disposition: "inline" | "attachment"
  fileName: string
  mimeType: string
}

type MaterialsCacheEntry = {
  materials: ClassMaterial[] | null
  request: Promise<ClassMaterial[]> | null
}

const materialsCache = new Map<string, MaterialsCacheEntry>()
const materialsListeners = new Map<
  string,
  Set<(materials: ClassMaterial[]) => void>
>()

export function useClassMaterials({
  classId,
  uploaderUserId,
}: {
  classId: string
  uploaderUserId: string | null
}) {
  const [materials, setMaterials] = useState<ClassMaterial[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const getDownloadUrl = useCallback(
    async (
      materialId: string,
      disposition: "inline" | "attachment" = "inline",
    ) => {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(
          classId,
        )}/materials/${encodeURIComponent(
          materialId,
        )}/download-url?disposition=${disposition}`,
      )
      const payload = (await response.json().catch(() => null)) as
        | Partial<DownloadUrlResponse>
        | { error?: string }
        | null

      if (
        !response.ok ||
        !payload ||
        !("downloadUrl" in payload) ||
        typeof payload.downloadUrl !== "string"
      ) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Could not create download URL.",
        )
      }

      return payload.downloadUrl
    },
    [classId],
  )

  const refreshMaterials = useCallback(async () => {
    const cachedMaterials = readMaterialsCache(classId)
    setIsLoading(!cachedMaterials)
    setErrorMessage(null)

    try {
      const nextMaterials = await loadMaterialsWithThumbnails(classId, {
        force: true,
      })

      setMaterials(nextMaterials)
      return nextMaterials
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load materials."
      setMaterials([])
      setErrorMessage(message)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [classId])

  useEffect(() => {
    let cancelled = false
    const cachedMaterials = readMaterialsCache(classId)

    if (cachedMaterials) {
      setMaterials(cachedMaterials)
      setIsLoading(false)
    } else {
      setMaterials([])
      setIsLoading(true)
    }
    setErrorMessage(null)

    const unsubscribe = subscribeMaterials(classId, (nextMaterials) => {
      if (cancelled) return
      setMaterials(nextMaterials)
      setIsLoading(false)
      setErrorMessage(null)
    })

    loadMaterialsWithThumbnails(classId, { force: true })
      .then((nextMaterials) => {
        if (cancelled) return
        setMaterials(nextMaterials)
      })
      .catch((error) => {
        if (cancelled) return
        setMaterials([])
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load materials.",
        )
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [classId])

  async function uploadMaterial(input: {
    file: File
    title: string
    description: string
  }) {
    if (!uploaderUserId) {
      throw new Error("Authentication is required to upload materials.")
    }

    const title = input.title.trim()
    if (!title) throw new Error("A title is required.")

    setIsUploading(true)
    setErrorMessage(null)

    try {
      const formData = new FormData()
      formData.set("file", input.file)
      formData.set("title", title)
      formData.set("description", input.description.trim())

      const uploadResponse = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/materials/upload`,
        {
          method: "POST",
          body: formData,
        },
      )
      const uploadPayload = (await uploadResponse.json().catch(() => null)) as {
        material?: ClassMaterial
        error?: string
      } | null

      if (!uploadResponse.ok || !uploadPayload?.material) {
        throw new Error(uploadPayload?.error ?? "Could not upload material.")
      }

      const optimisticMaterials = [
        uploadPayload.material as ClassMaterial,
        ...materials,
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      setMaterials(optimisticMaterials)
      writeMaterialsCache(classId, optimisticMaterials)

      await refreshMaterials()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not upload material."
      setErrorMessage(message)
      throw new Error(message)
    } finally {
      setIsUploading(false)
    }
  }

  async function deleteMaterial(materialId: string) {
    let removedMaterial: ClassMaterial | null = null

    setErrorMessage(null)
    removedMaterial =
      materials.find((material) => material.id === materialId) ?? null
    const nextMaterials = materials.filter(
      (material) => material.id !== materialId,
    )
    setMaterials(nextMaterials)
    writeMaterialsCache(classId, nextMaterials)

    const response = await fetch(
      `/api/classes/${encodeURIComponent(
        classId,
      )}/materials/${encodeURIComponent(materialId)}`,
      { method: "DELETE" },
    )
    const payload = (await response.json().catch(() => null)) as {
      error?: string
    } | null

    if (!response.ok) {
      const message = payload?.error ?? "Could not delete material."

      if (removedMaterial) {
        const restoredMaterials = [
          removedMaterial as ClassMaterial,
          ...nextMaterials,
        ].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        setMaterials(restoredMaterials)
        writeMaterialsCache(classId, restoredMaterials)
      }

      throw new Error(message)
    }
  }

  return {
    materials,
    isLoading,
    isUploading,
    errorMessage,
    refreshMaterials,
    uploadMaterial,
    deleteMaterial,
    getDownloadUrl,
  }
}

async function loadMaterialsWithThumbnails(
  classId: string,
  { force = false }: { force?: boolean } = {},
) {
  const cached = materialsCache.get(classId)

  if (!force && cached?.materials) {
    return cached.materials
  }

  if (cached?.request) {
    return cached.request
  }

  const request = fetchMaterialsWithThumbnails(classId)
    .then((materials) => {
      writeMaterialsCache(classId, materials)
      return materials
    })
    .finally(() => {
      const latestCached = materialsCache.get(classId)
      if (latestCached?.request === request) {
        latestCached.request = null
      }
    })

  materialsCache.set(classId, {
    materials: cached?.materials ?? null,
    request,
  })

  return request
}

function readMaterialsCache(classId: string) {
  return materialsCache.get(classId)?.materials ?? null
}

function subscribeMaterials(
  classId: string,
  listener: (materials: ClassMaterial[]) => void,
) {
  const listeners = materialsListeners.get(classId) ?? new Set()
  listeners.add(listener)
  materialsListeners.set(classId, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      materialsListeners.delete(classId)
    }
  }
}

function writeMaterialsCache(classId: string, materials: ClassMaterial[]) {
  const current = materialsCache.get(classId)
  materialsCache.set(classId, {
    materials,
    request: current?.request ?? null,
  })

  for (const listener of materialsListeners.get(classId) ?? []) {
    listener(materials)
  }
}

async function fetchMaterialsWithThumbnails(classId: string) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/materials`,
  )
  const payload = (await response.json().catch(() => null)) as {
    materials?: ClassMaterial[]
    error?: string
  } | null

  if (!response.ok || !payload?.materials) {
    throw new Error(payload?.error ?? "Could not load materials.")
  }

  return Promise.all(
    payload.materials.map(async (material) => {
      if (material.type !== "image") return material

      try {
        return {
          ...material,
          thumbnailUrl: `/api/classes/${encodeURIComponent(
            classId,
          )}/materials/${encodeURIComponent(material.id)}/content`,
        }
      } catch {
        return material
      }
    }),
  )
}
