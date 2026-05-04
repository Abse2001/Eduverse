"use client"

import { Bell, CheckCheck, Inbox, LoaderCircle, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useApp } from "@/lib/store"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const NOTIFICATIONS_CACHE_PREFIX = "eduverse:notifications:v1"

type AppNotification = {
  id: string
  organizationId: string
  classId: string | null
  recipientRole: "org_owner" | "org_admin" | "teacher" | "student"
  actorUserId: string | null
  type:
    | "chat_announcement"
    | "session_started"
    | "material_added"
    | "assignment_published"
    | "assignment_submitted"
    | "assignment_graded"
  title: string
  body: string
  href: string
  metadata: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

type NotificationsResponse = {
  notifications?: AppNotification[]
  unreadCount?: number
  error?: string
}

type NotificationsCache = {
  notifications: AppNotification[]
  unreadCount: number
}

export function NotificationsMenu() {
  const router = useRouter()
  const { activeOrganization, authUser } = useApp()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const cacheKey = getNotificationsCacheKey({
    userId: authUser?.id ?? null,
    organizationId: activeOrganization?.id ?? null,
    role: activeOrganization?.selectedRole ?? null,
  })

  async function loadNotifications({ background = false } = {}) {
    if (!authUser || !activeOrganization) {
      setNotifications([])
      setUnreadCount(0)
      setIsLoading(false)
      setErrorMessage(null)
      return
    }

    if (!background) setIsLoading(true)
    setErrorMessage(null)

    try {
      const params = new URLSearchParams()
      params.set("organizationId", activeOrganization.id)
      const query = params.toString()
      const response = await fetch(
        `/api/notifications${query ? `?${query}` : ""}`,
        {
          cache: "no-store",
        },
      )
      const payload = (await response
        .json()
        .catch(() => null)) as NotificationsResponse | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load notifications.")
      }

      const nextCache = {
        notifications: payload?.notifications ?? [],
        unreadCount: payload?.unreadCount ?? 0,
      }
      setNotifications(nextCache.notifications)
      setUnreadCount(nextCache.unreadCount)
      writeNotificationsCache(cacheKey, nextCache)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load notifications.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const cached = readNotificationsCache(cacheKey)

    if (cached) {
      setNotifications(cached.notifications)
      setUnreadCount(cached.unreadCount)
      setIsLoading(false)
    } else {
      setNotifications([])
      setUnreadCount(0)
      setIsLoading(Boolean(authUser && activeOrganization))
    }

    void loadNotifications()
  }, [authUser?.id, activeOrganization?.id, activeOrganization?.selectedRole])

  useEffect(() => {
    if (!authUser || !activeOrganization) return

    const supabase = createClient()
    const channel = supabase
      .channel(
        `notifications:${authUser.id}:${activeOrganization.id}:${activeOrganization.selectedRole}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${authUser.id}`,
        },
        () => {
          void loadNotifications({ background: true })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [authUser?.id, activeOrganization?.id, activeOrganization?.selectedRole])

  async function markRead(notificationId: string) {
    const nextNotifications = notifications.map((notification) =>
      notification.id === notificationId
        ? {
            ...notification,
            readAt: notification.readAt ?? new Date().toISOString(),
          }
        : notification,
    )
    const nextUnreadCount = countUnreadNotifications(nextNotifications)
    setNotifications(nextNotifications)
    setUnreadCount(nextUnreadCount)
    writeNotificationsCache(cacheKey, {
      notifications: nextNotifications,
      unreadCount: nextUnreadCount,
    })

    await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
      method: "PATCH",
    }).catch(() => null)
  }

  async function markAllRead() {
    const readAt = new Date().toISOString()
    const nextNotifications = notifications.map((notification) => ({
      ...notification,
      readAt,
    }))
    setNotifications(nextNotifications)
    setUnreadCount(0)
    writeNotificationsCache(cacheKey, {
      notifications: nextNotifications,
      unreadCount: 0,
    })

    await fetch("/api/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: activeOrganization?.id ?? null,
      }),
    }).catch(() => null)
  }

  async function openNotification(notification: AppNotification) {
    if (!notification.readAt) await markRead(notification.id)
    setOpen(false)
    router.push(notification.href)
  }

  async function deleteNotification(notification: AppNotification) {
    const nextNotifications = notifications.filter(
      (currentNotification) => currentNotification.id !== notification.id,
    )
    const nextUnreadCount = countUnreadNotifications(nextNotifications)
    setNotifications(nextNotifications)
    setUnreadCount(nextUnreadCount)
    writeNotificationsCache(cacheKey, {
      notifications: nextNotifications,
      unreadCount: nextUnreadCount,
    })

    await fetch(`/api/notifications/${encodeURIComponent(notification.id)}`, {
      method: "DELETE",
    }).catch(() => null)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark read
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <ScrollArea className="max-h-96">
          <div className="p-1">
            {isLoading ? (
              <NotificationState
                icon={<LoaderCircle className="h-4 w-4 animate-spin" />}
                title="Loading notifications"
              />
            ) : errorMessage ? (
              <NotificationState
                icon={<Inbox className="h-4 w-4" />}
                title={errorMessage}
              />
            ) : notifications.length === 0 ? (
              <NotificationState
                icon={<Inbox className="h-4 w-4" />}
                title="No notifications"
              />
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "group flex w-full gap-2 rounded-sm px-2 py-2.5 transition-colors hover:bg-accent",
                    !notification.readAt && "bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => void openNotification(notification)}
                  >
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        notification.readAt ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {notification.title}
                      </span>
                      {notification.body ? (
                        <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void deleteNotification(notification)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete notification</span>
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationState({
  icon,
  title,
}: {
  icon: React.ReactNode
  title: string
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground">
      {icon}
      <span>{title}</span>
    </div>
  )
}

function formatRelativeTime(value: string) {
  const elapsedMs = Date.now() - Date.parse(value)
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000))

  if (elapsedMinutes < 1) return "Just now"
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 7) return `${elapsedDays}d ago`

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function getNotificationsCacheKey({
  userId,
  organizationId,
  role,
}: {
  userId: string | null
  organizationId: string | null
  role: string | null
}) {
  if (!userId || !organizationId || !role) return null
  return `${NOTIFICATIONS_CACHE_PREFIX}:${userId}:${organizationId}:${role}`
}

function readNotificationsCache(cacheKey: string | null) {
  if (!cacheKey || typeof window === "undefined") return null

  try {
    const value = window.localStorage.getItem(cacheKey)
    if (!value) return null

    const parsed = JSON.parse(value) as Partial<NotificationsCache>
    if (!Array.isArray(parsed.notifications)) return null

    return {
      notifications: parsed.notifications,
      unreadCount:
        typeof parsed.unreadCount === "number"
          ? parsed.unreadCount
          : countUnreadNotifications(parsed.notifications),
    } satisfies NotificationsCache
  } catch {
    return null
  }
}

function writeNotificationsCache(
  cacheKey: string | null,
  cache: NotificationsCache,
) {
  if (!cacheKey || typeof window === "undefined") return

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(cache))
  } catch {
    // localStorage can be unavailable or full; state remains authoritative.
  }
}

function countUnreadNotifications(notifications: AppNotification[]) {
  return notifications.filter((notification) => !notification.readAt).length
}
