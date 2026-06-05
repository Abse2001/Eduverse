"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ChartColumn, ClipboardList, FileText } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import {
  useClassAssignments,
  type ClassAssignment,
} from "@/features/assignments/use-class-assignments"
import { ExamResults } from "@/features/exam/exam-results"
import { useClassExam } from "@/features/exam/use-class-exam"
import { resolveClassFeatures } from "@/lib/features/feature-registry"
import type { ReleasedExamResultDto } from "@/lib/exams/types"
import { useApp } from "@/lib/store"

type StudentAssignmentResult = {
  id: string
  title: string
  score: number
  maxScore: number
  gradedAt: string
  feedback: string
}

type ManagerAssignmentResultSummary = {
  id: string
  title: string
  dueAt: string
  maxScore: number
  gradedCount: number
  submittedCount: number
  pendingCount: number
}

export function ClassResultsScreen({ classId }: { classId: string }) {
  const { authUser, currentUser, activeOrganization, featureDefinitions } =
    useApp()
  const { cls, classRow, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "leaderboard")

  const canManage =
    currentUser.role === "admin" ||
    (currentUser.role === "teacher" &&
      (classRow?.teacher_user_id === currentUser.id ||
        classRow?.memberships.some(
          (membership) =>
            membership.user_id === currentUser.id &&
            (membership.role === "teacher" || membership.role === "ta"),
        ) === true))

  const examFeatureEnabled =
    !!classRow &&
    !!activeOrganization &&
    resolveClassFeatures({
      definitions: featureDefinitions,
      organizationSettings: activeOrganization.featureSettings,
      classSettings: classRow.featureSettings,
    }).find((feature) => feature.key === "exam")?.enabled !== false

  const examApi = useClassExam(classId, {
    enabled: examFeatureEnabled,
  })
  const assignmentsApi = useClassAssignments({
    classId,
    currentUserId: authUser?.id ?? currentUser.id ?? null,
    canManage,
  })
  const [selectedExamResult, setSelectedExamResult] =
    useState<ReleasedExamResultDto | null>(null)

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return (
      <ClassFeatureDisabledFallback classId={classId} featureLabel="Results" />
    )
  }

  const studentAssignmentResults = canManage
    ? []
    : getStudentAssignmentResults(assignmentsApi.assignments)
  const studentExamResults =
    !canManage && examApi.data && !examApi.data.canManage
      ? getStudentExamResults(examApi.data.student)
      : []
  const managerAssignmentSummaries = canManage
    ? getManagerAssignmentResults(assignmentsApi.assignments)
    : []
  const managerExamSummaries =
    canManage && examApi.data?.canManage ? examApi.data.manager.exams : []
  const assignmentResultsCount = studentAssignmentResults.length
  const examResultsCount = studentExamResults.length
  const gradedAssignmentsCount = managerAssignmentSummaries.reduce(
    (total, assignment) => total + assignment.gradedCount,
    0,
  )
  const releasedExamResultsCount = managerExamSummaries.reduce(
    (total, exam) => total + exam.attemptCounts.released,
    0,
  )

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{cls.name}</h1>
          <p className="text-sm text-muted-foreground">
            {cls.code} &middot; Results
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5">
          <ChartColumn className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {canManage ? "Class overview" : "Your records"}
          </span>
        </div>
      </div>

      {(assignmentsApi.errorMessage || examApi.errorMessage) && (
        <Alert variant="destructive">
          <AlertDescription>
            {assignmentsApi.errorMessage ?? examApi.errorMessage}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          icon={FileText}
          label={canManage ? "Graded assignments" : "Assignment results"}
          value={canManage ? gradedAssignmentsCount : assignmentResultsCount}
        />
        <SummaryCard
          icon={ClipboardList}
          label={canManage ? "Released exam results" : "Exam results"}
          value={canManage ? releasedExamResultsCount : examResultsCount}
        />
      </div>

      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Assignment Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {assignmentsApi.isLoading ? (
                <LoadingRow label="Loading assignment results..." />
              ) : managerAssignmentSummaries.length === 0 ? (
                <EmptyState label="No assignment results yet." />
              ) : (
                managerAssignmentSummaries.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {assignment.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Due{" "}
                          {format(new Date(assignment.dueAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {assignment.maxScore} pts
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{assignment.gradedCount} graded</span>
                      <span>{assignment.submittedCount} submitted</span>
                      <span>{assignment.pendingCount} pending</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                Exam Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {examFeatureEnabled && examApi.isLoading && !examApi.data ? (
                <LoadingRow label="Loading exam results..." />
              ) : !examFeatureEnabled ? (
                <EmptyState label="Exam results are disabled for this class." />
              ) : managerExamSummaries.length === 0 ? (
                <EmptyState label="No exam results yet." />
              ) : (
                managerExamSummaries.map((exam) => (
                  <div
                    key={exam.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {exam.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exam.startAt
                            ? format(new Date(exam.startAt), "MMM d, h:mm a")
                            : "No start time"}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {formatExamStatus(exam.status)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{exam.attemptCounts.inProgress} in progress</span>
                      <span>{exam.attemptCounts.submitted} submitted</span>
                      <span>{exam.attemptCounts.graded} graded</span>
                      <span>{exam.attemptCounts.released} released</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Assignment Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {assignmentsApi.isLoading ? (
                <LoadingRow label="Loading assignment results..." />
              ) : studentAssignmentResults.length === 0 ? (
                <EmptyState label="Graded assignment results will appear here." />
              ) : (
                studentAssignmentResults.map((assignment) => (
                  <div key={assignment.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {assignment.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Graded{" "}
                          {format(
                            new Date(assignment.gradedAt),
                            "MMM d, h:mm a",
                          )}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {assignment.score}/{assignment.maxScore}
                      </Badge>
                    </div>
                    {assignment.feedback ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {assignment.feedback}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                Exam Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {examFeatureEnabled && examApi.isLoading && !examApi.data ? (
                <LoadingRow label="Loading exam results..." />
              ) : !examFeatureEnabled ? (
                <EmptyState label="Exam results are disabled for this class." />
              ) : studentExamResults.length === 0 ? (
                <EmptyState label="Released exam results will appear here." />
              ) : (
                studentExamResults.map((result) => (
                  <button
                    key={result.attemptId}
                    type="button"
                    onClick={() => setSelectedExamResult(result)}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {result.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Released{" "}
                          {format(
                            new Date(
                              result.releasedAt ??
                                result.submittedAt ??
                                new Date(0).toISOString(),
                            ),
                            "MMM d, h:mm a",
                          )}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {result.totalScore}/{result.totalPoints}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <Badge variant="outline">{result.integrityStatus}</Badge>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog
        open={selectedExamResult !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedExamResult(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {selectedExamResult ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedExamResult.title}</DialogTitle>
                <DialogDescription>
                  Review becomes available here after the teacher saves and
                  approves the exam result.
                </DialogDescription>
              </DialogHeader>
              <ExamResults result={selectedExamResult} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText
  label: string
  value: number
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>
}

function getStudentAssignmentResults(assignments: ClassAssignment[]) {
  return assignments
    .flatMap((assignment) => {
      const submission = assignment.mySubmission
      if (!submission?.gradedAt || submission.score === null) return []

      return [
        {
          id: assignment.id,
          title: assignment.title,
          score: submission.score,
          maxScore: assignment.maxScore,
          gradedAt: submission.gradedAt,
          feedback: submission.feedback,
        } satisfies StudentAssignmentResult,
      ]
    })
    .sort(
      (left, right) => Date.parse(right.gradedAt) - Date.parse(left.gradedAt),
    )
}

function getManagerAssignmentResults(assignments: ClassAssignment[]) {
  return assignments
    .map((assignment) => {
      const submittedCount = assignment.submissions.length
      const gradedCount = assignment.submissions.filter(
        (submission) => submission.gradedAt,
      ).length

      return {
        id: assignment.id,
        title: assignment.title,
        dueAt: assignment.dueAt,
        maxScore: assignment.maxScore,
        gradedCount,
        submittedCount,
        pendingCount: Math.max(submittedCount - gradedCount, 0),
      } satisfies ManagerAssignmentResultSummary
    })
    .sort((left, right) => Date.parse(right.dueAt) - Date.parse(left.dueAt))
}

function getStudentExamResults(page: {
  releasedResults: ReleasedExamResultDto[]
}) {
  return [...page.releasedResults]
    .filter((result) => result.isReleased)
    .filter(
      (result, index, results) =>
        results.findIndex(
          (candidate) => candidate.attemptId === result.attemptId,
        ) === index,
    )
    .sort((left, right) => {
      const leftReleaseAt =
        left.releasedAt ?? left.submittedAt ?? new Date(0).toISOString()
      const rightReleaseAt =
        right.releasedAt ?? right.submittedAt ?? new Date(0).toISOString()

      return Date.parse(rightReleaseAt) - Date.parse(leftReleaseAt)
    })
}

function formatExamStatus(status: string) {
  if (status === "live") return "Live"
  if (status === "ended") return "Ended"
  return "Upcoming"
}
