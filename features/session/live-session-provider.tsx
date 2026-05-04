"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ConnectionState } from "livekit-client"
import { Phone, Radio, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Class } from "@/lib/mock-data"
import { useApp } from "@/lib/store"
import type { LiveSessionState } from "./live-session-types"
import { useLiveSession } from "./use-live-session"

type LiveSessionContextValue = {
  activeClass: Class | null
  hasJoinedSession: boolean
  sessionActive: boolean
  liveSession: LiveSessionState
  joinSession: (cls: Class) => void
  leaveSession: () => void
  endSession: () => Promise<void>
}

const LiveSessionContext = createContext<LiveSessionContextValue | null>(null)

function getRoomName(classId: string) {
  return `class-${classId}`
}

async function syncClassLiveSession({
  classId,
  method,
}: {
  classId: string
  method: "POST" | "PATCH" | "DELETE"
}) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/live-session`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roomName: getRoomName(classId) }),
    },
  )

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string
    } | null

    throw new Error(payload?.error ?? "Could not update live session.")
  }
}

export function LiveSessionProvider({ children }: { children: ReactNode }) {
  const { currentUser, refreshClassLiveSessions } = useApp()
  const [activeClass, setActiveClass] = useState<Class | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [hasJoinedSession, setHasJoinedSession] = useState(false)
  const isTeacher = currentUser.role === "teacher"
  const liveSession = useLiveSession({
    classId: activeClass?.id ?? "",
    currentUser,
    enabled: Boolean(activeClass && sessionActive),
  })
  const connected = liveSession.connectionState === ConnectionState.Connected

  const joinSession = useCallback((cls: Class) => {
    setActiveClass(cls)
    setHasJoinedSession(true)
    setSessionActive(true)
  }, [])

  const leaveSession = useCallback(() => {
    liveSession.disconnect()
    setSessionActive(false)
    setHasJoinedSession(true)
  }, [liveSession])

  const endSession = useCallback(async () => {
    const classId = activeClass?.id

    if (!classId) {
      leaveSession()
      return
    }

    liveSession.disconnect()
    setSessionActive(false)
    setHasJoinedSession(true)

    if (isTeacher) {
      await syncClassLiveSession({ classId, method: "DELETE" }).catch(() => {})
      await refreshClassLiveSessions({ force: true }).catch(() => {})
    }
  }, [
    activeClass?.id,
    isTeacher,
    leaveSession,
    liveSession,
    refreshClassLiveSessions,
  ])

  useEffect(() => {
    if (!activeClass || !sessionActive || !isTeacher || !connected) {
      return
    }

    let cancelled = false

    async function markLive() {
      if (!activeClass) return

      await syncClassLiveSession({
        classId: activeClass.id,
        method: "POST",
      })
      if (!cancelled) {
        await refreshClassLiveSessions({ force: true }).catch(() => {})
      }
    }

    void markLive().catch(() => {})

    const heartbeat = window.setInterval(() => {
      void syncClassLiveSession({
        classId: activeClass.id,
        method: "PATCH",
      }).catch(() => {})
    }, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(heartbeat)
    }
  }, [
    activeClass,
    connected,
    isTeacher,
    refreshClassLiveSessions,
    sessionActive,
  ])

  useEffect(() => {
    liveSession.disconnect()
    setActiveClass(null)
    setSessionActive(false)
    setHasJoinedSession(false)
  }, [currentUser.id])

  const value = useMemo(
    () => ({
      activeClass,
      hasJoinedSession,
      sessionActive,
      liveSession,
      joinSession,
      leaveSession,
      endSession,
    }),
    [
      activeClass,
      endSession,
      hasJoinedSession,
      joinSession,
      leaveSession,
      liveSession,
      sessionActive,
    ],
  )

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
    </LiveSessionContext.Provider>
  )
}

export function LiveSessionMiniBar() {
  const pathname = usePathname()
  const { currentUser } = useApp()
  const { activeClass, endSession, leaveSession, liveSession, sessionActive } =
    usePersistentLiveSession()

  if (!activeClass || !sessionActive) {
    return null
  }

  if (pathname === `/classes/${activeClass.id}/session`) {
    return null
  }

  const connected = liveSession.connectionState === ConnectionState.Connected
  const isTeacher = currentUser.role === "teacher"

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(42rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border bg-card px-3 py-2 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Radio className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {activeClass.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {connected ? "Live session active" : "Reconnecting..."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link href={`/classes/${activeClass.id}/session`}>
              <Radio className="h-3.5 w-3.5" />
              Open
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={leaveSession}
          >
            <Phone className="h-3.5 w-3.5" />
            Leave
          </Button>
          {isTeacher ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void endSession()}
            >
              <Square className="h-3.5 w-3.5" />
              End
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function usePersistentLiveSession() {
  const context = useContext(LiveSessionContext)

  if (!context) {
    throw new Error(
      "usePersistentLiveSession must be used within LiveSessionProvider",
    )
  }

  return context
}
