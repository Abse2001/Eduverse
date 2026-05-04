"use client"

import { Bell, CheckCheck, Inbox, LoaderCircle } from "lucide-react"
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
import { cn } from "@/lib/utils"

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

export function NotificationsMenu() {
  const router = useRouter()
  const { activeOrganization } = useApp()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadNotifications() {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const params = new URLSearchParams()
      if (activeOrganization?.id) {
        params.set("organizationId", activeOrganization.id)
      }
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

      setNotifications(payload?.notifications ?? [])
      setUnreadCount(payload?.unreadCount ?? 0)
    } catch (error) {
      setNotifications([])
      setUnreadCount(0)
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
    void loadNotifications()
  }, [activeOrganization?.id, activeOrganization?.selectedRole])

  useEffect(() => {
    if (open) void loadNotifications()
  }, [open])

  async function markRead(notificationId: string) {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              readAt: notification.readAt ?? new Date().toISOString(),
            }
          : notification,
      ),
    )
    setUnreadCount((current) => Math.max(0, current - 1))

    await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
      method: "PATCH",
    }).catch(() => null)
  }

  async function markAllRead() {
    const readAt = new Date().toISOString()
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, readAt })),
    )
    setUnreadCount(0)

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
                <button
                  key={notification.id}
                  type="button"
                  className={cn(
                    "flex w-full gap-3 rounded-sm px-2 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                    !notification.readAt && "bg-primary/5",
                  )}
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
