"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import type { ClassExamApiDto } from "@/lib/exams/types"

type ExamLockState = {
  classId: string
  examId: string
  attemptId: string
  examTitle: string
  examRoute: string
}

type ExamLockContextValue = {
  lock: ExamLockState | null
  isLocked: boolean
  setExamLock: (lock: ExamLockState | null) => void
  canNavigateToPath: (path: string) => boolean
}

const STORAGE_KEY = "eduverse.exam-lock"

const ExamLockContext = createContext<ExamLockContextValue | null>(null)

export function ExamLockProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [lock, setLockState] = useState<ExamLockState | null>(null)
  const [isLockConfirmed, setIsLockConfirmed] = useState(false)
  const lastLeavePathRef = useRef<string | null>(null)

  const setExamLock = useCallback((nextLock: ExamLockState | null) => {
    setLockState(nextLock)
    setIsLockConfirmed(Boolean(nextLock))

    if (typeof window === "undefined") return

    if (!nextLock) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextLock))
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return

    try {
      setLockState(JSON.parse(raw) as ExamLockState)
      setIsLockConfirmed(false)
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    const classIdToCheck = lock?.classId ?? extractClassId(pathname)
    if (!classIdToCheck) return
    const nextClassId = classIdToCheck

    let cancelled = false

    async function syncLockFromServer() {
      try {
        const response = await fetch(
          `/api/classes/${encodeURIComponent(nextClassId)}/exams`,
        )
        const payload = (await response.json().catch(() => null)) as
          | (ClassExamApiDto & { error?: string })
          | { error?: string }
          | null

        if (
          cancelled ||
          !response.ok ||
          !payload ||
          "error" in payload ||
          !isClassExamApiPayload(payload)
        ) {
          return
        }

        if (payload.canManage) {
          if (lock?.classId === nextClassId) {
            setLockState(null)
            setIsLockConfirmed(false)
            if (typeof window !== "undefined") {
              window.sessionStorage.removeItem(STORAGE_KEY)
            }
          }
          return
        }

        const activeExam = payload.student.activeExam
        const nextLock =
          activeExam?.attempt === null || activeExam?.attempt === undefined
            ? null
            : {
                classId: activeExam.classId,
                examId: activeExam.id,
                attemptId: activeExam.attempt.id,
                examTitle: activeExam.title,
                examRoute: `/classes/${activeExam.classId}/exam`,
              }

        setLockState(nextLock)
        setIsLockConfirmed(Boolean(nextLock))

        if (typeof window === "undefined") return

        if (!nextLock) {
          window.sessionStorage.removeItem(STORAGE_KEY)
          return
        }

        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextLock))
      } catch {}
    }

    void syncLockFromServer()

    return () => {
      cancelled = true
    }
  }, [lock?.classId, pathname])

  useEffect(() => {
    if (!lock || !isLockConfirmed) return
    if (isPathAllowedUnderExamLock(pathname, lock)) {
      lastLeavePathRef.current = null
      return
    }

    if (lastLeavePathRef.current !== pathname) {
      lastLeavePathRef.current = pathname
      void recordRouteLeaveAttempt(lock, pathname)
    }

    router.replace(lock.examRoute)
  }, [isLockConfirmed, lock, pathname, router])

  const value = useMemo<ExamLockContextValue>(
    () => ({
      lock,
      isLocked: Boolean(lock && isLockConfirmed),
      setExamLock,
      canNavigateToPath: (path: string) =>
        !lock || !isLockConfirmed || isPathAllowedUnderExamLock(path, lock),
    }),
    [isLockConfirmed, lock, setExamLock],
  )

  return (
    <ExamLockContext.Provider value={value}>
      {children}
    </ExamLockContext.Provider>
  )
}

export function useExamLock() {
  const context = useContext(ExamLockContext)
  if (!context) {
    throw new Error("useExamLock must be used within an ExamLockProvider.")
  }

  return context
}

function extractClassId(pathname: string) {
  const match = pathname.match(/^\/classes\/([^/]+)/)
  return match?.[1] ?? null
}

function isClassExamApiPayload(value: unknown): value is ClassExamApiDto {
  return (
    typeof value === "object" &&
    value !== null &&
    "canManage" in value &&
    typeof value.canManage === "boolean"
  )
}

export function isPathAllowedUnderExamLock(
  pathname: string,
  lock: Pick<ExamLockState, "examRoute">,
) {
  return (
    pathname === lock.examRoute || pathname.startsWith(`${lock.examRoute}/`)
  )
}

async function recordRouteLeaveAttempt(
  lock: ExamLockState,
  attemptedPath: string,
) {
  try {
    await fetch(
      `/api/classes/${encodeURIComponent(
        lock.classId,
      )}/exams/${encodeURIComponent(lock.examId)}/attempts/${encodeURIComponent(
        lock.attemptId,
      )}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "route_leave_attempt",
          payload: {
            attemptedPath,
          },
        }),
      },
    )
  } catch {}
}
