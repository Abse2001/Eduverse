"use client"

import { useEffect, useRef, useState } from "react"
import type { JsonValue, StudentActiveExamDto } from "@/lib/exams/types"

export function useExamSession(input: {
  activeExam: StudentActiveExamDto | null
  onSaveAnswer: (questionId: string, answer: JsonValue | null) => Promise<void>
  onSubmit: () => Promise<void>
  onRecordEvent: (
    eventType: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
}) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, JsonValue | null>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExamModeBlocked, setIsExamModeBlocked] = useState(false)
  const [examModeError, setExamModeError] = useState<string | null>(null)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )
  const autoSubmitRef = useRef(false)
  const examModeEnabled = input.activeExam?.examModeEnabled === true

  useEffect(() => {
    const nextAnswers =
      input.activeExam?.questions.reduce<Record<string, JsonValue | null>>(
        (result, question) => {
          result[question.id] = question.savedAnswer ?? null
          return result
        },
        {},
      ) ?? {}

    setAnswers(nextAnswers)
    setCurrentQuestionIndex(0)
    autoSubmitRef.current = false
    setIsExamModeBlocked(false)
    setExamModeError(null)
  }, [input.activeExam])

  useEffect(() => {
    const deadlineAt = input.activeExam?.attempt?.deadlineAt ?? null
    if (!deadlineAt) {
      setTimeLeft(0)
      return
    }

    const updateTime = () => {
      setTimeLeft(getTimeLeftSeconds(deadlineAt))
    }

    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [input.activeExam?.attempt?.deadlineAt])

  useEffect(() => {
    const deadlineAt = input.activeExam?.attempt?.deadlineAt ?? null
    if (
      !input.activeExam?.attempt ||
      !deadlineAt ||
      autoSubmitRef.current ||
      isSubmitting
    ) {
      return
    }

    if (getTimeLeftSeconds(deadlineAt) > 0) {
      return
    }

    autoSubmitRef.current = true
    void submitExam()
  }, [input.activeExam?.attempt, isSubmitting, timeLeft])

  useEffect(() => {
    if (!input.activeExam?.attempt) return

    const recordEventSafely = (
      eventType: string,
      payload?: Record<string, unknown>,
    ) => {
      void input.onRecordEvent(eventType, payload).catch(() => {
        // Integrity events are best-effort and should never raise unhandled
        // promise rejections in the active exam UI.
      })
    }

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (examModeEnabled) {
          setIsExamModeBlocked(true)
        }
        recordEventSafely("visibility_hidden", {
          visibilityState: document.visibilityState,
        })
      }
    }

    const handleWindowBlur = () => {
      if (examModeEnabled) {
        setIsExamModeBlocked(true)
      }
      recordEventSafely("window_blur")
    }

    const handleFullscreen = () => {
      if (!examModeEnabled) return

      if (!document.fullscreenElement) {
        setIsExamModeBlocked(true)
        recordEventSafely("fullscreen_exit")
        return
      }

      setIsExamModeBlocked(false)
      setExamModeError(null)
    }

    if (examModeEnabled && !document.fullscreenElement) {
      setIsExamModeBlocked(true)
    }

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("blur", handleWindowBlur)
    document.addEventListener("fullscreenchange", handleFullscreen)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("blur", handleWindowBlur)
      document.removeEventListener("fullscreenchange", handleFullscreen)
    }
  }, [examModeEnabled, input.activeExam?.attempt, input.onRecordEvent])

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
      timersRef.current.clear()
    }
  }, [])

  function setAnswer(questionId: string, value: JsonValue | null) {
    setAnswers((current) => ({ ...current, [questionId]: value }))
    setSaveError(null)

    const existingTimer = timersRef.current.get(questionId)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      void saveAnswer(questionId, value)
    }, 500)

    timersRef.current.set(questionId, timer)
  }

  async function saveAnswer(questionId: string, value: JsonValue | null) {
    if (!input.activeExam?.attempt) return

    setIsSaving(true)
    try {
      await input.onSaveAnswer(questionId, value)
      timersRef.current.delete(questionId)
      setSaveError(null)
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save answer.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function submitExam() {
    if (!input.activeExam?.attempt || isSubmitting) return

    setIsSubmitting(true)
    try {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
      timersRef.current.clear()

      const pendingSaves = Object.entries(answers).map(([questionId, answer]) =>
        input.onSaveAnswer(questionId, answer),
      )

      await Promise.allSettled(pendingSaves)
      await input.onSubmit()
    } catch {
      autoSubmitRef.current = false
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resumeExamMode() {
    if (!examModeEnabled || !input.activeExam?.attempt) {
      setIsExamModeBlocked(false)
      return true
    }

    const resumed = await requestExamModeFullscreen()
    setIsExamModeBlocked(!resumed)
    setExamModeError(
      resumed
        ? null
        : "Fullscreen is required for this exam. Please allow fullscreen and try again.",
    )

    return resumed
  }

  return {
    currentQuestionIndex,
    answers,
    timeLeft,
    isSaving,
    saveError,
    isSubmitting,
    isExamModeBlocked,
    examModeError,
    setCurrentQuestionIndex,
    setAnswer,
    submitExam,
    resumeExamMode,
  }
}

async function requestExamModeFullscreen() {
  if (typeof document === "undefined") return false
  if (document.fullscreenElement) return true
  if (typeof document.documentElement.requestFullscreen !== "function") {
    return false
  }

  try {
    await document.documentElement.requestFullscreen()
    return Boolean(document.fullscreenElement)
  } catch {
    return false
  }
}

function getTimeLeftSeconds(deadlineAt: string) {
  return Math.max(0, Math.floor((Date.parse(deadlineAt) - Date.now()) / 1000))
}
