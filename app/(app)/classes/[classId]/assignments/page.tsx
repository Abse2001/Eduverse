"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { format, isPast } from "date-fns"
import {
  createAssignment,
  getAssignmentsByClass,
  getClassById,
  getClassesByTeacher,
  type Assignment,
} from "@/lib/mock-data"
import { getAssignmentsByStatus } from "@/lib/education/selectors"
import {
  CreateAssignmentDialog,
  type CreateAssignmentValues,
} from "@/features/assignments/create-assignment-dialog"
import { useApp } from "@/lib/store"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2,
  AlertCircle,
  CircleDot,
  Clock,
  Code2,
  FileText,
  BookOpen,
  ClipboardCheck,
  FlaskConical,
  ClipboardList,
  Brain,
} from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_CONFIG = {
  graded: {
    label: "Graded",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  submitted: {
    label: "Submitted",
    icon: CircleDot,
    color: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  pending: {
    label: "Pending",
    icon: AlertCircle,
    color: "text-amber-600 dark:text-amber-400",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
}

const TYPE_CONFIG = {
  assignment: {
    label: "Assignment",
    icon: BookOpen,
    color:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  quiz: {
    label: "Quiz",
    icon: Brain,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  exam: {
    label: "Exam",
    icon: ClipboardList,
    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
  lab: {
    label: "Lab",
    icon: FlaskConical,
    color:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
}

export default function AssignmentsPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { currentUser, assignments: allAssignments, addAssignment } = useApp()
  const isTeacher = currentUser.role === "teacher"
  const [successMessage, setSuccessMessage] = useState("")
  const cls = getClassById(classId)
  const canCreateAssignment = isTeacher && cls?.teacherId === currentUser.id
  const teacherClasses = isTeacher ? getClassesByTeacher(currentUser.id) : []
  const assignments = getAssignmentsByClass(
    classId,
    currentUser,
    allAssignments,
  )

  useEffect(() => {
    if (!successMessage) return

    if (!canCreateAssignment) {
      setSuccessMessage("")
      return
    }

    const timeout = window.setTimeout(() => {
      setSuccessMessage("")
    }, 4000)

    return () => window.clearTimeout(timeout)
  }, [canCreateAssignment, successMessage])

  if (!cls)
    return <div className="p-6 text-muted-foreground">Class not found.</div>

  const { pending, submitted, graded } = getAssignmentsByStatus(assignments)

  const sections = [
    { label: "Pending", items: pending, emptyText: "No pending assignments" },
    {
      label: "Submitted",
      items: submitted,
      emptyText: "Nothing submitted yet",
    },
    { label: "Graded", items: graded, emptyText: "No graded work yet" },
  ]

  function handleCreateAssignment(values: CreateAssignmentValues) {
    if (!canCreateAssignment) return

    const assignment = createAssignment(values, currentUser, classId)

    addAssignment(assignment)
    setSuccessMessage(`"${values.title}" was created successfully.`)
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{cls.name}</h1>
          <p className="text-sm text-muted-foreground">
            {cls.code} &middot; {assignments.length} assignments
          </p>
        </div>
        {canCreateAssignment && (
          <CreateAssignmentDialog
            classes={teacherClasses}
            currentClassId={classId}
            onCreate={handleCreateAssignment}
          />
        )}
      </div>

      {canCreateAssignment && successMessage ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-100">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          <AlertTitle>Assignment created</AlertTitle>
          <AlertDescription className="text-emerald-700 dark:text-emerald-200">
            {successMessage}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Pending",
            count: pending.length,
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-50 dark:bg-amber-900/20",
          },
          {
            label: "Submitted",
            count: submitted.length,
            color: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-50 dark:bg-blue-900/20",
          },
          {
            label: "Graded",
            count: graded.length,
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-50 dark:bg-emerald-900/20",
          },
        ].map((s) => (
          <div key={s.label} className={cn("rounded-xl p-3 text-center", s.bg)}>
            <p className={cn("text-2xl font-bold", s.color)}>{s.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium text-foreground">No assignments yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Assignments for this class will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        sections.map((section) => (
          <div key={section.label} className="space-y-3">
            <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
              {section.label}
              <span className="text-xs font-normal text-muted-foreground">
                ({section.items.length})
              </span>
            </h2>
            {section.items.length === 0 ? (
              <p className="text-sm text-muted-foreground pl-1">
                {section.emptyText}
              </p>
            ) : (
              section.items.map((a) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  classId={classId}
                  isTeacher={isTeacher}
                />
              ))
            )}
          </div>
        ))
      )}
    </div>
  )
}

function AssignmentCard({
  assignment: a,
  classId,
  isTeacher,
}: {
  assignment: Assignment
  classId: string
  isTeacher: boolean
}) {
  const status = STATUS_CONFIG[a.status ?? "pending"]
  const type = TYPE_CONFIG[a.type]
  const StatusIcon = status.icon
  const TypeIcon = type.icon
  const due = new Date(a.dueDate)
  const overdue = isPast(due) && a.status === "pending"

  return (
    <Card className="hover:shadow-md transition-shadow group">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <TypeIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-foreground leading-snug">
              {a.title}
            </p>
            <StatusIcon
              className={cn("w-4 h-4 shrink-0 mt-0.5", status.color)}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-1">
            {a.description}
          </p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge
              variant="secondary"
              className={cn("text-[10px] border-0", type.color)}
            >
              <TypeIcon className="w-2.5 h-2.5 mr-1" />
              {type.label}
            </Badge>
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                overdue
                  ? "text-destructive font-medium"
                  : "text-muted-foreground",
              )}
            >
              <Clock className="w-3 h-3" />
              {overdue ? "Overdue - " : "Due "}
              {format(due, "MMM d, h:mm a")}
            </span>
            <span className="text-xs text-muted-foreground">
              {a.maxScore} pts
            </span>
            {a.score !== undefined && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Score: {a.score}/{a.maxScore}
              </span>
            )}
            {a.attachmentFileName && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{a.attachmentFileName}</span>
              </span>
            )}
            {a.hasIde && (
              <span className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                <Code2 className="w-3 h-3" />
                IDE
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {isTeacher ? (
            <Button variant="outline" size="sm" className="text-xs">
              Review
            </Button>
          ) : a.status === "pending" ? (
            a.hasIde ? (
              <Link href={`/classes/${classId}/ide`}>
                <Button size="sm" className="text-xs gap-1.5">
                  <Code2 className="w-3 h-3" />
                  Open IDE
                </Button>
              </Link>
            ) : (
              <Button size="sm" className="text-xs">
                Start
              </Button>
            )
          ) : (
            <Button variant="outline" size="sm" className="text-xs">
              View
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
