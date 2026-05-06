"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ClassExamApiDto,
  GradeAttemptInput,
  IntegrityEventInput,
  IntegrityActionInput,
  ManagerExamDetailDto,
  StartAttemptInput,
  StudentActiveExamDto,
  UpsertExamInput,
} from "@/lib/exams/types"

export function useClassExam(
  classId: string,
  options?: {
    enabled?: boolean
  },
) {
  const enabled = options?.enabled ?? true
  const [data, setData] = useState<ClassExamApiDto | null>(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const dataRef = useRef<ClassExamApiDto | null>(null)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const refresh = useCallback(
    async (options?: { background?: boolean }) => {
      if (!enabled) {
        setData(null)
        setErrorMessage(null)
        setIsLoading(false)
        setIsRefreshing(false)
        return null
      }

      const shouldRefreshInBackground =
        options?.background === true || dataRef.current !== null

      if (shouldRefreshInBackground) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
      setErrorMessage(null)

      try {
        const response = await requestExamApi({
          url: `/api/classes/${encodeURIComponent(classId)}/exams`,
          fallbackMessage: "Could not load exams.",
          retryCount: 1,
        })
        const payload = (await response.json().catch(() => null)) as
          | (ClassExamApiDto & { error?: string })
          | { error?: string }
          | null

        if (!response.ok || !payload || "error" in payload) {
          throw new Error(payload?.error ?? "Could not load exams.")
        }

        setData(payload as ClassExamApiDto)
        return payload
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not load exams."
        if (!shouldRefreshInBackground) {
          setData(null)
        }
        setErrorMessage(message)
        throw new Error(message)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [classId, enabled],
  )

  useEffect(() => {
    if (!enabled) {
      setData(null)
      setErrorMessage(null)
      setIsLoading(false)
      return
    }

    refresh().catch(() => {})
  }, [enabled, refresh])

  async function createExam(body: UpsertExamInput) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(classId)}/exams`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        fallbackMessage: "Could not create exam.",
      })
      await parseActionResponse(response, "Could not create exam.")
      await refresh({ background: true })
    })
  }

  async function updateExam(examId: string, body: UpsertExamInput) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(classId)}/exams/${encodeURIComponent(examId)}`,
        init: {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        fallbackMessage: "Could not update exam.",
      })
      await parseActionResponse(response, "Could not update exam.")
      await refresh({ background: true })
    })
  }

  async function publishExam(examId: string) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(
          classId,
        )}/exams/${encodeURIComponent(examId)}/publish`,
        init: { method: "POST" },
        fallbackMessage: "Could not publish exam.",
      })
      await parseActionResponse(response, "Could not publish exam.")
      await refresh({ background: true })
    })
  }

  async function deleteExam(examId: string) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(classId)}/exams/${encodeURIComponent(examId)}`,
        init: {
          method: "DELETE",
        },
        fallbackMessage: "Could not delete exam.",
      })
      await parseActionResponse(response, "Could not delete exam.")
      await refresh({ background: true })
    })
  }

  async function grantRetake(examId: string, attemptId: string) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(
          classId,
        )}/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(
          attemptId,
        )}/retake`,
        init: { method: "POST" },
        fallbackMessage: "Could not grant retake.",
      })
      await parseActionResponse(response, "Could not grant retake.")
      await refresh({ background: true })
    })
  }

  async function getExamDetail(examId: string) {
    let lastError = "Could not load exam detail."

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const directResult = await fetchExamDetail(
        `/api/classes/${encodeURIComponent(classId)}/exams/${encodeURIComponent(examId)}`,
      )
      if (directResult.exam) {
        return directResult.exam
      }

      lastError = directResult.error

      const shouldUseFallbackRoute =
        directResult.status === 404 || directResult.exam === null

      if (shouldUseFallbackRoute) {
        const fallbackResult = await fetchExamDetail(
          `/api/classes/${encodeURIComponent(classId)}/exams?detailExamId=${encodeURIComponent(examId)}`,
        )

        if (fallbackResult.exam) {
          return fallbackResult.exam
        }

        lastError = fallbackResult.error
      }

      if (attempt === 0) {
        await wait(250)
      }
    }

    throw new Error(lastError)
  }

  async function startExam(examId: string, body: StartAttemptInput) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(
          classId,
        )}/exams/${encodeURIComponent(examId)}/attempts`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        fallbackMessage: "Could not start exam.",
      })
      const payload = (await response.json().catch(() => null)) as {
        activeExam?: StudentActiveExamDto
        error?: string
      } | null

      if (!response.ok || !payload?.activeExam) {
        throw new Error(payload?.error ?? "Could not start exam.")
      }

      await refresh({ background: true })
      return payload.activeExam
    })
  }

  async function saveAnswer(input: {
    examId: string
    attemptId: string
    questionId: string
    answer: unknown
  }) {
    const response = await requestExamApi({
      url: `/api/classes/${encodeURIComponent(
        classId,
      )}/exams/${encodeURIComponent(input.examId)}/attempts/${encodeURIComponent(
        input.attemptId,
      )}/answers`,
      init: {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: input.questionId,
          answer: input.answer,
        }),
      },
      fallbackMessage: "Could not save answer.",
    })

    await parseActionResponse(response, "Could not save answer.")
  }

  async function submitExam(examId: string, attemptId: string) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(
          classId,
        )}/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(
          attemptId,
        )}/submit`,
        init: { method: "POST" },
        fallbackMessage: "Could not submit exam.",
      })
      await parseActionResponse(response, "Could not submit exam.")

      await refresh({ background: true })
    })
  }

  async function gradeAttempt(
    examId: string,
    attemptId: string,
    body: GradeAttemptInput,
  ) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(
          classId,
        )}/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(
          attemptId,
        )}/grade`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        fallbackMessage: "Could not save grade.",
      })
      await parseActionResponse(response, "Could not save grade.")
      await refresh({ background: true })
    })
  }

  async function releaseAttempt(examId: string, attemptId: string) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(
          classId,
        )}/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(
          attemptId,
        )}/release`,
        init: { method: "POST" },
        fallbackMessage: "Could not release results.",
      })
      await parseActionResponse(response, "Could not release results.")
      await refresh({ background: true })
    })
  }

  async function updateIntegrity(
    examId: string,
    attemptId: string,
    body: IntegrityActionInput,
  ) {
    return mutate(async () => {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(
          classId,
        )}/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(
          attemptId,
        )}/integrity`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        fallbackMessage: "Could not update integrity state.",
      })
      await parseActionResponse(response, "Could not update integrity state.")
      await refresh({ background: true })
    })
  }

  async function recordEvent(
    examId: string,
    attemptId: string,
    body: IntegrityEventInput,
  ) {
    try {
      const response = await requestExamApi({
        url: `/api/classes/${encodeURIComponent(
          classId,
        )}/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(
          attemptId,
        )}/events`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        },
        fallbackMessage: "Could not record integrity event.",
        retryCount: 0,
      })

      await parseActionResponse(response, "Could not record integrity event.")
    } catch {
      // Integrity logging is best-effort in the browser lifecycle and should
      // never crash the active exam session.
    }
  }

  async function mutate<T>(callback: () => Promise<T>) {
    setIsMutating(true)
    setErrorMessage(null)

    try {
      return await callback()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Exam action failed."
      setErrorMessage(message)
      throw new Error(message)
    } finally {
      setIsMutating(false)
    }
  }

  return {
    data,
    isLoading,
    isRefreshing,
    isMutating,
    errorMessage,
    refresh,
    createExam,
    updateExam,
    publishExam,
    deleteExam,
    grantRetake,
    getExamDetail,
    startExam,
    saveAnswer,
    submitExam,
    gradeAttempt,
    releaseAttempt,
    updateIntegrity,
    recordEvent,
  }
}

