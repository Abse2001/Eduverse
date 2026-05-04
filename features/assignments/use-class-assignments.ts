"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type ClassAssignment = {
  id: string
  organizationId: string
  classId: string
  createdByUserId: string
  title: string
  description: string
  dueAt: string
  maxScore: number
  status: "draft" | "published"
  allowLateSubmissions: boolean
  allowTextSubmission: boolean
  allowFileSubmission: boolean
  createdAt: string
  updatedAt: string
  files: ClassAssignmentFile[]
  submissions: ClassAssignmentSubmission[]
  mySubmission: ClassAssignmentSubmission | null
}

export type ClassAssignmentFile = {
  id: string
  organizationId: string
  classId: string
  assignmentId: string
  uploadedByUserId: string
  storageBucket: string
  storageKey: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export type ClassAssignmentSubmission = {
  id: string
  organizationId: string
  classId: string
  assignmentId: string
  studentUserId: string
  textResponse: string | null
  fileStorageBucket: string | null
  fileStorageKey: string | null
  fileOriginalFilename: string | null
  fileMimeType: string | null
  fileSizeBytes: number | null
  submittedAt: string
  isLate: boolean
  score: number | null
  feedback: string
  gradedAt: string | null
  gradedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export type AssignmentDerivedStatus =
  | "draft"
  | "pending"
  | "submitted"
  | "graded"
  | "overdue"

type AssignmentRow = {
  id: string
  organization_id: string
  class_id: string
  created_by_user_id: string
  title: string
  description: string
  due_at: string
  max_score: number
  status: "draft" | "published"
  allow_late_submissions: boolean
  allow_text_submission: boolean
  allow_file_submission: boolean
  created_at: string
  updated_at: string
}

type AssignmentFileRow = {
  id: string
  organization_id: string
  class_id: string
  assignment_id: string
  uploaded_by_user_id: string
  storage_bucket: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  created_at: string
}

type SubmissionRow = {
  id: string
  organization_id: string
  class_id: string
  assignment_id: string
  student_user_id: string
  text_response: string | null
  file_storage_bucket: string | null
  file_storage_key: string | null
  file_original_filename: string | null
  file_mime_type: string | null
  file_size_bytes: number | null
  submitted_at: string
  is_late: boolean
  score: number | null
  feedback: string
  graded_at: string | null
  graded_by_user_id: string | null
  created_at: string
  updated_at: string
}

type DownloadUrlResponse = {
  downloadUrl: string
}

export function useClassAssignments({
  classId,
  currentUserId,
  canManage,
}: {
  classId: string
  currentUserId: string | null
  canManage: boolean
}) {
  const [assignments, setAssignments] = useState<ClassAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refreshAssignments = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const nextAssignments = await loadClassAssignments({
        classId,
        currentUserId,
        canManage,
      })
      setAssignments(nextAssignments)
      return nextAssignments
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load assignments."
      setAssignments([])
      setErrorMessage(message)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [canManage, classId, currentUserId])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setErrorMessage(null)

    loadClassAssignments({ classId, currentUserId, canManage })
      .then((nextAssignments) => {
        if (cancelled) return
        setAssignments(nextAssignments)
      })
      .catch((error) => {
        if (cancelled) return
        setAssignments([])
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load assignments.",
        )
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canManage, classId, currentUserId])

  const counts = useMemo(() => {
    const now = Date.now()

    return assignments.reduce(
      (next, assignment) => {
        const status = getAssignmentDerivedStatus(assignment, now)
        next[status] += 1
        return next
      },
      {
        draft: 0,
        pending: 0,
        submitted: 0,
        graded: 0,
        overdue: 0,
      } satisfies Record<AssignmentDerivedStatus, number>,
    )
  }, [assignments])

  async function createAssignment(input: {
    title: string
    description: string
    dueAt: string
    maxScore: number
    status: "draft" | "published"
    allowLateSubmissions: boolean
    allowTextSubmission: boolean
    allowFileSubmission: boolean
    files: File[]
  }) {
    return mutate(async () => {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        assignment?: ClassAssignment
        error?: string
      } | null

      if (!response.ok || !payload?.assignment) {
        throw new Error(payload?.error ?? "Could not create assignment.")
      }

      for (const file of input.files) {
        await uploadAssignmentFile(payload.assignment.id, file)
      }

      return refreshAssignments()
    })
  }

  async function updateAssignment(
    assignmentId: string,
    input: Partial<{
      title: string
      description: string
      dueAt: string
      maxScore: number
      status: "draft" | "published"
      allowLateSubmissions: boolean
      allowTextSubmission: boolean
      allowFileSubmission: boolean
    }>,
  ) {
    return mutate(async () => {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(
          classId,
        )}/assignments/${encodeURIComponent(assignmentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not update assignment.")
      }

      return refreshAssignments()
    })
  }

  async function deleteAssignment(assignmentId: string) {
    return mutate(async () => {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(
          classId,
        )}/assignments/${encodeURIComponent(assignmentId)}`,
        { method: "DELETE" },
      )
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not delete assignment.")
      }

      return refreshAssignments()
    })
  }

  async function uploadAssignmentFile(assignmentId: string, file: File) {
    const formData = new FormData()
    formData.set("file", file)

    const response = await fetch(
      `/api/classes/${encodeURIComponent(
        classId,
      )}/assignments/${encodeURIComponent(assignmentId)}/files`,
      { method: "POST", body: formData },
    )
    const payload = (await response.json().catch(() => null)) as {
      error?: string
    } | null

    if (!response.ok) {
      throw new Error(payload?.error ?? "Could not upload assignment file.")
    }
  }

  async function submitAssignment(input: {
    assignmentId: string
    textResponse: string
    file: File | null
  }) {
    return mutate(async () => {
      const formData = new FormData()
      formData.set("textResponse", input.textResponse)
      if (input.file) formData.set("file", input.file)

      const response = await fetch(
        `/api/classes/${encodeURIComponent(
          classId,
        )}/assignments/${encodeURIComponent(input.assignmentId)}/submission`,
        { method: "POST", body: formData },
      )
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not submit assignment.")
      }

      return refreshAssignments()
    })
  }

  async function gradeSubmission(input: {
    assignmentId: string
    submissionId: string
    score: number
    feedback: string
  }) {
    return mutate(async () => {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(
          classId,
        )}/assignments/${encodeURIComponent(
          input.assignmentId,
        )}/submissions/${encodeURIComponent(input.submissionId)}/grade`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            score: input.score,
            feedback: input.feedback,
          }),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save grade.")
      }

      return refreshAssignments()
    })
  }

  async function getAssignmentFileUrl(
    assignmentId: string,
    fileId: string,
    disposition: "inline" | "attachment" = "attachment",
  ) {
    const response = await fetch(
      `/api/classes/${encodeURIComponent(
        classId,
      )}/assignments/${encodeURIComponent(
        assignmentId,
      )}/files/${encodeURIComponent(fileId)}/download-url?disposition=${disposition}`,
    )
    return parseDownloadUrl(response)
  }

  async function getSubmissionFileUrl(
    assignmentId: string,
    submissionId: string,
    disposition: "inline" | "attachment" = "attachment",
  ) {
    const response = await fetch(
      `/api/classes/${encodeURIComponent(
        classId,
      )}/assignments/${encodeURIComponent(
        assignmentId,
      )}/submissions/${encodeURIComponent(
        submissionId,
      )}/file/download-url?disposition=${disposition}`,
    )
    return parseDownloadUrl(response)
  }

  async function mutate<T>(callback: () => Promise<T>) {
    setIsMutating(true)
    setErrorMessage(null)

    try {
      return await callback()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Assignment action failed."
      setErrorMessage(message)
      throw new Error(message)
    } finally {
      setIsMutating(false)
    }
  }

  return {
    assignments,
    counts,
    isLoading,
    isMutating,
    errorMessage,
    refreshAssignments,
    createAssignment,
    updateAssignment,
    deleteAssignment,
    uploadAssignmentFile,
    submitAssignment,
    gradeSubmission,
    getAssignmentFileUrl,
    getSubmissionFileUrl,
  }
}

