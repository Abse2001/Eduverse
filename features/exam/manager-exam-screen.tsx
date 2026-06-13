"use client"

import { format } from "date-fns"
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  Loader2,
  PlusCircle,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { canTeacherGradeQuestion } from "@/lib/exams/grading"
import { formatIntegrityEvent } from "@/lib/exams/integrity"
import type {
  GradeAttemptInput,
  ManagerExamDetailDto,
  ManagerExamSummaryDto,
  UpsertExamInput,
  UpsertExamQuestionInput,
} from "@/lib/exams/types"
import type { Class } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import {
  buildGradeInputsForAttempt,
  getAttemptGradeIndicator,
  getAttemptMonitorStatus,
  getCurrentAttemptsByStudent,
  getEndedExamApprovalStatus,
  getExamMonitorSummary,
  isAttemptSuspicious,
  resolveSelectedAttemptId,
} from "./manager-detail-state"
import type { UseClassExamResult } from "./use-class-exam"
import { toast } from "@/hooks/use-toast"

type QuestionEditorState = {
  type: UpsertExamQuestionInput["type"]
  prompt: string
  points: string
  options: string[]
  correctAnswerText: string
}

type ExamFormState = {
  title: string
  durationMinutes: string
  startAt: string
  passcode: string
  questions: QuestionEditorState[]
}

type AiExamQuestionDraft = {
  type: "mcq" | "short"
  prompt: string
  points: number
  options: string[]
  correctAnswer: string | number | null
}

type AiExamDraft = {
  title: string
  durationMinutes: number
  questions: AiExamQuestionDraft[]
}

type AiExamMode = "full_exam" | "questions"

const DEFAULT_MCQ_OPTIONS = ["Option A", "Option B"] as const
const EXAM_TITLE_REQUIRED_MESSAGE = "Exam title is required."
const EXAM_FORM_FIELD_ATTRIBUTE = "data-exam-form-field"

class ExamFormValidationError extends Error {
  fieldKey: string

  constructor(message: string, fieldKey: string) {
    super(message)
    this.name = "ExamFormValidationError"
    this.fieldKey = fieldKey
  }
}

function getExamFormField(fieldKey: string) {
  if (typeof document === "undefined") return null

  return document.querySelector<HTMLElement>(
    `[${EXAM_FORM_FIELD_ATTRIBUTE}="${fieldKey}"]`,
  )
}

function createQuestionEditorState(
  type: QuestionEditorState["type"] = "mcq",
): QuestionEditorState {
  return {
    type,
    prompt: "",
    points: "10",
    options: type === "mcq" ? [...DEFAULT_MCQ_OPTIONS] : [],
    correctAnswerText: type === "mcq" ? "1" : "",
  }
}

const EMPTY_FORM: ExamFormState = {
  title: "",
  durationMinutes: "60",
  startAt: "",
  passcode: "",
  questions: [createQuestionEditorState("mcq")],
}

