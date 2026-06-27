"use client"

import { format } from "date-fns"
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  SearchX,
  ShieldCheck,
  Trophy,
  Users,
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
import { Switch } from "@/components/ui/switch"
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
  type ClassAssignmentSubmission,
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
  ManagerExamDetailDto,
  ManagerAttemptSummaryDto,
  ReleasedExamResultDto,
} from "@/lib/exams/types"
import { resolveClassFeatures } from "@/lib/features/feature-registry"
import { useApp } from "@/lib/store"
import type { ClassProfile } from "@/lib/supabase/classes"
import { cn } from "@/lib/utils"

type StudentAssignmentResult = {
  id: string
  title: string
  score: number
  maxScore: number
  gradedAt: string
  feedback: string
}

type ResultRecord =
  | (StudentAssignmentResult & { kind: "assignment"; date: string })
  | (ReleasedExamResultDto & { kind: "exam"; date: string })

type StudentResultsSummary = {
  profile: ClassProfile
  assignmentResults: StudentAssignmentResult[]
  examResults: ReleasedExamResultDto[]
  records: ResultRecord[]
  average: number | null
}

type SharedStudentSummary = {
  id: string
  displayName: string
  email: string
  assignmentCount: number
  examCount: number
  resultCount: number
  average: number | null
}

type SharedResultsSummaryData = {
  students: SharedStudentSummary[]
}

type SharedSummaryCacheEntry = {
  data: SharedResultsSummaryData | null
  request: Promise<SharedResultsSummaryData> | null
}

type ManagerExamDetailCacheEntry = {
  data: ManagerExamDetailDto | null
  request: Promise<ManagerExamDetailDto> | null
}

const sharedSummaryCache = new Map<string, SharedSummaryCacheEntry>()
const sharedSummaryListeners = new Map<
  string,
  Set<(data: SharedResultsSummaryData) => void>
>()
const managerExamDetailCache = new Map<string, ManagerExamDetailCacheEntry>()
const managerExamDetailListeners = new Map<
  string,
  Set<(data: ManagerExamDetailDto) => void>
>()

