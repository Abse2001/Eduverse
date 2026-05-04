"use client"

import { useState } from "react"
import { format } from "date-fns"
import { CheckCircle2, MailPlus, RotateCcw, XCircle } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PENDING_ACCESS_REQUESTS } from "@/lib/mock-data"
import type { PendingAccessRequest } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const ROLE_BADGE_COLOR_MAP: Record<PendingAccessRequest["role"], string> = {
  teacher:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  student: "bg-brand-subtle text-brand",
}

const TYPE_BADGE_COLOR_MAP: Record<PendingAccessRequest["type"], string> = {
  invite: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  request:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function PendingRequestsTab() {
  const [pendingItems, setPendingItems] = useState(PENDING_ACCESS_REQUESTS)

  function dismissRequest(itemId: string) {
    setPendingItems((items) => items.filter((item) => item.id !== itemId))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Pending Invitations & Requests
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {pendingItems.length > 0 ? (
          <div className="divide-y divide-border">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 px-5 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {item.type === "invite" ? (
                        <MailPlus className="h-3.5 w-3.5" />
                      ) : (
                        initials(item.name)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.email}
                    </p>
                  </div>
                  <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "border-0 text-[10px] capitalize",
                        TYPE_BADGE_COLOR_MAP[item.type],
                      )}
                    >
                      {item.type}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "border-0 text-[10px] capitalize",
                        ROLE_BADGE_COLOR_MAP[item.role],
                      )}
                    >
                      {item.role}
                    </Badge>
                  </div>
                  <div className="hidden text-xs text-muted-foreground md:block">
                    {format(new Date(item.requestedAt), "MMM d, h:mm a")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0">
                  {item.type === "request" ? (
                    <>
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => dismissRequest(item.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => dismissRequest(item.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Decline
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={() => dismissRequest(item.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No pending invitations or requests.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
