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
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const nextMaterials = await loadMaterialsWithThumbnails(classId)

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
    setIsLoading(true)
    setErrorMessage(null)

    loadMaterialsWithThumbnails(classId)
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

      setMaterials((prev) => {
        const next = [uploadPayload.material as ClassMaterial, ...prev]
        return next.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
      })

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
      throw new Error(payload?.error ?? "Could not delete material.")
    }

    setMaterials((prev) =>
      prev.filter((material) => material.id !== materialId),
    )
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

async function loadMaterialsWithThumbnails(classId: string) {
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
