"use client"

const CACHE_NAME = "eduverse-chat-media-v1"

type CachedMedia = {
  blob: Blob
  objectUrl: string
}

const objectUrlByCacheKey = new Map<string, string>()

export function getMaterialContentUrl(classId: string, materialId: string) {
  return `/api/classes/${encodeURIComponent(
    classId,
  )}/materials/${encodeURIComponent(materialId)}/content`
}

export async function loadCachedMedia(input: {
  classId: string
  materialId: string
}): Promise<CachedMedia> {
  const url = getMaterialContentUrl(input.classId, input.materialId)

  if (!("caches" in window)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(await getResponseError(response))
    const blob = await response.blob()
    return { blob, objectUrl: URL.createObjectURL(blob) }
  }

  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(url)
  const response = cached ?? (await fetch(url))

  if (!response.ok) {
    throw new Error(await getResponseError(response))
  }

  if (!cached) {
    await cache.put(url, response.clone())
  }

  const blob = await response.blob()
  const existingObjectUrl = objectUrlByCacheKey.get(url)

  if (existingObjectUrl) {
    return { blob, objectUrl: existingObjectUrl }
  }

  const objectUrl = URL.createObjectURL(blob)
  objectUrlByCacheKey.set(url, objectUrl)
  return { blob, objectUrl }
}

export async function downloadCachedMedia(input: {
  classId: string
  materialId: string
  fileName: string
}) {
  const { blob } = await loadCachedMedia(input)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = input.fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

async function getResponseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown
  } | null

  return typeof payload?.error === "string"
    ? payload.error
    : "Media is no longer available."
}