export type UseClassExamResult = ReturnType<typeof useClassExam>

async function parseActionResponse(
  response: Response,
  fallbackMessage: string,
) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string
  } | null

  if (!response.ok) {
    throw new Error(payload?.error ?? fallbackMessage)
  }

  return payload
}

function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

async function fetchExamDetail(url: string) {
  try {
    const response = await requestExamApi({
      url,
      fallbackMessage: "Could not load exam detail.",
      retryCount: 1,
    })
    const payload = (await response.json().catch(() => null)) as {
      exam?: ManagerExamDetailDto
      error?: string
    } | null

    if (response.ok && payload?.exam) {
      return {
        exam: payload.exam,
        error: null,
        status: response.status,
      }
    }

    return {
      exam: null,
      error:
        payload?.error ??
        (response.status
          ? `Could not load exam detail (${response.status}).`
          : "Could not load exam detail."),
      status: response.status,
    }
  } catch (error) {
    return {
      exam: null,
      error:
        error instanceof Error ? error.message : "Could not load exam detail.",
      status: 0,
    }
  }
}

const EXAM_REQUEST_RETRY_DELAY_MS = 250

async function requestExamApi(input: {
  url: string
  init?: RequestInit
  fallbackMessage: string
  retryCount?: number
}) {
  const retryCount = input.retryCount ?? 1
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await fetch(input.url, input.init)
    } catch (error) {
      lastError = error

      if (!isRetryableExamRequestError(error) || attempt >= retryCount) {
        throw toExamRequestError(error, input.fallbackMessage)
      }

      await wait(EXAM_REQUEST_RETRY_DELAY_MS * (attempt + 1))
    }
  }

  throw toExamRequestError(lastError, input.fallbackMessage)
}

function isRetryableExamRequestError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return error.name === "AbortError" || message.includes("fetch failed")
}

function toExamRequestError(error: unknown, fallbackMessage: string) {
  if (!(error instanceof Error)) {
    return new Error(fallbackMessage)
  }

  if (
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("fetch failed")
  ) {
    return new Error(fallbackMessage)
  }

  return error
}
