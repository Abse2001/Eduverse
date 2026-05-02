"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type ClassMaterialType = "image" | "pdf" | "video" | "slide"

export type ClassMaterial = {
  id: string
  organizationId: string
  classId: string
  uploadedByUserId: string
  title: string
  description: string
  type: ClassMaterialType
  storageBucket: string
  storageKey: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
  thumbnailUrl?: string
}

type ClassMaterialRow = {
  id: string
  organization_id: string
  class_id: string
  uploaded_by_user_id: string
  title: string
  description: string
  type: ClassMaterialType
  storage_bucket: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  created_at: string
  updated_at: string
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
      const nextMaterials = await loadMaterialsWithThumbnails(
        classId,
        getDownloadUrl,
      )

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
  }, [classId, getDownloadUrl])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setErrorMessage(null)

    loadMaterialsWithThumbnails(classId, getDownloadUrl)
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
  }, [classId, getDownloadUrl])

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

  return {
    materials,
    isLoading,
    isUploading,
    errorMessage,
    refreshMaterials,
    uploadMaterial,
    getDownloadUrl,
  }
}

async function loadMaterialsWithThumbnails(
  classId: string,
  getDownloadUrl: (
    materialId: string,
    disposition?: "inline" | "attachment",
  ) => Promise<string>,
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("class_materials")
    .select(
      "id, organization_id, class_id, uploaded_by_user_id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, created_at, updated_at",
    )
    .eq("class_id", classId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) throw error

  const nextMaterials = ((data ?? []) as ClassMaterialRow[]).map(toMaterial)

  return Promise.all(
    nextMaterials.map(async (material) => {
      if (material.type !== "image") return material

      try {
        return {
          ...material,
          thumbnailUrl: await getDownloadUrl(material.id, "inline"),
        }
      } catch {
        return material
      }
    }),
  )
}

function toMaterial(row: ClassMaterialRow): ClassMaterial {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    uploadedByUserId: row.uploaded_by_user_id,
    title: row.title,
    description: row.description,
    type: row.type,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
