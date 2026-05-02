import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 5 * 60
const MAX_ASSIGNMENT_FILE_BYTES = 100 * 1024 * 1024

let s3Client: S3Client | null = null

export function validateAssignmentFileUpload(input: {
  fileName: string
  mimeType: string
  sizeBytes: number
}) {
  const fileName = input.fileName.trim()
  const mimeType = input.mimeType.trim() || "application/octet-stream"
  const sizeBytes = input.sizeBytes

  if (!fileName) return { error: "A file name is required." }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { error: "A valid file size is required." }
  }
  if (sizeBytes > MAX_ASSIGNMENT_FILE_BYTES) {
    return {
      error: `Assignment files must be ${formatBytes(
        MAX_ASSIGNMENT_FILE_BYTES,
      )} or smaller.`,
    }
  }

  return {
    fileName,
    mimeType,
    sizeBytes,
  }
}

export async function uploadAssignmentObject(input: {
  organizationId: string
  classId: string
  assignmentId: string
  fileName: string
  mimeType: string
  body: Uint8Array
  kind: "prompt" | "submission"
}) {
  const bucket = getS3Bucket()
  const storageKey = buildStorageKey(input)
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

export async function deleteAssignmentObject(input: {
  bucket: string
  storageKey: string
}) {
  const command = new DeleteObjectCommand({
    Bucket: input.bucket,
    Key: input.storageKey,
  })

  await getS3Client().send(command)
}

export async function createAssignmentDownloadUrl(input: {
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
  assignmentId: string
  fileName: string
  kind: "prompt" | "submission"
}) {
  const extension = getFileExtension(input.fileName)
  const safeName = sanitizeFileName(input.fileName)
  const id = crypto.randomUUID()

  return [
    "class-materials",
    input.organizationId,
    input.classId,
    "assignments",
    input.assignmentId,
    input.kind,
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

  return normalized || "assignment-file"
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

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"]
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exp

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exp]}`
}