export function ManagerExamScreen({
  cls,
  examApi,
}: {
  cls: Pick<Class, "id" | "name" | "code">
  examApi: UseClassExamResult
}) {
  const {
    data,
    isLoading,
    isRefreshing,
    isMutating,
    errorMessage,
    createExam,
    updateExam,
    publishExam,
    deleteExam,
    grantRetake,
    getExamDetail,
    gradeAttempt,
    updateIntegrity,
  } = examApi
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [form, setForm] = useState<ExamFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [invalidFormField, setInvalidFormField] = useState<string | null>(null)
  const [editingExam, setEditingExam] = useState<ManagerExamSummaryDto | null>(
    null,
  )
  const [editingPasscodeProtected, setEditingPasscodeProtected] =
    useState(false)
  const [detailExamId, setDetailExamId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ManagerExamDetailDto | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isDetailRefreshing, setIsDetailRefreshing] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    null,
  )
  const [gradeInputs, setGradeInputs] = useState<Record<string, string>>({})
  const [isAiDraftOpen, setIsAiDraftOpen] = useState(false)
  const [aiDraftPrompt, setAiDraftPrompt] = useState("")
  const [aiDraftError, setAiDraftError] = useState<string | null>(null)
  const [aiMode, setAiMode] = useState<AiExamMode>("full_exam")
  const [isGeneratingExamAi, setIsGeneratingExamAi] = useState(false)

  const exams = data?.canManage ? data.manager.exams : []
  const currentAttempts = detail
    ? getCurrentAttemptsByStudent(detail.attempts)
    : []
  const selectedAttempt = currentAttempts.find(
    (attempt) => attempt.id === selectedAttemptId,
  )
  const isLiveMonitor = detail?.exam.status === "live"
  const monitorSummary = detail ? getExamMonitorSummary(currentAttempts) : null
  const currentAttemptCount = currentAttempts.length
  const suspiciousAttemptCount =
    currentAttempts.filter(isAttemptSuspicious).length
  const detailApprovalStatus = detail
    ? getEndedExamApprovalStatus(detail.exam)
    : null
  const selectedAttemptMonitorStatus = selectedAttempt
    ? getAttemptMonitorStatus(selectedAttempt)
    : null
  const selectedAttemptGradeIndicator = selectedAttempt
    ? getAttemptGradeIndicator(selectedAttempt)
    : null
  const canGradeSelectedAttempt =
    selectedAttempt !== undefined &&
    selectedAttempt !== null &&
    selectedAttempt.status !== "in_progress" &&
    selectedAttempt.status !== "voided" &&
    !selectedAttempt.resultsReleasedAt
  const canGrantSelectedRetake =
    selectedAttempt !== undefined &&
    selectedAttempt !== null &&
    selectedAttempt.status !== "in_progress" &&
    selectedAttempt.availableRetakeCount === 0

  useEffect(() => {
    if (!errorMessage) return

    toast({
      title: "Could not load exams",
      description: errorMessage,
      variant: "destructive",
    })
  }, [errorMessage])

  useEffect(() => {
    if (!aiDraftError) return

    toast({
      title: "Could not generate exam draft",
      description: aiDraftError,
      variant: "destructive",
    })
  }, [aiDraftError])

  useEffect(() => {
    if (!formError) return

    toast({
      title: "Could not save exam",
      description: formError,
      variant: "destructive",
    })
  }, [formError])

  useEffect(() => {
    if (!detailError) return

    toast({
      title: "Could not load exam detail",
      description: detailError,
      variant: "destructive",
    })
  }, [detailError])

  async function openDetail(examId: string) {
    setDetailExamId(examId)
    setDetail(null)
    setDetailError(null)
    setSelectedAttemptId(null)
    setIsDetailLoading(true)

    try {
      const nextDetail = await getExamDetail(examId)
      applyDetailState(nextDetail, null)
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Could not load exam detail.",
      )
    } finally {
      setIsDetailLoading(false)
    }
  }

  async function refreshDetail(examId: string) {
    setIsDetailRefreshing(true)
    setDetailError(null)

    try {
      const nextDetail = await getExamDetail(examId)
      applyDetailState(nextDetail, selectedAttemptId)
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : "Could not refresh exam detail.",
      )
    } finally {
      setIsDetailRefreshing(false)
    }
  }

  function applyDetailState(
    nextDetail: ManagerExamDetailDto,
    nextSelectedAttemptId: string | null,
  ) {
    setDetail(nextDetail)
    const currentAttempts = getCurrentAttemptsByStudent(nextDetail.attempts)
    const previouslySelectedAttempt = nextSelectedAttemptId
      ? nextDetail.attempts.find(
          (attempt) => attempt.id === nextSelectedAttemptId,
        )
      : null
    const currentAttemptForSelectedStudent = previouslySelectedAttempt
      ? currentAttempts.find(
          (attempt) =>
            attempt.studentUserId === previouslySelectedAttempt.studentUserId,
        )
      : null
    const resolvedAttemptId = resolveSelectedAttemptId({
      attempts: currentAttempts,
      currentSelectedAttemptId:
        currentAttemptForSelectedStudent?.id ??
        nextSelectedAttemptId ??
        currentAttempts[0]?.id ??
        null,
    })
    const resolvedAttempt =
      currentAttempts.find((attempt) => attempt.id === resolvedAttemptId) ??
      null
    setSelectedAttemptId(resolvedAttemptId)
    setGradeInputs(buildGradeInputsForAttempt(resolvedAttempt))
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setInvalidFormField(null)
    setEditingExam(null)
    setEditingPasscodeProtected(false)
  }

  function openCreate() {
    resetForm()
    setIsCreateOpen(true)
  }

  function openAiDraft(mode: AiExamMode) {
    setAiMode(mode)
    setAiDraftPrompt("")
    setAiDraftError(null)
    setIsAiDraftOpen(true)
  }

  async function openEdit(examId: string) {
    try {
      setFormError(null)
      setInvalidFormField(null)
      const nextDetail = await getExamDetail(examId)
      hydrateFormFromDetail(nextDetail)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not load exam detail.",
      )
    }
  }

  function hydrateFormFromDetail(nextDetail: ManagerExamDetailDto) {
    setEditingExam(nextDetail.exam)
    setEditingPasscodeProtected(nextDetail.exam.passcodeProtected)
    setForm({
      title: nextDetail.exam.title,
      durationMinutes: String(nextDetail.exam.durationMinutes),
      startAt: toDatetimeLocalValue(nextDetail.exam.startAt),
      passcode: "",
      questions: nextDetail.questions.map((question) => ({
        type: toSupportedQuestionType(question.type),
        prompt: question.prompt,
        points: String(question.points),
        options:
          question.type === "mcq" && question.options.length > 0
            ? [...question.options]
            : [],
        correctAnswerText:
          typeof question.correctAnswer === "number"
            ? String(question.correctAnswer + 1)
            : typeof question.correctAnswer === "string"
              ? question.correctAnswer
              : "",
      })),
    })
    setIsCreateOpen(true)
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveExam({ publish: false })
  }

  async function saveExam(options: { publish: boolean }) {
    try {
      setFormError(null)
      setInvalidFormField(null)
      setSuccessMessage(null)
      const payload = toExamPayload(form, {
        editingPasscodeProtected,
      })
      if (editingExam) {
        await updateExam(editingExam.id, payload)
      } else {
        await createExam({
          ...payload,
          publish: options.publish,
        })
      }
      setIsCreateOpen(false)
      resetForm()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save exam."
      if (error instanceof ExamFormValidationError) {
        setFormError(null)
        setInvalidFormField(error.fieldKey)
        requestAnimationFrame(() => {
          const field = getExamFormField(error.fieldKey)
          field?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          })
          field?.focus()
        })
      } else {
        setFormError(message)
      }
    }
  }

  function clearInvalidFormField(fieldKey: string) {
    if (invalidFormField === fieldKey) {
      setInvalidFormField(null)
    }
  }

  async function publishSelectedExam(examId: string) {
    try {
      setDetailError(null)
      await publishExam(examId)
      setSuccessMessage("Exam published successfully.")
      if (detailExamId === examId) {
        await refreshDetail(examId)
      }
    } catch (error) {
      setSuccessMessage(null)
      setDetailError(
        error instanceof Error ? error.message : "Could not publish exam.",
      )
    }
  }

  async function deleteSelectedExam(examId: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Delete this exam and all of its attempts? This action cannot be undone.",
      )
    ) {
      return
    }

    try {
      setSuccessMessage(null)
      await deleteExam(examId)
      if (detailExamId === examId) {
        setDetailExamId(null)
        setDetail(null)
        setSelectedAttemptId(null)
      }
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Could not delete exam.",
      )
    }
  }

  async function submitGrades() {
    if (!detail || !selectedAttempt) return

    const answers: GradeAttemptInput["answers"] = detail.questions
      .filter((question) =>
        canTeacherGradeQuestion({
          questionType: question.type,
          correctAnswer: question.correctAnswer,
        }),
      )
      .map((question) => ({
        questionId: question.id,
        teacherScore:
          gradeInputs[question.id] === ""
            ? null
            : Number.parseFloat(gradeInputs[question.id] ?? ""),
      }))

    try {
      setSuccessMessage(null)
      await gradeAttempt(detail.exam.id, selectedAttempt.id, { answers })
      await refreshDetail(detail.exam.id)
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Could not save grade.",
      )
    }
  }

  async function updateSelectedIntegrity(action: "flag" | "void" | "clear") {
    if (!detail || !selectedAttempt) return

    try {
      setSuccessMessage(null)
      await updateIntegrity(detail.exam.id, selectedAttempt.id, {
        action,
      })
      await refreshDetail(detail.exam.id)
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : "Could not update integrity state.",
      )
    }
  }

  async function grantSelectedRetake() {
    if (!detail || !selectedAttempt) return

    try {
      setSuccessMessage(null)
      await grantRetake(detail.exam.id, selectedAttempt.id)
      await refreshDetail(detail.exam.id)
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Could not grant retake.",
      )
    }
  }

  async function generateExamDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = aiDraftPrompt.trim()

    if (aiMode === "full_exam" && !prompt) {
      setAiDraftError("Describe the exam you want to create.")
      return
    }

    setIsGeneratingExamAi(true)
    setAiDraftError(null)
    setFormError(null)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(cls.id)}/exams/ai/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: aiMode,
            prompt,
            title: form.title,
            durationMinutes: Number.parseInt(form.durationMinutes, 10),
            existingQuestions: form.questions,
          }),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        draft?: AiExamDraft
        error?: string
      } | null

      if (!response.ok || !payload?.draft) {
        throw new Error(payload?.error ?? "Could not generate exam.")
      }

      const nextQuestions = payload.draft.questions.map(toQuestionEditorFromAi)

      setForm((current) => {
        if (aiMode === "questions") {
          return {
            ...current,
            questions: [...current.questions, ...nextQuestions],
          }
        }

        return {
          ...current,
          title: payload.draft?.title ?? current.title,
          durationMinutes: String(
            payload.draft?.durationMinutes ?? current.durationMinutes,
          ),
          questions: nextQuestions,
        }
      })
      setIsAiDraftOpen(false)
      setIsCreateOpen(true)
    } catch (error) {
      setAiDraftError(
        error instanceof Error ? error.message : "Could not generate exam.",
      )
    } finally {
      setIsGeneratingExamAi(false)
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner />
        Loading exams...
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <ClassPageHeader
        title={cls.name}
        code={cls.code}
        section="Exams"
        detail={
          isRefreshing ? (
            <p className="text-xs text-muted-foreground">Refreshing...</p>
          ) : null
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => openAiDraft("full_exam")}
            >
              <Sparkles className="h-4 w-4" />
              AI Draft
            </Button>
            <Button size="sm" className="gap-2" onClick={openCreate}>
              <PlusCircle className="w-4 h-4" />
              New Exam
            </Button>
          </div>
        }
      />

      {successMessage && (
        <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100">
          <CheckCircle2 className="h-4 w-4 !text-emerald-600 dark:!text-emerald-300" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {exams.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No exams yet</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {exams.map((exam) => {
            const endedApprovalStatus = getEndedExamApprovalStatus(exam)

            return (
              <Card key={exam.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {exam.title}
                      </p>
                      <Badge
                        variant="secondary"
                        className={statusBadge(exam.status)}
                      >
                        {formatExamStatus(exam.status)}
                      </Badge>
                      {!exam.publishedAt && (
                        <Badge variant="outline">Draft</Badge>
                      )}
                      {endedApprovalStatus ? (
                        <Badge
                          variant="outline"
                          className={
                            endedApprovalStatus.tone === "confirmed"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          }
                        >
                          {endedApprovalStatus.label}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{exam.durationMinutes} min</span>
                      <span>{exam.totalPoints} pts</span>
                      <span>
                        {exam.startAt
                          ? format(new Date(exam.startAt), "MMM d, h:mm a")
                          : "No start time"}
                      </span>
                      <span>
                        {exam.attemptCounts.inProgress} in progress &middot;{" "}
                        {exam.attemptCounts.submitted} submitted &middot;{" "}
                        {exam.attemptCounts.graded} graded &middot;{" "}
                        {exam.attemptCounts.released} released
                      </span>
                      <span>{exam.enteredStudentCount} student entries</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openDetail(exam.id)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canEditExam(exam) && (
                      <Button size="sm" onClick={() => void openEdit(exam.id)}>
                        Edit
                      </Button>
                    )}
                    {!exam.publishedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void publishSelectedExam(exam.id)}
                      >
                        Publish
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void deleteSelectedExam(exam.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={isAiDraftOpen}
        onOpenChange={(open) => {
          setIsAiDraftOpen(open)
          if (!open && !isGeneratingExamAi) {
            setAiDraftPrompt("")
            setAiDraftError(null)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <form onSubmit={generateExamDraft} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {aiMode === "full_exam"
                  ? "Draft exam with AI"
                  : "Add AI questions"}
              </DialogTitle>
              <DialogDescription>
                {aiMode === "full_exam"
                  ? "Describe the exam topic, difficulty, question mix, and goals. The draft opens in the normal exam form."
                  : "Describe the extra questions you want. They will be added to the current exam form."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="ai-exam-prompt">Request</Label>
              <Textarea
                id="ai-exam-prompt"
                value={aiDraftPrompt}
                onChange={(event) => setAiDraftPrompt(event.target.value)}
                rows={5}
                disabled={isGeneratingExamAi}
                placeholder={
                  aiMode === "full_exam"
                    ? "Create a 60-minute midterm on JavaScript fundamentals with 6 MCQs and 2 short-answer questions."
                    : "Add 3 harder MCQs about closures and async functions."
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Review AI-generated questions and answers before publishing.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAiDraftOpen(false)}
                disabled={isGeneratingExamAi}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isGeneratingExamAi}>
                {isGeneratingExamAi ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open && !isMutating) resetForm()
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <form onSubmit={submitForm} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>
                {editingExam ? "Edit exam" : "Create exam"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Title"
                value={form.title}
                onChange={(value) => {
                  clearInvalidFormField("title")
                  setForm((current) => ({ ...current, title: value }))
                }}
                fieldKey="title"
                invalid={invalidFormField === "title"}
                required
              />
              <Field
                label="Duration (minutes)"
                type="number"
                value={form.durationMinutes}
                onChange={(value) => {
                  clearInvalidFormField("durationMinutes")
                  setForm((current) => ({ ...current, durationMinutes: value }))
                }}
                min="1"
                fieldKey="durationMinutes"
                invalid={invalidFormField === "durationMinutes"}
                required
              />
              <div className="space-y-2 sm:col-span-2">
                <StartTimeFields
                  value={form.startAt}
                  onChange={(value) => {
                    clearInvalidFormField("startAt")
                    setForm((current) => ({ ...current, startAt: value }))
                  }}
                  invalid={invalidFormField === "startAt"}
                  required
                />
              </div>
              <Field
                label="Exam passcode"
                value={form.passcode}
                onChange={(value) => {
                  clearInvalidFormField("passcode")
                  setForm((current) => ({ ...current, passcode: value }))
                }}
                minLength={4}
                fieldKey="passcode"
                invalid={invalidFormField === "passcode"}
                placeholder={
                  editingPasscodeProtected
                    ? "Passcode already set (leave empty to keep current)"
                    : "Optional, at least 4 characters"
                }
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Questions</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openAiDraft("questions")}
                    disabled={isMutating}
                  >
                    <Sparkles className="h-4 w-4" />
                    AI Questions
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addQuestion("mcq")}
                  >
                    Add MCQ
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addQuestion("short")}
                  >
                    Add Short
                  </Button>
                </div>
              </div>

              {form.questions.map((question, index) => (
                <Card key={`${question.type}-${index}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>
                        Question {index + 1} &middot;{" "}
                        {formatQuestionType(question.type)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            questions: current.questions.filter(
                              (_, questionIndex) => questionIndex !== index,
                            ),
                          }))
                        }
                        disabled={form.questions.length === 1}
                      >
                        Remove
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <RequiredLabel>Question</RequiredLabel>
                        <Textarea
                          value={question.prompt}
                          onChange={(event) => {
                            clearInvalidFormField(`question-${index}-prompt`)
                            updateQuestion(index, {
                              prompt: event.target.value,
                            })
                          }}
                          aria-invalid={
                            invalidFormField === `question-${index}-prompt`
                          }
                          data-exam-form-field={`question-${index}-prompt`}
                          rows={3}
                        />
                      </div>
                      <Field
                        label="Points"
                        type="number"
                        value={question.points}
                        onChange={(value) => {
                          clearInvalidFormField(`question-${index}-points`)
                          updateQuestion(index, { points: value })
                        }}
                        min="1"
                        fieldKey={`question-${index}-points`}
                        invalid={
                          invalidFormField === `question-${index}-points`
                        }
                        required
                      />
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={question.type}
                          onValueChange={(value: QuestionEditorState["type"]) =>
                            updateQuestionType(index, value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mcq">MCQ</SelectItem>
                            <SelectItem value="short">Short</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {question.type === "mcq" && (
                      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
                        <div className="space-y-2">
                          <RequiredLabel>Options</RequiredLabel>
                          <div className="space-y-2">
                            {question.options.map((option, optionIndex) => (
                              <div
                                key={`${index}-option-${optionIndex}`}
                                className="flex items-center gap-2"
                              >
                                <span className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-sm font-medium text-muted-foreground">
                                  {optionIndex + 1}
                                </span>
                                <Input
                                  value={option}
                                  onChange={(event) => {
                                    clearInvalidFormField(
                                      `question-${index}-option-${optionIndex}`,
                                    )
                                    updateQuestionOption(
                                      index,
                                      optionIndex,
                                      event.target.value,
                                    )
                                  }}
                                  placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                                  aria-invalid={
                                    invalidFormField ===
                                    `question-${index}-option-${optionIndex}`
                                  }
                                  data-exam-form-field={`question-${index}-option-${optionIndex}`}
                                  className="flex-1"
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() =>
                                    removeQuestionOption(index, optionIndex)
                                  }
                                  disabled={question.options.length === 1}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addQuestionOption(index)}
                          >
                            Add option
                          </Button>
                        </div>
                        <Field
                          label="Correct option number"
                          type="number"
                          value={question.correctAnswerText}
                          onChange={(value) => {
                            clearInvalidFormField(`question-${index}-correct`)
                            updateQuestion(index, {
                              correctAnswerText: value,
                            })
                          }}
                          min="1"
                          step="1"
                          fieldKey={`question-${index}-correct`}
                          invalid={
                            invalidFormField === `question-${index}-correct`
                          }
                          required
                        />
                      </div>
                    )}

                    {question.type === "short" && (
                      <div className="space-y-2">
                        <Label>Model answer</Label>
                        <Textarea
                          value={question.correctAnswerText}
                          onChange={(event) =>
                            updateQuestion(index, {
                              correctAnswerText: event.target.value,
                            })
                          }
                          rows={3}
                          placeholder="Optional. If provided, this short answer will be graded automatically."
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <DialogFooter>
              {editingExam ? (
                <Button type="submit" disabled={isMutating}>
                  {isMutating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                    disabled={isMutating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="outline" disabled={isMutating}>
                    {isMutating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save draft
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    disabled={isMutating}
                    onClick={() => void saveExam({ publish: true })}
                  >
                    {isMutating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Publishing
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Publish
                      </>
                    )}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailExamId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailExamId(null)
            setDetail(null)
            setSelectedAttemptId(null)
            setDetailError(null)
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] lg:max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{detail?.exam.title ?? "Exam detail"}</span>
              {detail ? (
                <Badge
                  variant="secondary"
                  className={statusBadge(detail.exam.status)}
                >
                  {formatExamStatus(detail.exam.status)}
                </Badge>
              ) : null}
              {detailApprovalStatus ? (
                <Badge
                  variant="outline"
                  className={
                    detailApprovalStatus.tone === "confirmed"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }
                >
                  {detailApprovalStatus.label}
                </Badge>
              ) : null}
            </DialogTitle>
            {!isLiveMonitor && (
              <DialogDescription>
                Review completed attempts, grading, and released results.
              </DialogDescription>
            )}
          </DialogHeader>

          {isDetailRefreshing && detail ? (
            <p className="text-xs text-muted-foreground">
              Refreshing detail...
            </p>
          ) : null}

          {isDetailLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Spinner />
              Loading exam detail...
            </div>
          ) : detail ? (
            <div className="grid min-h-0 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
              <div className="min-h-0 rounded-lg border bg-muted/10">
                <div className="border-b p-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border bg-background p-2">
                      <p className="text-base font-semibold">
                        {monitorSummary?.enteredStudents ?? 0}/
                        {currentAttemptCount}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Submitted
                      </p>
                    </div>
                    <div className="rounded-md border bg-background p-2">
                      <p className="text-base font-semibold">
                        {monitorSummary?.gradedStudents ?? 0}/
                        {currentAttemptCount}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Graded
                      </p>
                    </div>
                    <div className="rounded-md border bg-background p-2">
                      <p className="text-base font-semibold">
                        {suspiciousAttemptCount}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Alerts
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[32vh] overflow-y-auto p-2 lg:max-h-[58vh]">
                  {currentAttempts.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      No attempts yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {currentAttempts.map((attempt) => {
                        const monitorStatus = getAttemptMonitorStatus(attempt)
                        const gradeIndicator = getAttemptGradeIndicator(attempt)
                        const suspicious = isAttemptSuspicious(attempt)
                        const isSelected = attempt.id === selectedAttemptId

                        return (
                          <button
                            key={attempt.id}
                            type="button"
                            onClick={() => {
                              setSelectedAttemptId(attempt.id)
                              setGradeInputs(
                                buildGradeInputsForAttempt(attempt),
                              )
                            }}
                            className={cn(
                              "w-full rounded-md border px-3 py-2 text-left transition-colors",
                              isSelected
                                ? "border-primary bg-primary/5"
                                : "bg-background hover:bg-muted/40",
                              suspicious &&
                                !isSelected &&
                                "border-destructive/30 bg-destructive/5",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 truncate text-sm font-medium">
                                {attempt.studentDisplayName}
                              </p>
                              {attempt.integrityEvents.length > 0 ? (
                                <Badge variant="destructive">
                                  {attempt.integrityEvents.length}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline">{monitorStatus}</Badge>
                              <Badge variant="outline">{gradeIndicator}</Badge>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 rounded-lg border">
                {selectedAttempt ? (
                  <div className="flex max-h-[58vh] min-h-[44vh] flex-col lg:min-h-[58vh]">
                    <div className="border-b p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold">
                            {selectedAttempt.studentDisplayName}
                          </h3>
                          <p className="truncate text-xs text-muted-foreground">
                            {selectedAttempt.studentEmail}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {selectedAttemptMonitorStatus}
                          </Badge>
                          <Badge variant="outline">
                            {selectedAttemptGradeIndicator}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">Attempt</p>
                          <p className="font-medium">
                            {selectedAttempt.attemptNumber}
                          </p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">Score</p>
                          <p className="font-medium">
                            {selectedAttempt.totalScore === null
                              ? "Pending"
                              : selectedAttempt.totalScore}
                          </p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">Retakes</p>
                          <p className="font-medium">
                            {selectedAttempt.availableRetakeCount}
                          </p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-muted-foreground">Events</p>
                          <p className="font-medium">
                            {selectedAttempt.integrityEvents.length}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Answers</Label>
                          <span className="text-xs text-muted-foreground">
                            {detail.questions.length} question
                            {detail.questions.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {detail.questions.map((question, index) => {
                          const answer = selectedAttempt.answers.find(
                            (candidate) => candidate.questionId === question.id,
                          )
                          const teacherCanGradeQuestion =
                            canTeacherGradeQuestion({
                              questionType: question.type,
                              correctAnswer: question.correctAnswer,
                            })

                          return (
                            <div
                              key={question.id}
                              className="rounded-lg border p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">
                                      Q{index + 1}
                                    </Badge>
                                    <Badge variant="outline">
                                      {question.type === "mcq"
                                        ? "MCQ"
                                        : "Short answer"}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 text-sm font-medium">
                                    {question.prompt}
                                  </p>
                                </div>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {question.points} pts
                                </span>
                              </div>
                              <div className="mt-3 rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                                {formatManagerAnswer(answer?.answer)}
                              </div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <Field
                                  label="Auto score"
                                  value={
                                    answer?.autoScore === null ||
                                    answer?.autoScore === undefined
                                      ? ""
                                      : String(answer.autoScore)
                                  }
                                  disabled
                                />
                                {teacherCanGradeQuestion ? (
                                  <Field
                                    label="Teacher score"
                                    type="number"
                                    value={gradeInputs[question.id] ?? ""}
                                    onChange={(value) =>
                                      setGradeInputs((current) => ({
                                        ...current,
                                        [question.id]: value,
                                      }))
                                    }
                                    disabled={!canGradeSelectedAttempt}
                                    min="0"
                                  />
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="space-y-2">
                        <Label>Exam mode events</Label>
                        {selectedAttempt.integrityEvents.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                            No events recorded.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedAttempt.integrityEvents.map((event) => {
                              const formattedEvent = formatIntegrityEvent({
                                eventType: event.eventType,
                                payload: event.payload,
                              })

                              return (
                                <div
                                  key={event.key}
                                  className="rounded-lg border p-3 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-medium text-foreground">
                                      {formattedEvent.title}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {format(
                                        new Date(event.createdAt),
                                        "MMM d, h:mm:ss a",
                                      )}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-muted-foreground">
                                    {formattedEvent.detail}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t p-4">
                      <Button
                        onClick={() => void submitGrades()}
                        disabled={isMutating || !canGradeSelectedAttempt}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Save grade
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void grantSelectedRetake()}
                        disabled={isMutating || !canGrantSelectedRetake}
                      >
                        <RotateCcw className="w-4 h-4" />
                        Grant retake
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void updateSelectedIntegrity("void")}
                        disabled={
                          !isLiveMonitor ||
                          isMutating ||
                          selectedAttempt.status === "voided"
                        }
                      >
                        <ShieldAlert className="w-4 h-4" />
                        Void
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-[58vh] place-items-center p-6 text-sm text-muted-foreground">
                    Select a student.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Select an exam to review.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )

  function updateQuestion(index: number, patch: Partial<QuestionEditorState>) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question,
      ),
    }))
  }

  function addQuestion(type: QuestionEditorState["type"]) {
    setForm((current) => ({
      ...current,
      questions: [createQuestionEditorState(type), ...current.questions],
    }))
  }

  function updateQuestionType(
    index: number,
    type: QuestionEditorState["type"],
  ) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => {
        if (questionIndex !== index) return question

        if (type === "mcq") {
          const options =
            question.options.length > 0
              ? question.options
              : [...DEFAULT_MCQ_OPTIONS]

          return {
            ...question,
            type,
            options,
            correctAnswerText: normalizeCorrectOptionNumber(
              question.correctAnswerText,
              options.length,
            ),
          }
        }

        return { ...question, type, options: [], correctAnswerText: "" }
      }),
    }))
  }

  function updateQuestionOption(
    questionIndex: number,
    optionIndex: number,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, currentQuestionIndex) => {
        if (currentQuestionIndex !== questionIndex) return question

        return {
          ...question,
          options: question.options.map((option, currentOptionIndex) =>
            currentOptionIndex === optionIndex ? value : option,
          ),
        }
      }),
    }))
  }

  function addQuestionOption(questionIndex: number) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, currentQuestionIndex) => {
        if (currentQuestionIndex !== questionIndex) return question

        return {
          ...question,
          options: [...question.options, ""],
        }
      }),
    }))
  }

  function removeQuestionOption(questionIndex: number, optionIndex: number) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, currentQuestionIndex) => {
        if (currentQuestionIndex !== questionIndex) return question

        const remainingOptions = question.options.filter(
          (_, currentOptionIndex) => currentOptionIndex !== optionIndex,
        )

        return {
          ...question,
          options: remainingOptions,
          correctAnswerText: normalizeCorrectOptionNumber(
            question.correctAnswerText,
            remainingOptions.length,
          ),
        }
      }),
    }))
  }
}

function toQuestionEditorFromAi(question: AiExamQuestionDraft) {
  if (question.type === "short") {
    return {
      type: "short" as const,
      prompt: question.prompt,
      points: String(question.points || 10),
      options: [],
      correctAnswerText:
        typeof question.correctAnswer === "string"
          ? question.correctAnswer
          : "",
    }
  }

  const options =
    question.options.length >= 2
      ? question.options
      : ["Option A", "Option B", "Option C"]
  const correctAnswerNumber =
    typeof question.correctAnswer === "number" ? question.correctAnswer : 1

  return {
    type: "mcq" as const,
    prompt: question.prompt,
    points: String(question.points || 10),
    options,
    correctAnswerText: normalizeCorrectOptionNumber(
      String(correctAnswerNumber),
      options.length,
    ),
  }
}

function toExamPayload(
  form: ExamFormState,
  options: {
    editingPasscodeProtected: boolean
  },
): UpsertExamInput {
  const durationMinutes = Number.parseInt(form.durationMinutes, 10)
  const title = form.title.trim()
  const passcode = form.passcode.trim()

  if (!title) {
    throw new ExamFormValidationError(EXAM_TITLE_REQUIRED_MESSAGE, "title")
  }

  if (!form.startAt) {
    throw new ExamFormValidationError(
      "Select a valid exam start date and time.",
      "startAt",
    )
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new ExamFormValidationError(
      "Duration must be greater than zero.",
      "durationMinutes",
    )
  }

  if (passcode && passcode.length < 4) {
    throw new ExamFormValidationError(
      "Exam passcode must be at least 4 characters.",
      "passcode",
    )
  }

  return {
    title,
    durationMinutes,
    startAt: new Date(form.startAt).toISOString(),
    passcode: passcode.length > 0 ? passcode : undefined,
    questions: form.questions.map((question, questionIndex) => {
      const prompt = question.prompt.trim()
      const points = Number.parseInt(question.points, 10)
      const options =
        question.type === "mcq"
          ? question.options.map((option) => option.trim()).filter(Boolean)
          : []
      const correctOptionNumber = Number.parseInt(
        question.correctAnswerText,
        10,
      )
      const modelAnswer = question.correctAnswerText.trim()

      if (!prompt) {
        throw new ExamFormValidationError(
          "Each question field is required.",
          `question-${questionIndex}-prompt`,
        )
      }

      if (!Number.isFinite(points) || points <= 0) {
        throw new ExamFormValidationError(
          "Each question must be worth at least 1 point.",
          `question-${questionIndex}-points`,
        )
      }

      if (question.type === "mcq") {
        if (options.length === 0) {
          throw new ExamFormValidationError(
            "Multiple choice questions need at least one option.",
            `question-${questionIndex}-option-0`,
          )
        }

        if (
          !Number.isFinite(correctOptionNumber) ||
          correctOptionNumber < 1 ||
          correctOptionNumber > options.length
        ) {
          throw new ExamFormValidationError(
            "Correct option number must be between 1 and the number of options.",
            `question-${questionIndex}-correct`,
          )
        }
      }

      return {
        type: question.type,
        prompt,
        options,
        correctAnswer:
          question.type === "mcq"
            ? correctOptionNumber - 1
            : modelAnswer.length > 0
              ? modelAnswer
              : null,
        points,
      }
    }),
  }
}

function statusBadge(status: string) {
  if (status === "live") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
  }

  if (status === "ended") {
    return "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
  }

  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
}

function formatExamStatus(status: string) {
  if (status === "live") return "Live"
  if (status === "ended") return "Ended"
  return "Upcoming"
}

function canEditExam(exam: ManagerExamSummaryDto) {
  const attemptTotal =
    exam.attemptCounts.inProgress +
    exam.attemptCounts.submitted +
    exam.attemptCounts.graded

  return exam.status !== "ended" && attemptTotal === 0
}

function formatManagerAnswer(answer: unknown) {
  if (answer === null || answer === undefined) {
    return "No answer submitted."
  }

  if (typeof answer === "string") return answer
  if (typeof answer === "number") return `Selected option ${answer + 1}`
  return JSON.stringify(answer, null, 2)
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function toSupportedQuestionType(
  type: ManagerExamDetailDto["questions"][number]["type"],
) {
  return type === "mcq" ? "mcq" : "short"
}

function formatQuestionType(type: QuestionEditorState["type"]) {
  return type === "mcq" ? "MCQ" : "Short Answer"
}

function normalizeCorrectOptionNumber(value: string, optionCount: number) {
  if (optionCount <= 0) {
    return ""
  }

  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return "1"
  }

  return String(Math.min(parsedValue, optionCount))
}

function getStartDatePart(value: string) {
  return toDatetimeLocalValue(value).split("T")[0] ?? ""
}

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0")
  return { value, label: value }
})

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => {
  const value = String(index).padStart(2, "0")
  return { value, label: value }
})

function getStartTimeParts(value: string) {
  const time = toDatetimeLocalValue(value).split("T")[1]?.slice(0, 5) ?? "00:00"
  const [hour24Raw, minuteRaw] = time.split(":").map(Number)
  const hour24 = Number.isFinite(hour24Raw) ? hour24Raw : 0
  const minute = Number.isFinite(minuteRaw) ? minuteRaw : 0
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM"
  const hour12 = hour24 % 12 || 12

  return {
    hour: String(hour12).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
    period,
  }
}

function combineStartParts(
  date: string,
  time: {
    hour: string
    minute: string
    period: "AM" | "PM"
  },
) {
  if (!date) return ""

  const [year, month, day] = date.split("-").map(Number)
  const parsedHour = Number.parseInt(time.hour, 10)
  const parsedMinute = Number.parseInt(time.minute, 10)

  if (
    !Number.isFinite(parsedHour) ||
    parsedHour < 1 ||
    parsedHour > 12 ||
    !Number.isFinite(parsedMinute) ||
    parsedMinute < 0 ||
    parsedMinute > 59
  ) {
    return ""
  }

  const hour24 =
    time.period === "PM"
      ? parsedHour === 12
        ? 12
        : parsedHour + 12
      : parsedHour === 12
        ? 0
        : parsedHour

  const startAt = new Date(year, month - 1, day, hour24, parsedMinute)

  return Number.isNaN(startAt.getTime()) ? "" : startAt.toISOString()
}

function RequiredLabel({
  children,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label {...props}>
      {children}
      <span className="ml-1 text-destructive" aria-hidden="true">
        *
      </span>
    </Label>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  min,
  minLength,
  placeholder,
  step,
  fieldKey,
  invalid = false,
  required = false,
}: {
  label: string
  value: string
  onChange?: (value: string) => void
  type?: string
  disabled?: boolean
  min?: string
  minLength?: number
  placeholder?: string
  step?: string
  fieldKey?: string
  invalid?: boolean
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      {required ? (
        <RequiredLabel>{label}</RequiredLabel>
      ) : (
        <Label>{label}</Label>
      )}
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        min={min}
        minLength={minLength}
        placeholder={placeholder}
        step={step}
        aria-invalid={invalid}
        data-exam-form-field={fieldKey}
      />
    </div>
  )
}

function StartTimeFields({
  value,
  onChange,
  invalid = false,
  required = false,
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  required?: boolean
}) {
  const date = getStartDatePart(value)
  const time = getStartTimeParts(value)

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_5.5rem_5.5rem_4.75rem]">
      <div className="space-y-2">
        {required ? (
          <RequiredLabel htmlFor="exam-start-date">Start date</RequiredLabel>
        ) : (
          <Label htmlFor="exam-start-date">Start date</Label>
        )}
        <Input
          id="exam-start-date"
          type="date"
          value={date}
          onChange={(event) =>
            onChange(combineStartParts(event.target.value, time))
          }
          aria-invalid={invalid}
          data-exam-form-field="startAt"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="exam-start-hour">Hour</Label>
        <Select
          value={time.hour}
          onValueChange={(hour) =>
            onChange(
              combineStartParts(date, {
                hour,
                minute: time.minute,
                period: time.period,
              }),
            )
          }
        >
          <SelectTrigger id="exam-start-hour" aria-invalid={invalid}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOUR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="exam-start-minute">Minute</Label>
        <Select
          value={time.minute}
          onValueChange={(minute) =>
            onChange(
              combineStartParts(date, {
                hour: time.hour,
                minute,
                period: time.period,
              }),
            )
          }
        >
          <SelectTrigger id="exam-start-minute" aria-invalid={invalid}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="exam-start-period">Period</Label>
        <Select
          value={time.period}
          onValueChange={(period: "AM" | "PM") =>
            onChange(combineStartParts(date, { ...time, period }))
          }
        >
          <SelectTrigger id="exam-start-period" aria-invalid={invalid}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
