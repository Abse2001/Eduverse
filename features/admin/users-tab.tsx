"use client"

import { useState } from "react"
import { MoreHorizontal, PlusCircle, Search } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { USERS } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { ROLE_BADGE_COLOR_MAP } from "@/lib/view-config"

export function UsersTab() {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "student" | "teacher" | "admin">(
    "all",
  )

  const filteredUsers = USERS.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === "all" || user.role === filter

    return matchesSearch && matchesFilter
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(["all", "student", "teacher", "admin"] as const).map((role) => (
              <button
                key={role}
                onClick={() => setFilter(role)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors",
                  filter === role
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {role}
              </button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs h-7 ml-2"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add User
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                  {user.avatar}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] border-0 capitalize shrink-0",
                  ROLE_BADGE_COLOR_MAP[user.role],
                )}
              >
                {user.role}
              </Badge>
              <div className="hidden md:block text-xs text-muted-foreground shrink-0">
                {user.institution}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {filteredUsers.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No users match your search.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
