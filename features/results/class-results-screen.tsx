"use client"

import { format } from "date-fns"
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  ListChecks,
  SearchX,
  ShieldCheck,
  Timer,
  Trophy,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  type ClassAssignment,
  useClassAssignments,
} from "@/features/assignments/use-class-assignments"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import { ExamResults } from "@/features/exam/exam-results"
import { useClassExam } from "@/features/exam/use-class-exam"
import { toast } from "@/hooks/use-toast"
import type {
  ManagerExamSummaryDto,
  ReleasedExamResultDto,
} from "@/lib/exams/types"
import { resolveClassFeatures } from "@/lib/features/feature-registry"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

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
  averageScore: number | null
}

type ResultRecord =
  | (StudentAssignmentResult & { kind: "assignment"; date: string })
  | (ReleasedExamResultDto & { kind: "exam"; date: string })

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

  const studentAssignmentResults = useMemo(
    () =>
      canManage ? [] : getStudentAssignmentResults(assignmentsApi.assignments),
    [assignmentsApi.assignments, canManage],
  )
  const studentExamResults = useMemo(
    () =>
      !canManage && examApi.data && !examApi.data.canManage
        ? getStudentExamResults(examApi.data.student)
        : [],
    [canManage, examApi.data],
  )
  const managerAssignmentSummaries = useMemo(
    () =>
      canManage ? getManagerAssignmentResults(assignmentsApi.assignments) : [],
    [assignmentsApi.assignments, canManage],
  )
  const managerExamSummaries =
    canManage && examApi.data?.canManage ? examApi.data.manager.exams : []

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

  const pageError = assignmentsApi.errorMessage ?? examApi.errorMessage

  useEffect(() => {
    if (!pageError) return

    toast({
      title: "Could not load results",
      description: pageError,
      variant: "destructive",
    })
  }, [pageError])

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <ClassPageHeader title={cls.name} code={cls.code} section="Results" />

      {canManage ? (
        <TeacherResultsView
          assignmentsLoading={assignmentsApi.isLoading}
          examFeatureEnabled={examFeatureEnabled}
          examsLoading={examApi.isLoading && !examApi.data}
          assignmentSummaries={managerAssignmentSummaries}
          examSummaries={managerExamSummaries}
        />
      ) : (
        <StudentResultsView
          assignmentsLoading={assignmentsApi.isLoading}
          examFeatureEnabled={examFeatureEnabled}
          examsLoading={examApi.isLoading && !examApi.data}
          assignmentResults={studentAssignmentResults}
          examResults={studentExamResults}
          onSelectExam={setSelectedExamResult}
        />
      )}

      <Dialog
        open={selectedExamResult !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedExamResult(null)
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
          {selectedExamResult ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedExamResult.title}</DialogTitle>
                <DialogDescription>
                  Released exam details, including per-question grading.
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

function TeacherResultsView({
  assignmentsLoading,
  examFeatureEnabled,
  examsLoading,
  assignmentSummaries,
  examSummaries,
}: {
  assignmentsLoading: boolean
  examFeatureEnabled: boolean
  examsLoading: boolean
  assignmentSummaries: ManagerAssignmentResultSummary[]
  examSummaries: ManagerExamSummaryDto[]
}) {
  const gradedAssignmentsCount = assignmentSummaries.reduce(
    (total, assignment) => total + assignment.gradedCount,
    0,
  )
  const pendingAssignmentCount = assignmentSummaries.reduce(
    (total, assignment) => total + assignment.pendingCount,
    0,
  )
  const submittedAssignmentsCount = assignmentSummaries.reduce(
    (total, assignment) => total + assignment.submittedCount,
    0,
  )
  const releasedExamResultsCount = examSummaries.reduce(
    (total, exam) => total + exam.attemptCounts.released,
    0,
  )
  const gradedExamResultsCount = examSummaries.reduce(
    (total, exam) => total + exam.attemptCounts.graded,
    0,
  )
  const submittedExamResultsCount = examSummaries.reduce(
    (total, exam) => total + exam.attemptCounts.submitted,
    0,
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CheckCircle2}
          label="Assignment grades"
          value={gradedAssignmentsCount}
          detail={`${submittedAssignmentsCount} submitted`}
        />
        <MetricCard
          icon={Timer}
          label="Needs grading"
          value={pendingAssignmentCount}
          detail="Assignment submissions"
          tone={pendingAssignmentCount > 0 ? "warning" : "default"}
        />
        <MetricCard
          icon={ClipboardList}
          label="Released exams"
          value={releasedExamResultsCount}
          detail={`${gradedExamResultsCount} graded attempts`}
        />
        <MetricCard
          icon={ListChecks}
          label="Exam submissions"
          value={submittedExamResultsCount}
          detail="Awaiting grading or release"
        />
      </div>

      <Tabs defaultValue="assignments" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-fit">
          <TabsTrigger value="assignments" className="gap-2">
            <FileText className="h-4 w-4" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Exams
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Assignment Results
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {assignmentsLoading ? (
                <LoadingPanel label="Loading assignment results..." />
              ) : assignmentSummaries.length === 0 ? (
                <EmptyPanel
                  icon={SearchX}
                  title="No assignment results"
                  description="Published assignments with graded submissions will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                      <TableHead className="text-right">Graded</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignmentSummaries.map((assignment) => {
                      const completion = percentage(
                        assignment.gradedCount,
                        assignment.submittedCount,
                      )

                      return (
                        <TableRow key={assignment.id}>
                          <TableCell className="min-w-64">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">
                                {assignment.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {assignment.maxScore} points
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateTime(assignment.dueAt)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {assignment.averageScore === null
                              ? "No grades"
                              : `${assignment.averageScore}%`}
                          </TableCell>
                          <TableCell className="min-w-40">
                            <div className="space-y-1 text-right">
                              <span className="font-medium">
                                {assignment.gradedCount}/
                                {assignment.submittedCount}
                              </span>
                              <Progress
                                value={completion}
                                className="ml-auto h-1.5 max-w-28"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <StatusBadge
                              value={assignment.pendingCount}
                              label="pending"
                              active={assignment.pendingCount > 0}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exams">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                Exam Results
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {examFeatureEnabled && examsLoading ? (
                <LoadingPanel label="Loading exam results..." />
              ) : !examFeatureEnabled ? (
                <EmptyPanel
                  icon={ClipboardList}
                  title="Exam results are disabled"
                  description="Enable exams for this class to review released results here."
                />
              ) : examSummaries.length === 0 ? (
                <EmptyPanel
                  icon={SearchX}
                  title="No exam results"
                  description="Exam attempts will appear after students submit and results are released."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Submitted</TableHead>
                      <TableHead className="text-right">Graded</TableHead>
                      <TableHead className="text-right">Released</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examSummaries.map((exam) => {
                      const released = percentage(
                        exam.attemptCounts.released,
                        exam.attemptCounts.submitted +
                          exam.attemptCounts.graded +
                          exam.attemptCounts.released,
                      )

                      return (
                        <TableRow key={exam.id}>
                          <TableCell className="min-w-64">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">
                                {exam.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {exam.totalPoints} points
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {exam.startAt ? formatDateTime(exam.startAt) : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {formatExamStatus(exam.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {exam.attemptCounts.submitted}
                          </TableCell>
                          <TableCell className="text-right">
                            {exam.attemptCounts.graded}
                          </TableCell>
                          <TableCell className="min-w-40 text-right">
                            <div className="space-y-1">
                              <span className="font-medium">
                                {exam.attemptCounts.released}
                              </span>
                              <Progress
                                value={released}
                                className="ml-auto h-1.5 max-w-28"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StudentResultsView({
  assignmentsLoading,
  examFeatureEnabled,
  examsLoading,
  assignmentResults,
  examResults,
  onSelectExam,
}: {
  assignmentsLoading: boolean
  examFeatureEnabled: boolean
  examsLoading: boolean
  assignmentResults: StudentAssignmentResult[]
  examResults: ReleasedExamResultDto[]
  onSelectExam: (result: ReleasedExamResultDto) => void
}) {
  const records = getStudentResultRecords(assignmentResults, examResults)
  const average = getStudentAverage(records)
  const latest = records[0] ?? null

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Trophy}
          label="Average score"
          value={average === null ? "-" : `${average}%`}
          detail="Across released and graded work"
        />
        <MetricCard
          icon={FileText}
          label="Assignments"
          value={assignmentResults.length}
          detail="Graded"
        />
        <MetricCard
          icon={ClipboardList}
          label="Exams"
          value={examResults.length}
          detail="Released"
        />
        <MetricCard
          icon={BookOpenCheck}
          label="Latest result"
          value={latest ? formatRecordScore(latest) : "-"}
          detail={latest ? latest.title : "No results yet"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 sm:w-fit">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="exams">Exams</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <StudentTimelineCard
              isLoading={
                assignmentsLoading || (examFeatureEnabled && examsLoading)
              }
              records={records}
              onSelectExam={onSelectExam}
            />
          </TabsContent>

          <TabsContent value="assignments">
            <StudentAssignmentCard
              isLoading={assignmentsLoading}
              results={assignmentResults}
            />
          </TabsContent>

          <TabsContent value="exams">
            <StudentExamCard
              isLoading={examFeatureEnabled && examsLoading}
              examFeatureEnabled={examFeatureEnabled}
              results={examResults}
              onSelectExam={onSelectExam}
            />
          </TabsContent>
        </Tabs>

        <Card className="h-fit">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
              Score Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <ScoreBreakdownRow
              label="Assignments"
              count={assignmentResults.length}
              average={getAssignmentAverage(assignmentResults)}
            />
            <ScoreBreakdownRow
              label="Exams"
              count={examResults.length}
              average={getExamAverage(examResults)}
            />
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Open an exam result to see question-by-question feedback.
              Assignment feedback appears directly in the results list.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StudentTimelineCard({
  isLoading,
  records,
  onSelectExam,
}: {
  isLoading: boolean
  records: ResultRecord[]
  onSelectExam: (result: ReleasedExamResultDto) => void
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Recent Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {isLoading ? (
          <LoadingPanel label="Loading results..." />
        ) : records.length === 0 ? (
          <EmptyPanel
            icon={SearchX}
            title="No results yet"
            description="Graded assignments and released exams will appear here."
          />
        ) : (
          records.map((record) => (
            <StudentResultRow
              key={`${record.kind}-${record.kind === "exam" ? record.attemptId : record.id}`}
              record={record}
              onSelectExam={onSelectExam}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function StudentAssignmentCard({
  isLoading,
  results,
}: {
  isLoading: boolean
  results: StudentAssignmentResult[]
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5 text-muted-foreground" />
          Assignment Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {isLoading ? (
          <LoadingPanel label="Loading assignment results..." />
        ) : results.length === 0 ? (
          <EmptyPanel
            icon={SearchX}
            title="No graded assignments"
            description="Your assignment grades and teacher feedback will appear here."
          />
        ) : (
          results.map((result) => (
            <StudentResultRow
              key={result.id}
              record={{ ...result, kind: "assignment", date: result.gradedAt }}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function StudentExamCard({
  isLoading,
  examFeatureEnabled,
  results,
  onSelectExam,
}: {
  isLoading: boolean
  examFeatureEnabled: boolean
  results: ReleasedExamResultDto[]
  onSelectExam: (result: ReleasedExamResultDto) => void
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          Exam Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {isLoading ? (
          <LoadingPanel label="Loading exam results..." />
        ) : !examFeatureEnabled ? (
          <EmptyPanel
            icon={ClipboardList}
            title="Exam results are disabled"
            description="This class is not currently using exam results."
          />
        ) : results.length === 0 ? (
          <EmptyPanel
            icon={SearchX}
            title="No released exams"
            description="Your teacher will release exam results after grading."
          />
        ) : (
          results.map((result) => (
            <StudentResultRow
              key={result.attemptId}
              record={{
                ...result,
                kind: "exam",
                date:
                  result.releasedAt ??
                  result.submittedAt ??
                  new Date(0).toISOString(),
              }}
              onSelectExam={onSelectExam}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

function StudentResultRow({
  record,
  onSelectExam,
}: {
  record: ResultRecord
  onSelectExam?: (result: ReleasedExamResultDto) => void
}) {
  const score = getRecordPercentage(record)
  const icon =
    record.kind === "exam" ? (
      <ClipboardList className="h-4 w-4" />
    ) : (
      <FileText className="h-4 w-4" />
    )
  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{record.title}</p>
            <Badge variant="outline">
              {record.kind === "exam" ? "Exam" : "Assignment"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {record.kind === "exam" ? "Released" : "Graded"}{" "}
            {formatDateTime(record.date)}
          </p>
          {record.kind === "assignment" && record.feedback ? (
            <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
              {record.feedback}
            </p>
          ) : null}
          {record.kind === "exam" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                {formatIntegrityStatus(record.integrityStatus)}
              </Badge>
              <Badge variant="secondary">
                {formatAttemptStatus(record.status)}
              </Badge>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex w-full shrink-0 items-center gap-3 sm:w-44">
        <div className="min-w-0 flex-1 space-y-1 text-right">
          <p className="text-lg font-semibold text-foreground">
            {formatRecordScore(record)}
          </p>
          <Progress value={score} className="h-1.5" />
        </div>
        {record.kind === "exam" ? (
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        ) : null}
      </div>
    </>
  )

  if (record.kind === "exam" && onSelectExam) {
    return (
      <button
        type="button"
        onClick={() => onSelectExam(record)}
        className="flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
      {content}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof FileText
  label: string
  value: number | string
  detail: string
  tone?: "default" | "warning"
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
            tone === "warning"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ScoreBreakdownRow({
  label,
  count,
  average,
}: {
  label: string
  count: number
  average: number | null
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            {count} {count === 1 ? "result" : "results"}
          </p>
        </div>
        <p className="text-lg font-semibold text-foreground">
          {average === null ? "-" : `${average}%`}
        </p>
      </div>
      <Progress value={average ?? 0} className="h-1.5" />
    </div>
  )
}

function StatusBadge({
  value,
  label,
  active,
}: {
  value: number
  label: string
  active: boolean
}) {
  return (
    <Badge variant={active ? "destructive" : "secondary"}>
      {value} {label}
    </Badge>
  )
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </div>
  )
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof SearchX
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  )
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
      const gradedSubmissions = assignment.submissions.filter(
        (submission) => submission.gradedAt && submission.score !== null,
      )
      const gradedCount = gradedSubmissions.length
      const averageScore =
        gradedSubmissions.length === 0
          ? null
          : Math.round(
              gradedSubmissions.reduce(
                (sum, submission) =>
                  sum + percentage(submission.score ?? 0, assignment.maxScore),
                0,
              ) / gradedSubmissions.length,
            )

      return {
        id: assignment.id,
        title: assignment.title,
        dueAt: assignment.dueAt,
        maxScore: assignment.maxScore,
        gradedCount,
        submittedCount,
        pendingCount: Math.max(submittedCount - gradedCount, 0),
        averageScore,
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

function getStudentResultRecords(
  assignmentResults: StudentAssignmentResult[],
  examResults: ReleasedExamResultDto[],
) {
  return [
    ...assignmentResults.map(
      (result) =>
        ({
          ...result,
          kind: "assignment",
          date: result.gradedAt,
        }) satisfies ResultRecord,
    ),
    ...examResults.map(
      (result) =>
        ({
          ...result,
          kind: "exam",
          date:
            result.releasedAt ??
            result.submittedAt ??
            new Date(0).toISOString(),
        }) satisfies ResultRecord,
    ),
  ].sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
}

function getStudentAverage(records: ResultRecord[]) {
  if (records.length === 0) return null

  return Math.round(
    records.reduce((sum, record) => sum + getRecordPercentage(record), 0) /
      records.length,
  )
}

function getAssignmentAverage(results: StudentAssignmentResult[]) {
  if (results.length === 0) return null

  return Math.round(
    results.reduce(
      (sum, result) => sum + percentage(result.score, result.maxScore),
      0,
    ) / results.length,
  )
}

function getExamAverage(results: ReleasedExamResultDto[]) {
  if (results.length === 0) return null

  return Math.round(
    results.reduce((sum, result) => sum + getExamPercentage(result), 0) /
      results.length,
  )
}

function getRecordPercentage(record: ResultRecord) {
  if (record.kind === "assignment") {
    return percentage(record.score, record.maxScore)
  }

  return getExamPercentage(record)
}

function getExamPercentage(result: ReleasedExamResultDto) {
  return percentage(result.totalScore ?? 0, result.totalPoints)
}

function formatRecordScore(record: ResultRecord) {
  if (record.kind === "assignment") {
    return `${percentage(record.score, record.maxScore)}%`
  }

  return `${getExamPercentage(record)}%`
}

function percentage(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0
  }

  return Math.round((value / total) * 100)
}

function formatDateTime(value: string) {
  return format(new Date(value), "MMM d, h:mm a")
}

function formatExamStatus(status: string) {
  if (status === "live") return "Live"
  if (status === "ended") return "Ended"
  return "Upcoming"
}

function formatAttemptStatus(status: ReleasedExamResultDto["status"]) {
  if (status === "graded") return "Graded"
  if (status === "voided") return "Voided"
  if (status === "submitted") return "Submitted"
  return "In progress"
}

function formatIntegrityStatus(
  status: ReleasedExamResultDto["integrityStatus"],
) {
  if (status === "flagged") return "Flagged"
  if (status === "voided") return "Voided"
  if (status === "reported") return "Reported"
  return "Clear"
}