export function ClassResultsScreen({ classId }: { classId: string }) {
  const {
    authUser,
    currentUser,
    activeOrganization,
    featureDefinitions,
    refreshOrganizationClasses,
  } = useApp()
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
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  )
  const [sharedSummaryData, setSharedSummaryData] =
    useState<SharedResultsSummaryData | null>(null)
  const [sharedSummaryError, setSharedSummaryError] = useState<string | null>(
    null,
  )
  const [sharedSummaryLoading, setSharedSummaryLoading] = useState(false)
  const [examDetailsById, setExamDetailsById] = useState<
    Map<string, ManagerExamDetailDto>
  >(new Map())
  const [examDetailsLoading, setExamDetailsLoading] = useState(false)
  const [examDetailsError, setExamDetailsError] = useState<string | null>(null)
  const [isSavingResultsVisibility, setIsSavingResultsVisibility] =
    useState(false)

  const resultsVisibleToStudents = Boolean(
    classRow?.results_visible_to_students,
  )
  const summaryViewerId = authUser?.id ?? currentUser.id ?? "anonymous"
  const sharedSummaryCacheKey = getSharedSummaryCacheKey(
    classId,
    summaryViewerId,
  )
  const canControlResultsVisibility = Boolean(
    canManage &&
      (currentUser.role === "admin" ||
        classRow?.teacher_can_toggle_results_visibility),
  )
  const canViewSharedSummary = !canManage && resultsVisibleToStudents

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
  const managerExamSummaries =
    canManage && examApi.data?.canManage ? examApi.data.manager.exams : []
  const rosterExamSummaries = managerExamSummaries
  const rosterExamIdsKey = rosterExamSummaries
    .map((exam) => exam.id)
    .sort()
    .join("|")
  const managerExamDetailCachePrefix = getManagerExamDetailCachePrefix({
    classId,
    userId: summaryViewerId,
  })
  const rosterExamResults = useMemo(
    () =>
      getRosterExamResults({
        details: Array.from(examDetailsById.values()),
      }),
    [examDetailsById],
  )
  const rosterStudentSummaries = useMemo(
    () =>
      classRow
        ? getRosterStudentSummaries({
            students: classRow.students,
            assignments: assignmentsApi.assignments,
            examResults: rosterExamResults,
          })
        : [],
    [assignmentsApi.assignments, classRow, rosterExamResults],
  )
  const selectedStudent =
    rosterStudentSummaries.find(
      (student) => student.profile.id === selectedStudentId,
    ) ??
    rosterStudentSummaries[0] ??
    null
  const selectedStudentExamTitle = selectedExamResult
    ? (selectedStudent?.profile.display_name ?? null)
    : null
  const pageError =
    assignmentsApi.errorMessage ??
    examApi.errorMessage ??
    sharedSummaryError ??
    examDetailsError

  useEffect(() => {
    if (!pageError) return

    toast({
      title: "Could not load results",
      description: pageError,
      variant: "destructive",
    })
  }, [pageError])

  useEffect(() => {
    if (!canManage || rosterStudentSummaries.length === 0) return
    if (
      selectedStudentId &&
      rosterStudentSummaries.some(
        (student) => student.profile.id === selectedStudentId,
      )
    ) {
      return
    }

    setSelectedStudentId(rosterStudentSummaries[0]?.profile.id ?? null)
  }, [canManage, rosterStudentSummaries, selectedStudentId])

  useEffect(() => {
    if (!canViewSharedSummary) {
      setSharedSummaryData(null)
      setSharedSummaryError(null)
      setSharedSummaryLoading(false)
      return
    }

    let cancelled = false
    const cachedSummary = readSharedSummaryCache(sharedSummaryCacheKey)
    if (cachedSummary) {
      setSharedSummaryData(cachedSummary)
      setSharedSummaryLoading(false)
    } else {
      setSharedSummaryData(null)
      setSharedSummaryLoading(true)
    }
    setSharedSummaryError(null)

    const unsubscribe = subscribeSharedSummaryCache(
      sharedSummaryCacheKey,
      (nextSummary) => {
        if (cancelled) return
        setSharedSummaryData(nextSummary)
        setSharedSummaryLoading(false)
        setSharedSummaryError(null)
      },
    )

    loadSharedClassSummary({
      classId,
      cacheKey: sharedSummaryCacheKey,
      force: true,
    })
      .then((nextSummary) => {
        if (!cancelled) setSharedSummaryData(nextSummary)
      })
      .catch((error) => {
        if (!cancelled) {
          if (!cachedSummary) setSharedSummaryData(null)
          setSharedSummaryError(
            error instanceof Error
              ? error.message
              : "Could not load class result summary.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setSharedSummaryLoading(false)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [canViewSharedSummary, classId, sharedSummaryCacheKey])

  useEffect(() => {
    if (!canManage || !examFeatureEnabled) {
      setExamDetailsById(new Map())
      setExamDetailsError(null)
      setExamDetailsLoading(false)
      return
    }

    const examIds = rosterExamIdsKey ? rosterExamIdsKey.split("|") : []
    if (examIds.length === 0) {
      setExamDetailsById(new Map())
      setExamDetailsError(null)
      setExamDetailsLoading(false)
      return
    }

    let cancelled = false
    const cachedDetails = readManagerExamDetailCaches({
      cachePrefix: managerExamDetailCachePrefix,
      examIds,
    })
    if (cachedDetails.length > 0) {
      setExamDetailsById(
        new Map(cachedDetails.map((detail) => [detail.exam.id, detail])),
      )
      setExamDetailsLoading(false)
    } else {
      setExamDetailsById(new Map())
      setExamDetailsLoading(true)
    }
    setExamDetailsError(null)

    const unsubscribes = examIds.map((examId) =>
      subscribeManagerExamDetailCache(
        getManagerExamDetailCacheKey({
          cachePrefix: managerExamDetailCachePrefix,
          examId,
        }),
        (detail) => {
          if (cancelled) return
          setExamDetailsById((current) => {
            const next = new Map(current)
            next.set(detail.exam.id, detail)
            return next
          })
          setExamDetailsError(null)
        },
      ),
    )

    loadManagerExamDetails({
      classId,
      cachePrefix: managerExamDetailCachePrefix,
      examIds,
      force: true,
    })
      .then((details) => {
        if (cancelled) return
        setExamDetailsById(
          new Map(details.map((detail) => [detail.exam.id, detail])),
        )
      })
      .catch((error) => {
        if (!cancelled) {
          if (cachedDetails.length === 0) setExamDetailsById(new Map())
          setExamDetailsError(
            error instanceof Error
              ? error.message
              : "Could not load exam results.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setExamDetailsLoading(false)
      })

    return () => {
      cancelled = true
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [
    canManage,
    classId,
    examFeatureEnabled,
    managerExamDetailCachePrefix,
    rosterExamIdsKey,
  ])

  async function updateResultsVisibility(visible: boolean) {
    if (!classRow || !canControlResultsVisibility) return

    setIsSavingResultsVisibility(true)
    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classRow.id)}/results/visibility`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibleToStudents: visible }),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Could not update results visibility.",
        )
      }

      await refreshOrganizationClasses({ force: true })
      toast({
        title: visible ? "Class results shown" : "Class results hidden",
      })
    } catch (error) {
      toast({
        title: "Could not update results visibility",
        description:
          error instanceof Error
            ? error.message
            : "Could not update results visibility.",
        variant: "destructive",
      })
    } finally {
      setIsSavingResultsVisibility(false)
    }
  }

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

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <ClassPageHeader title={cls.name} code={cls.code} section="Results" />

      {canManage ? (
        <RosterResultsView
          canManage={canManage}
          canControlVisibility={canControlResultsVisibility}
          resultsVisibleToStudents={resultsVisibleToStudents}
          isSavingVisibility={isSavingResultsVisibility}
          isLoading={
            assignmentsApi.isLoading ||
            (examFeatureEnabled &&
              (canManage ? examApi.isLoading && !examApi.data : false)) ||
            examDetailsLoading
          }
          students={rosterStudentSummaries}
          selectedStudent={selectedStudent}
          onSelectStudent={(studentId) => setSelectedStudentId(studentId)}
          onSelectExam={setSelectedExamResult}
          onToggleVisibility={updateResultsVisibility}
        />
      ) : (
        <div className="space-y-6">
          <StudentResultsView
            assignmentsLoading={assignmentsApi.isLoading}
            examFeatureEnabled={examFeatureEnabled}
            examsLoading={examApi.isLoading && !examApi.data}
            assignmentResults={studentAssignmentResults}
            examResults={studentExamResults}
            onSelectExam={setSelectedExamResult}
          />
          {resultsVisibleToStudents ? (
            <SharedClassSummaryCard
              isLoading={sharedSummaryLoading}
              students={sharedSummaryData?.students ?? []}
            />
          ) : null}
        </div>
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
                  {selectedStudentExamTitle
                    ? `${selectedStudentExamTitle}'s exam details, including per-question grading.`
                    : "Exam details, including per-question grading."}
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

function RosterResultsView({
  canManage,
  canControlVisibility,
  resultsVisibleToStudents,
  isSavingVisibility,
  isLoading,
  students,
  selectedStudent,
  onSelectStudent,
  onSelectExam,
  onToggleVisibility,
}: {
  canManage: boolean
  canControlVisibility: boolean
  resultsVisibleToStudents: boolean
  isSavingVisibility: boolean
  isLoading: boolean
  students: StudentResultsSummary[]
  selectedStudent: StudentResultsSummary | null
  onSelectStudent: (studentId: string) => void
  onSelectExam: (result: ReleasedExamResultDto) => void
  onToggleVisibility: (visible: boolean) => void
}) {
  const classAverage = getRosterAverage(students)
  const gradedAssignments = students.reduce(
    (total, student) => total + student.assignmentResults.length,
    0,
  )
  const releasedExams = students.reduce(
    (total, student) => total + student.examResults.length,
    0,
  )

  return (
    <div className="space-y-6">
      {canManage && canControlVisibility ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
            <Switch
              checked={resultsVisibleToStudents}
              disabled={isSavingVisibility}
              onCheckedChange={onToggleVisibility}
              aria-label="Show class results to students"
            />
            <span className="text-sm font-medium text-foreground">
              Show class results to students
            </span>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {isSavingVisibility ? <Spinner /> : null}
            </span>
            <Badge variant={resultsVisibleToStudents ? "default" : "secondary"}>
              {resultsVisibleToStudents ? "On" : "Off"}
            </Badge>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Students"
          value={students.length}
          detail="In this class"
        />
        <MetricCard
          icon={Trophy}
          label="Class average"
          value={classAverage === null ? "-" : `${classAverage}%`}
          detail="Across visible results"
        />
        <MetricCard
          icon={FileText}
          label="Assignment grades"
          value={gradedAssignments}
          detail="Graded submissions"
        />
        <MetricCard
          icon={ClipboardList}
          label="Exam results"
          value={releasedExams}
          detail="Scored attempts"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
              Students
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingPanel label="Loading student results..." />
            ) : students.length === 0 ? (
              <EmptyPanel
                icon={SearchX}
                title="No student results"
                description="Students will appear here once they are added to this class."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="text-right">Assignments</TableHead>
                    <TableHead className="text-right">Exams</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow
                      key={student.profile.id}
                      className={cn(
                        "cursor-pointer",
                        selectedStudent?.profile.id === student.profile.id &&
                          "bg-muted/60",
                      )}
                      onClick={() => onSelectStudent(student.profile.id)}
                    >
                      <TableCell className="min-w-56">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            {student.profile.display_name || "Unnamed student"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {student.profile.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {student.average === null ? "-" : `${student.average}%`}
                      </TableCell>
                      <TableCell className="text-right">
                        {student.assignmentResults.length}
                      </TableCell>
                      <TableCell className="text-right">
                        {student.examResults.length}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              Student Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {!selectedStudent ? (
              <EmptyPanel
                icon={SearchX}
                title="Select a student"
                description="Choose a student to review their detailed results."
              />
            ) : (
              <>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {selectedStudent.profile.display_name || "Unnamed student"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedStudent.profile.email}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <ScoreBreakdownRow
                    label="Overall"
                    count={selectedStudent.records.length}
                    average={selectedStudent.average}
                  />
                  <ScoreBreakdownRow
                    label="Assignments"
                    count={selectedStudent.assignmentResults.length}
                    average={getAssignmentAverage(
                      selectedStudent.assignmentResults,
                    )}
                  />
                  <ScoreBreakdownRow
                    label="Exams"
                    count={selectedStudent.examResults.length}
                    average={getExamAverage(selectedStudent.examResults)}
                  />
                </div>
                <div className="space-y-3">
                  {selectedStudent.records.length === 0 ? (
                    <EmptyPanel
                      icon={SearchX}
                      title="No results yet"
                      description="Graded assignments and released exams will appear here."
                    />
                  ) : (
                    selectedStudent.records.map((record) => (
                      <StudentResultRow
                        key={`${record.kind}-${record.kind === "exam" ? record.attemptId : record.id}`}
                        record={record}
                        onSelectExam={onSelectExam}
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SharedClassSummaryCard({
  isLoading,
  students,
}: {
  isLoading: boolean
  students: SharedStudentSummary[]
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-muted-foreground" />
          Class Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <LoadingPanel label="Loading class summary..." />
        ) : students.length === 0 ? (
          <EmptyPanel
            icon={SearchX}
            title="No class results"
            description="Classmate grade summaries will appear here after results are released."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="text-right">Assignments</TableHead>
                <TableHead className="text-right">Exams</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="min-w-56">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {student.displayName || "Unnamed student"}
                      </p>
                      {student.email ? (
                        <p className="text-xs text-muted-foreground">
                          {student.email}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {student.average === null ? "-" : `${student.average}%`}
                  </TableCell>
                  <TableCell className="text-right">
                    {student.assignmentCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {student.examCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
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

function getRosterStudentSummaries({
  students,
  assignments,
  examResults,
}: {
  students: ClassProfile[]
  assignments: ClassAssignment[]
  examResults: Array<ReleasedExamResultDto & { studentUserId: string }>
}) {
  return students
    .map((student) => {
      const assignmentResults = getStudentAssignmentResultsForUser(
        assignments,
        student.id,
      )
      const studentExamResults = examResults
        .filter((result) => result.studentUserId === student.id)
        .sort(compareExamResultsByDate)
      const records = getStudentResultRecords(
        assignmentResults,
        studentExamResults,
      )

      return {
        profile: student,
        assignmentResults,
        examResults: studentExamResults,
        records,
        average: getStudentAverage(records),
      } satisfies StudentResultsSummary
    })
    .sort((left, right) =>
      (left.profile.display_name || left.profile.email).localeCompare(
        right.profile.display_name || right.profile.email,
      ),
    )
}

function getStudentAssignmentResultsForUser(
  assignments: ClassAssignment[],
  studentUserId: string,
) {
  return assignments
    .flatMap((assignment) => {
      const submission = assignment.submissions.find(
        (candidate) => candidate.studentUserId === studentUserId,
      )
      if (!submission?.gradedAt || submission.score === null) return []

      return [
        toStudentAssignmentResult(assignment, submission),
      ] satisfies StudentAssignmentResult[]
    })
    .sort(
      (left, right) => Date.parse(right.gradedAt) - Date.parse(left.gradedAt),
    )
}

function toStudentAssignmentResult(
  assignment: ClassAssignment,
  submission: ClassAssignmentSubmission,
) {
  return {
    id: assignment.id,
    title: assignment.title,
    score: submission.score ?? 0,
    maxScore: assignment.maxScore,
    gradedAt: submission.gradedAt ?? submission.submittedAt,
    feedback: submission.feedback,
  } satisfies StudentAssignmentResult
}

function getRosterExamResults({
  details,
}: {
  details: ManagerExamDetailDto[]
}) {
  return details.flatMap((detail) =>
    detail.attempts
      .filter(
        (attempt) =>
          attempt.totalScore !== null &&
          (attempt.resultsReleasedAt || attempt.status === "graded"),
      )
      .map((attempt) => ({
        ...toReleasedExamResult(detail, attempt),
        studentUserId: attempt.studentUserId,
      })),
  )
}

function toReleasedExamResult(
  detail: ManagerExamDetailDto,
  attempt: ManagerAttemptSummaryDto,
) {
  return {
    attemptId: attempt.id,
    examId: detail.exam.id,
    title: detail.exam.title,
    status: attempt.status,
    totalScore: attempt.totalScore,
    totalPoints: detail.exam.totalPoints,
    submittedAt: attempt.submittedAt,
    releasedAt: attempt.resultsReleasedAt,
    gradedAt: attempt.resultsReleasedAt,
    isReleased: Boolean(attempt.resultsReleasedAt),
    needsManualReview: attempt.needsManualReview,
    integrityStatus: attempt.integrityStatus,
    questions: detail.questions.map((question) => {
      const answer = attempt.answers.find(
        (candidate) => candidate.questionId === question.id,
      )
      const score = answer?.teacherScore ?? answer?.autoScore ?? null
      const selected = normalizeAnswerValue(answer?.answer ?? null)
      const correct = normalizeAnswerValue(question.correctAnswer)

      return {
        id: question.id,
        position: question.position,
        prompt: question.prompt,
        type: question.type,
        points: question.points,
        score,
        status: getQuestionResultStatus(score, question.points, selected),
        selectedOptionIndex: typeof selected === "number" ? selected : null,
        selectedTextAnswer: typeof selected === "string" ? selected : null,
        correctOptionIndex: typeof correct === "number" ? correct : null,
        correctTextAnswer: typeof correct === "string" ? correct : null,
      }
    }),
  } satisfies ReleasedExamResultDto
}

function normalizeAnswerValue(value: unknown) {
  if (typeof value === "number") return value
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return null

  const record = value as Record<string, unknown>
  if (typeof record.selectedOptionIndex === "number") {
    return record.selectedOptionIndex
  }
  if (typeof record.optionIndex === "number") return record.optionIndex
  if (typeof record.answer === "number" || typeof record.answer === "string") {
    return record.answer
  }
  if (typeof record.text === "string") return record.text

  return null
}

function getQuestionResultStatus(
  score: number | null,
  points: number,
  selected: number | string | null,
) {
  if (selected === null || selected === "") return "unanswered"
  if (score === null) return "reviewed"
  if (score >= points) return "correct"
  if (score <= 0) return "incorrect"
  return "reviewed"
}

function compareExamResultsByDate(
  left: ReleasedExamResultDto,
  right: ReleasedExamResultDto,
) {
  const leftDate =
    left.releasedAt ?? left.submittedAt ?? new Date(0).toISOString()
  const rightDate =
    right.releasedAt ?? right.submittedAt ?? new Date(0).toISOString()

  return Date.parse(rightDate) - Date.parse(leftDate)
}

function getRosterAverage(students: StudentResultsSummary[]) {
  const averages = students
    .map((student) => student.average)
    .filter((average): average is number => average !== null)

  if (averages.length === 0) return null

  return Math.round(
    averages.reduce((total, average) => total + average, 0) / averages.length,
  )
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

async function loadManagerExamDetails({
  classId,
  cachePrefix,
  examIds,
  force = false,
}: {
  classId: string
  cachePrefix: string
  examIds: string[]
  force?: boolean
}) {
  return Promise.all(
    examIds.map((examId) =>
      loadManagerExamDetail({
        classId,
        cacheKey: getManagerExamDetailCacheKey({ cachePrefix, examId }),
        examId,
        force,
      }),
    ),
  )
}

async function loadManagerExamDetail({
  classId,
  cacheKey,
  examId,
  force = false,
}: {
  classId: string
  cacheKey: string
  examId: string
  force?: boolean
}) {
  const cached = managerExamDetailCache.get(cacheKey)

  if (!force && cached?.data) return cached.data
  if (cached?.request) return cached.request

  const request = fetchManagerExamDetail(classId, examId)
    .then((detail) => {
      writeManagerExamDetailCache(cacheKey, detail)
      return detail
    })
    .finally(() => {
      const latestCached = managerExamDetailCache.get(cacheKey)
      if (latestCached?.request === request) {
        latestCached.request = null
      }
    })

  managerExamDetailCache.set(cacheKey, {
    data: cached?.data ?? null,
    request,
  })

  return request
}

function readManagerExamDetailCaches({
  cachePrefix,
  examIds,
}: {
  cachePrefix: string
  examIds: string[]
}) {
  return examIds.flatMap((examId) => {
    const detail =
      managerExamDetailCache.get(
        getManagerExamDetailCacheKey({ cachePrefix, examId }),
      )?.data ?? null

    return detail ? [detail] : []
  })
}

function subscribeManagerExamDetailCache(
  cacheKey: string,
  listener: (data: ManagerExamDetailDto) => void,
) {
  const listeners = managerExamDetailListeners.get(cacheKey) ?? new Set()
  listeners.add(listener)
  managerExamDetailListeners.set(cacheKey, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      managerExamDetailListeners.delete(cacheKey)
    }
  }
}

function writeManagerExamDetailCache(
  cacheKey: string,
  data: ManagerExamDetailDto,
) {
  const current = managerExamDetailCache.get(cacheKey)
  managerExamDetailCache.set(cacheKey, {
    data,
    request: current?.request ?? null,
  })

  for (const listener of managerExamDetailListeners.get(cacheKey) ?? []) {
    listener(data)
  }
}

function getManagerExamDetailCachePrefix({
  classId,
  userId,
}: {
  classId: string
  userId: string
}) {
  return `${classId}:manager-exam-detail:${userId}`
}

function getManagerExamDetailCacheKey({
  cachePrefix,
  examId,
}: {
  cachePrefix: string
  examId: string
}) {
  return `${cachePrefix}:${examId}`
}

async function fetchManagerExamDetail(classId: string, examId: string) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(
      classId,
    )}/exams?detailExamId=${encodeURIComponent(examId)}`,
  )
  const payload = (await response.json().catch(() => null)) as {
    exam?: ManagerExamDetailDto
    error?: string
  } | null

  if (!response.ok || !payload?.exam) {
    throw new Error(payload?.error ?? "Could not load exam results.")
  }

  return payload.exam
}

async function loadSharedClassSummary({
  classId,
  cacheKey,
  force = false,
}: {
  classId: string
  cacheKey: string
  force?: boolean
}) {
  const cached = sharedSummaryCache.get(cacheKey)

  if (!force && cached?.data) return cached.data
  if (cached?.request) return cached.request

  const request = fetchSharedClassSummary(classId)
    .then((summary) => {
      writeSharedSummaryCache(cacheKey, summary)
      return summary
    })
    .finally(() => {
      const latestCached = sharedSummaryCache.get(cacheKey)
      if (latestCached?.request === request) {
        latestCached.request = null
      }
    })

  sharedSummaryCache.set(cacheKey, {
    data: cached?.data ?? null,
    request,
  })

  return request
}

function readSharedSummaryCache(cacheKey: string) {
  return sharedSummaryCache.get(cacheKey)?.data ?? null
}

function subscribeSharedSummaryCache(
  cacheKey: string,
  listener: (data: SharedResultsSummaryData) => void,
) {
  const listeners = sharedSummaryListeners.get(cacheKey) ?? new Set()
  listeners.add(listener)
  sharedSummaryListeners.set(cacheKey, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      sharedSummaryListeners.delete(cacheKey)
    }
  }
}

function writeSharedSummaryCache(
  cacheKey: string,
  data: SharedResultsSummaryData,
) {
  const current = sharedSummaryCache.get(cacheKey)
  sharedSummaryCache.set(cacheKey, {
    data,
    request: current?.request ?? null,
  })

  for (const listener of sharedSummaryListeners.get(cacheKey) ?? []) {
    listener(data)
  }
}

function getSharedSummaryCacheKey(classId: string, userId: string) {
  return `${classId}:shared-summary:${userId}`
}

async function fetchSharedClassSummary(classId: string) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/results/summary`,
  )
  const payload = (await response.json().catch(() => null)) as
    | (SharedResultsSummaryData & { error?: string })
    | null

  if (!response.ok || !payload?.students) {
    throw new Error(payload?.error ?? "Could not load class result summary.")
  }

  return { students: payload.students } satisfies SharedResultsSummaryData
}