export function getAssignmentDerivedStatus(
  assignment: ClassAssignment,
  now = Date.now(),
): AssignmentDerivedStatus {
  if (assignment.status === "draft") return "draft"
  if (assignment.mySubmission?.gradedAt) return "graded"
  if (assignment.mySubmission) return "submitted"
  if (Date.parse(assignment.dueAt) < now) return "overdue"
  return "pending"
}

export async function loadClassAssignments({
  classId,
  currentUserId,
  canManage,
}: {
  classId: string
  currentUserId: string | null
  canManage: boolean
}) {
  const supabase = createClient()
  let assignmentQuery = supabase
    .from("class_assignments")
    .select(
      "id, organization_id, class_id, created_by_user_id, title, description, due_at, max_score, status, allow_late_submissions, allow_text_submission, allow_file_submission, created_at, updated_at",
    )
    .eq("class_id", classId)
    .is("deleted_at", null)

  if (!canManage) {
    assignmentQuery = assignmentQuery.eq("status", "published")
  }

  const { data: assignmentData, error: assignmentError } =
    await assignmentQuery.order("due_at", { ascending: true })

  if (assignmentError) throw assignmentError

  const assignmentRows = (assignmentData ?? []) as AssignmentRow[]
  const assignmentIds = assignmentRows.map((assignment) => assignment.id)

  if (assignmentIds.length === 0) return []

  const { data: fileData, error: fileError } = await supabase
    .from("class_assignment_files")
    .select(
      "id, organization_id, class_id, assignment_id, uploaded_by_user_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, created_at",
    )
    .in("assignment_id", assignmentIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })

  if (fileError) throw fileError

  let submissionQuery = supabase
    .from("class_assignment_submissions")
    .select(
      "id, organization_id, class_id, assignment_id, student_user_id, text_response, file_storage_bucket, file_storage_key, file_original_filename, file_mime_type, file_size_bytes, submitted_at, is_late, score, feedback, graded_at, graded_by_user_id, created_at, updated_at",
    )
    .in("assignment_id", assignmentIds)
    .order("submitted_at", { ascending: false })

  if (!canManage && currentUserId) {
    submissionQuery = submissionQuery.eq("student_user_id", currentUserId)
  }

  const { data: submissionData, error: submissionError } = await submissionQuery

  if (submissionError) throw submissionError

  const filesByAssignment = groupByAssignment(
    ((fileData ?? []) as AssignmentFileRow[]).map(toAssignmentFile),
  )
  const submissions = ((submissionData ?? []) as SubmissionRow[]).map(
    toSubmission,
  )
  const submissionsByAssignment = groupByAssignment(submissions)

  return assignmentRows.map((row) => {
    const assignmentSubmissions = submissionsByAssignment.get(row.id) ?? []

    return {
      ...toAssignment(row),
      files: filesByAssignment.get(row.id) ?? [],
      submissions: assignmentSubmissions,
      mySubmission:
        assignmentSubmissions.find(
          (submission) => submission.studentUserId === currentUserId,
        ) ?? null,
    }
  })
}

