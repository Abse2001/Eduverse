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

type UploadUrlResponse = {
  bucket: string
  storageKey: string
  uploadUrl: string
  expiresIn: number
  type: ClassMaterialType
  fileName: string
  mimeType: string
  sizeBytes: number
  method: "PUT"
  headers: Record<string, string>
  organizationId: string
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

      if (!response.ok || !payload || !("downloadUrl" in payload)) {
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
    const supabase = createClient()
    setIsLoading(true)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from("class_materials")
      .select(
        "id, organization_id, class_id, uploaded_by_user_id, title, description, type, storage_bucket, storage_key, original_filename, mime_type, size_bytes, created_at, updated_at",
      )
      .eq("class_id", classId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (error) {
      setMaterials([])
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    const nextMaterials = ((data ?? []) as ClassMaterialRow[]).map(toMaterial)
    const withThumbnails = await Promise.all(
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

    setMaterials(withThumbnails)
    setIsLoading(false)
  }, [classId, getDownloadUrl])

  useEffect(() => {
    let cancelled = false

    refreshMaterials().finally(() => {
      if (cancelled) return
    })

    return () => {
      cancelled = true
    }
  }, [refreshMaterials])

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
      const uploadUrlResponse = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/materials/upload-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: input.file.name,
            mimeType: input.file.type,
            sizeBytes: input.file.size,
          }),
        },
      )
      const uploadPayload = (await uploadUrlResponse
        .json()
        .catch(() => null)) as Partial<UploadUrlResponse> & { error?: string }

      if (
        !uploadUrlResponse.ok ||
        !uploadPayload.uploadUrl ||
        !uploadPayload.bucket ||
        !uploadPayload.storageKey ||
        !uploadPayload.type ||
        !uploadPayload.organizationId
      ) {
        throw new Error(uploadPayload.error ?? "Could not prepare upload.")
      }

      const s3Response = await fetch(uploadPayload.uploadUrl, {
        method: uploadPayload.method ?? "PUT",
        headers: uploadPayload.headers ?? {
          "Content-Type": input.file.type,
        },
        body: input.file,
      })

      if (!s3Response.ok) {
        throw new Error("Upload to storage failed.")
      }

      const supabase = createClient()
      const { error } = await supabase.from("class_materials").insert({
        organization_id: uploadPayload.organizationId,
        class_id: classId,
        uploaded_by_user_id: uploaderUserId,
        title,
        description: input.description.trim(),
        type: uploadPayload.type,
        storage_bucket: uploadPayload.bucket,
        storage_key: uploadPayload.storageKey,
        original_filename: input.file.name,
        mime_type: input.file.type,
        size_bytes: input.file.size,
      })

      if (error) throw error

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
