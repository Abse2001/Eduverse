"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  BookOpen,
  Clock,
  FlaskConical,
  LoaderCircle,
  MessageSquare,
  Settings,
  Users,
  Video,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  loadOrganizationClasses,
  type ClassProfile,
  type OrganizationClass,
} from "@/lib/supabase/classes"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { CLASS_BADGE_COLOR_MAP, CLASS_COLOR_MAP } from "@/lib/view-config"

function initials(profile: ClassProfile | null) {
  const name = profile?.display_name || profile?.email || "User"

  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  )
}

export function ClassesScreen() {
  const { activeOrganization, currentUser } = useApp()
  const [classes, setClasses] = useState<OrganizationClass[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isTeacher = currentUser.role === "teacher"
  const isAdmin = currentUser.role === "admin"

  useEffect(() => {
    if (!activeOrganization) return
    const organizationId = activeOrganization.id

    async function loadClasses() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const rows = await loadOrganizationClasses(organizationId)
        setClasses(
          isAdmin
            ? rows
            : rows.filter((classItem) =>
                classItem.memberships.some(
                  (membership) => membership.user_id === currentUser.id,
                ),
              ),
        )
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load classes",
        )
      } finally {
        setIsLoading(false)
      }
    }

    void loadClasses()
  }, [activeOrganization?.id, currentUser.id, isAdmin])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">
            {isAdmin
              ? "All Classes"
              : isTeacher
                ? "My Classes"
                : "Enrolled Classes"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {classes.length} class{classes.length !== 1 ? "es" : ""} &middot;{" "}
            {activeOrganization?.name ?? currentUser.institution}
          </p>
        </div>
        {isAdmin ? (
          <Link href="/admin">
            <Button size="sm" className="gap-1.5">
              <Settings className="w-4 h-4" />
              Manage Classes
            </Button>
          </Link>
        ) : null}
      </div>

      {errorMessage ? (
        <Card>
          <CardContent className="p-5 text-sm text-destructive">
            {errorMessage}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading classes...
        </div>
      ) : null}

      {!isLoading && classes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No classes found for this organization.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {classes.map((classItem) => (
          <Card
            key={classItem.id}
            className="group hover:shadow-lg transition-shadow flex flex-col"
          >
            <CardContent className="p-5 flex flex-col flex-1 gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                    CLASS_COLOR_MAP[classItem.color ?? "indigo"] ??
                      "bg-primary",
                  )}
                >
                  {classItem.code.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-foreground text-sm leading-tight group-hover:text-primary transition-colors">
                    {classItem.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] border-0",
                        CLASS_BADGE_COLOR_MAP[classItem.color ?? "indigo"],
                      )}
                    >
                      {classItem.code}
                    </Badge>
                    {classItem.semester ? (
                      <span className="text-xs text-muted-foreground">
                        {classItem.semester}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {classItem.description || classItem.subject}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  {classItem.students.length} students
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {classItem.schedule_text ?? "No schedule"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 shrink-0" />0 assignments
                </div>
              </div>

              {classItem.teacher ? (
                <div className="flex items-center gap-2">
                  <Avatar className="w-5 h-5">
                    <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                      {initials(classItem.teacher)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">
                    {classItem.teacher.display_name}
                  </span>
                </div>
              ) : null}

              {currentUser.role === "student" ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium text-foreground">0%</span>
                  </div>
                  <Progress value={0} className="h-1.5" />
                </div>
              ) : null}

              <div className="flex items-center gap-2 mt-auto">
                <Link href={`/classes/${classItem.id}/home`} className="flex-1">
                  <Button size="sm" className="w-full gap-1.5 text-xs h-8">
                    <BookOpen className="w-3.5 h-3.5" />
                    Open Class
                  </Button>
                </Link>
                <Link href={`/classes/${classItem.id}/chat`}>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </Button>
                </Link>
                <Link href={`/classes/${classItem.id}/session`}>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <Video className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
