"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

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
}: {
  classId: string
  currentUserId: string | null
  canManage: boolean
}) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/assignments`,
  )
  const payload = (await response.json().catch(() => null)) as {
    assignments?: ClassAssignment[]
    error?: string
  } | null

  if (!response.ok || !payload?.assignments) {
    throw new Error(payload?.error ?? "Could not load assignments.")
  }

  return payload.assignments
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