async function parseDownloadUrl(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | (Partial<DownloadUrlResponse> & { error?: string })
    | null

  if (!response.ok || !payload?.downloadUrl) {
    throw new Error(payload?.error ?? "Could not create download URL.")
  }

  return payload.downloadUrl
}

function groupByAssignment<T extends { assignmentId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>()

  for (const item of items) {
    const existing = grouped.get(item.assignmentId) ?? []
    existing.push(item)
    grouped.set(item.assignmentId, existing)
  }

  return grouped
}

function toAssignment(
  row: AssignmentRow,
): Omit<ClassAssignment, "files" | "submissions" | "mySubmission"> {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    createdByUserId: row.created_by_user_id,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    maxScore: Number(row.max_score),
    status: row.status,
    allowLateSubmissions: row.allow_late_submissions,
    allowTextSubmission: row.allow_text_submission,
    allowFileSubmission: row.allow_file_submission,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toAssignmentFile(row: AssignmentFileRow): ClassAssignmentFile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    assignmentId: row.assignment_id,
    uploadedByUserId: row.uploaded_by_user_id,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }
}

function toSubmission(row: SubmissionRow): ClassAssignmentSubmission {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    assignmentId: row.assignment_id,
    studentUserId: row.student_user_id,
    textResponse: row.text_response,
    fileStorageBucket: row.file_storage_bucket,
    fileStorageKey: row.file_storage_key,
    fileOriginalFilename: row.file_original_filename,
    fileMimeType: row.file_mime_type,
    fileSizeBytes: row.file_size_bytes,
    submittedAt: row.submitted_at,
    isLate: row.is_late,
    score: row.score === null ? null : Number(row.score),
    feedback: row.feedback,
    gradedAt: row.graded_at,
    gradedByUserId: row.graded_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
