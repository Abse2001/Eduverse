import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export type MaterialFileType = "image" | "pdf" | "video" | "slide"

const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 5 * 60

const MAX_UPLOAD_BYTES: Record<MaterialFileType, number> = {
  image: 25 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  slide: 50 * 1024 * 1024,
  video: 500 * 1024 * 1024,
}

let s3Client: S3Client | null = null

export function getMaterialType(
  fileName: string,
  mimeType: string,
): MaterialFileType | null {
  const normalizedMime = mimeType.toLowerCase()
  const extension = getFileExtension(fileName)

  if (normalizedMime.startsWith("image/")) return "image"
  if (normalizedMime === "application/pdf") return "pdf"
  if (normalizedMime.startsWith("video/")) return "video"
  if (
    [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.presentation",
      "application/x-iwork-keynote-sffkey",
    ].includes(normalizedMime) ||
    ["ppt", "pptx", "odp", "key"].includes(extension)
  ) {
    return "slide"
  }

  return null
}

export function validateMaterialUpload(input: {
  fileName: string
  mimeType: string
  sizeBytes: number
}) {
  const fileName = input.fileName.trim()
  const mimeType = input.mimeType.trim()
  const sizeBytes = input.sizeBytes
  const type = getMaterialType(fileName, mimeType)

  if (!fileName) return { error: "A file name is required." }
  if (!mimeType) return { error: "A MIME type is required." }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { error: "A valid file size is required." }
  }
  if (!type) {
    return { error: "Only images, PDFs, videos, and slides can be uploaded." }
  }
  if (sizeBytes > MAX_UPLOAD_BYTES[type]) {
    return {
      error: `${formatMaterialType(type)} files must be ${formatBytes(
        MAX_UPLOAD_BYTES[type],
      )} or smaller.`,
    }
  }

  return {
    fileName,
    mimeType,
    sizeBytes,
    type,
  }
}

export async function uploadMaterialObject(input: {
  organizationId: string
  classId: string
  fileName: string
  mimeType: string
  body: Uint8Array
}) {
  const bucket = getS3Bucket()
  const storageKey = buildStorageKey({
    organizationId: input.organizationId,
    classId: input.classId,
    fileName: input.fileName,
  })
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    Body: input.body,
    ContentType: input.mimeType,
  })

  await getS3Client().send(command)

  return {
    bucket,
    storageKey,
  }
}

export async function deleteMaterialObject(input: {
  bucket: string
  storageKey: string
}) {
  const command = new DeleteObjectCommand({
    Bucket: input.bucket,
    Key: input.storageKey,
  })

  await getS3Client().send(command)
}

export async function createMaterialDownloadUrl(input: {
  bucket: string
  storageKey: string
  fileName: string
  mimeType: string
  disposition: "inline" | "attachment"
}) {
  const command = new GetObjectCommand({
    Bucket: input.bucket,
    Key: input.storageKey,
    ResponseContentType: input.mimeType,
    ResponseContentDisposition: formatContentDisposition(
      input.disposition,
      input.fileName,
    ),
  })
  const downloadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: DOWNLOAD_URL_EXPIRES_IN_SECONDS,
  })

  return {
    downloadUrl,
    expiresIn: DOWNLOAD_URL_EXPIRES_IN_SECONDS,
  }
}

function getS3Client() {
  if (s3Client) return s3Client

  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS env vars are missing. Set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.",
    )
  }

  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  return s3Client
}

function getS3Bucket() {
  const bucket = process.env.AWS_S3_BUCKET

  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is missing.")
  }

  return bucket
}

function buildStorageKey(input: {
  organizationId: string
  classId: string
  fileName: string
}) {
  const extension = getFileExtension(input.fileName)
  const safeName = sanitizeFileName(input.fileName)
  const id = crypto.randomUUID()

  return [
    "class-materials",
    input.organizationId,
    input.classId,
    extension ? `${id}-${safeName}` : id,
  ].join("/")
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")

  return normalized || "material"
}

function getFileExtension(fileName: string) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName.trim())
  return match?.[1]?.toLowerCase() ?? ""
}

function formatContentDisposition(
  disposition: "inline" | "attachment",
  fileName: string,
) {
  const asciiFileName = sanitizeFileName(fileName).replace(/"/g, "")

  return `${disposition}; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`
}

function formatMaterialType(type: MaterialFileType) {
  return type === "pdf" ? "PDF" : `${type[0].toUpperCase()}${type.slice(1)}`
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"]
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exp

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exp]}`
}
