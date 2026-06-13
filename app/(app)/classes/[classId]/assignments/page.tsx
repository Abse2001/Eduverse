"use client"

import { format, isPast } from "date-fns"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  PlusCircle,
  Save,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  use,
  useEffect,
  useMemo,
  useState,
} from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownContent } from "@/features/ai/markdown-content"
import {
  type AssignmentDerivedStatus,
  type ClassAssignment,
  type ClassAssignmentSubmission,
  getAssignmentDerivedStatus,
  useClassAssignments,
} from "@/features/assignments/use-class-assignments"
import { formatFileSize } from "@/features/chat/file-utils"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

type CreateForm = {
  title: string
  description: string
  dueAt: string
  maxScore: string
  status: "draft" | "published"
  allowLateSubmissions: boolean
  allowTextSubmission: boolean
  allowFileSubmission: boolean
  files: File[]
}

type AiAssignmentDraftPayload = {
  title?: string
  description?: string
  maxScore?: number
  allowTextSubmission?: boolean
  allowFileSubmission?: boolean
}

type AiSupportMode = "rubric" | "alternate_questions"
type AiSupportTarget = `create:${AiSupportMode}` | `edit:${AiSupportMode}`

type AssignmentCreateFieldKey =
  | "title"
  | "dueAt"
  | "maxScore"
  | "submissionModes"

const ASSIGNMENT_FORM_FIELD_ATTRIBUTE = "data-assignment-form-field"

class AssignmentFormValidationError extends Error {
  fieldKey: AssignmentCreateFieldKey

  constructor(message: string, fieldKey: AssignmentCreateFieldKey) {
    super(message)
    this.name = "AssignmentFormValidationError"
    this.fieldKey = fieldKey
  }
}

function getAssignmentFormField(fieldKey: AssignmentCreateFieldKey) {
  if (typeof document === "undefined") return null

  return document.querySelector<HTMLElement>(
    `[${ASSIGNMENT_FORM_FIELD_ATTRIBUTE}="${fieldKey}"]`,
  )
}

const STATUS_CONFIG: Record<
  AssignmentDerivedStatus,
  { label: string; icon: React.ElementType; badge: string; color: string }
> = {
  draft: {
    label: "Draft",
    icon: FileText,
    badge:
      "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    color: "text-muted-foreground",
  },
  pending: {
    label: "Pending",
    icon: AlertCircle,
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    color: "text-amber-600 dark:text-amber-400",
  },
  submitted: {
    label: "Submitted",
    icon: CheckCircle2,
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    color: "text-blue-600 dark:text-blue-400",
  },
  graded: {
    label: "Graded",
    icon: CheckCircle2,
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  overdue: {
    label: "Overdue",
    icon: Clock,
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    color: "text-destructive",
  },
}

const EMPTY_CREATE_FORM: CreateForm = {
  title: "",
  description: "",
  dueAt: "",
  maxScore: "100",
  status: "draft",
  allowLateSubmissions: true,
  allowTextSubmission: true,
  allowFileSubmission: false,
  files: [],
}

const TIME_OPTIONS = [
  ...Array.from({ length: 48 }, (_, index) => {
    const minutes = index * 30
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0",
    )}`
    const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })

    return { value, label }
  }),
  { value: "23:59", label: "11:59 PM" },
]

export default function AssignmentsPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { authUser, currentUser } = useApp()
  const { cls, classRow, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "assignments")
  const canManage =
    currentUser.role === "admin" ||
    (currentUser.role === "teacher" &&
      (classRow?.teacher_user_id === currentUser.id ||
        classRow?.memberships.some(
          (membership) =>
            membership.user_id === currentUser.id &&
            (membership.role === "teacher" || membership.role === "ta"),
        ) === true))
  const {
    assignments,
    counts,
    isLoading: isLoadingAssignments,
    isMutating,
    errorMessage: assignmentsError,
    createAssignment,
    updateAssignment,
    deleteAssignment,
    uploadAssignmentFile,
    submitAssignment,
    gradeSubmission,
    getAssignmentFileUrl,
    getSubmissionFileUrl,
    refreshAssignments,
  } = useClassAssignments({
    classId,
    currentUserId: authUser?.id ?? currentUser.id ?? null,
    canManage,
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM)
  const [invalidCreateField, setInvalidCreateField] =
    useState<AssignmentCreateFieldKey | null>(null)
  const [editAssignment, setEditAssignment] = useState<ClassAssignment | null>(
    null,
  )
  const [editForm, setEditForm] = useState<CreateForm>(EMPTY_CREATE_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [selectedAssignment, setSelectedAssignment] =
    useState<ClassAssignment | null>(null)
  const [reviewAssignment, setReviewAssignment] =
    useState<ClassAssignment | null>(null)
  const [submissionText, setSubmissionText] = useState("")
  const [submissionFile, setSubmissionFile] = useState<File | null>(null)
  const [selectedSubmission, setSelectedSubmission] =
    useState<ClassAssignmentSubmission | null>(null)
  const [gradeScore, setGradeScore] = useState("")
  const [gradeFeedback, setGradeFeedback] = useState("")
  const [isAiDraftOpen, setIsAiDraftOpen] = useState(false)
  const [aiDraftPrompt, setAiDraftPrompt] = useState("")
  const [aiDraftError, setAiDraftError] = useState<string | null>(null)
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false)
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false)
  const [aiSupportTarget, setAiSupportTarget] =
    useState<AiSupportTarget | null>(null)
  const formOrAssignmentsError = formError ?? assignmentsError

  useEffect(() => {
    if (!formOrAssignmentsError) return

    toast({
      title: "Could not save assignment",
      description: formOrAssignmentsError,
      variant: "destructive",
    })
  }, [formOrAssignmentsError])

  useEffect(() => {
    if (!aiDraftError) return

    toast({
      title: "Could not generate assignment draft",
      description: aiDraftError,
      variant: "destructive",
    })
  }, [aiDraftError])

  const studentCount = classRow?.students.length ?? 0
  const visibleAssignments = useMemo(() => {
    if (canManage) return assignments
    return assignments.filter((assignment) => assignment.status === "published")
  }, [assignments, canManage])

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return (
      <ClassFeatureDisabledFallback
        classId={classId}
        featureLabel="Assignments"
      />
    )
  }

  function resetCreateForm() {
    setCreateForm(EMPTY_CREATE_FORM)
    setFormError(null)
    setInvalidCreateField(null)
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createAssignmentWithStatus("draft")
  }

  async function createAssignmentWithStatus(status: "draft" | "published") {
    try {
      setFormError(null)
      setInvalidCreateField(null)
      const maxScore = validateCreateForm(createForm)
      await createAssignment({
        title: createForm.title,
        description: createForm.description,
        dueAt: createForm.dueAt,
        maxScore,
        status,
        allowLateSubmissions: createForm.allowLateSubmissions,
        allowTextSubmission: createForm.allowTextSubmission,
        allowFileSubmission: createForm.allowFileSubmission,
        files: createForm.files,
      })
      resetCreateForm()
      setIsCreateOpen(false)
    } catch (error) {
      if (error instanceof AssignmentFormValidationError) {
        setFormError(null)
        setInvalidCreateField(error.fieldKey)
        requestAnimationFrame(() => {
          const field = getAssignmentFormField(error.fieldKey)
          field?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          })
          field?.focus()
        })
      } else {
        setFormError(
          error instanceof Error
            ? error.message
            : "Could not create assignment.",
        )
      }
    }
  }

  function clearInvalidCreateField(fieldKey: AssignmentCreateFieldKey) {
    if (invalidCreateField === fieldKey) {
      setInvalidCreateField(null)
    }
  }

  function openEditAssignment(assignment: ClassAssignment) {
    setEditAssignment(assignment)
    setEditForm({
      title: assignment.title,
      description: assignment.description,
      dueAt: toDatetimeLocalValue(assignment.dueAt),
      maxScore: String(assignment.maxScore),
      status: assignment.status,
      allowLateSubmissions: assignment.allowLateSubmissions,
      allowTextSubmission: assignment.allowTextSubmission,
      allowFileSubmission: assignment.allowFileSubmission,
      files: [],
    })
    setFormError(null)
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editAssignment) return

    const maxScore = Number.parseFloat(editForm.maxScore)
    if (!editForm.allowTextSubmission && !editForm.allowFileSubmission) {
      setFormError("Enable text, file, or both submission modes.")
      return
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      setFormError("Max points must be greater than zero.")
      return
    }

    try {
      setFormError(null)
      await updateAssignment(editAssignment.id, {
        title: editForm.title,
        description: editForm.description,
        dueAt: editForm.dueAt,
        maxScore,
        status: editForm.status,
        allowLateSubmissions: editForm.allowLateSubmissions,
        allowTextSubmission: editForm.allowTextSubmission,
        allowFileSubmission: editForm.allowFileSubmission,
      })

      for (const file of editForm.files) {
        await uploadAssignmentFile(editAssignment.id, file)
      }

      if (editForm.files.length > 0) await refreshAssignments()
      setEditAssignment(null)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not update assignment.",
      )
    }
  }

  async function openAssignmentFile(
    assignment: ClassAssignment,
    fileId: string,
  ) {
    const url = await getAssignmentFileUrl(assignment.id, fileId)
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function openSubmissionFile(
    assignment: ClassAssignment,
    submission: ClassAssignmentSubmission,
  ) {
    const url = await getSubmissionFileUrl(assignment.id, submission.id)
    window.open(url, "_blank", "noopener,noreferrer")
  }

  function openStudentAssignment(assignment: ClassAssignment) {
    setSelectedAssignment(assignment)
    setSubmissionText(assignment.mySubmission?.textResponse ?? "")
    setSubmissionFile(null)
    setFormError(null)
  }

  function openGrade(
    assignment: ClassAssignment,
    submission: ClassAssignmentSubmission,
  ) {
    setReviewAssignment(assignment)
    setSelectedSubmission(submission)
    setGradeScore(submission.score === null ? "" : String(submission.score))
    setGradeFeedback(submission.feedback)
    setFormError(null)
  }

  async function submitStudentWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAssignment) return

    try {
      setFormError(null)
      await submitAssignment({
        assignmentId: selectedAssignment.id,
        textResponse: submissionText,
        file: submissionFile,
      })
      setSelectedAssignment(null)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not submit assignment.",
      )
    }
  }

  async function submitGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewAssignment || !selectedSubmission) return

    try {
      setFormError(null)
      await gradeSubmission({
        assignmentId: reviewAssignment.id,
        submissionId: selectedSubmission.id,
        score: Number.parseFloat(gradeScore),
        feedback: gradeFeedback,
      })
      setSelectedSubmission(null)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not save grade.",
      )
    }
  }

  async function generateAssignmentDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = aiDraftPrompt.trim()
    if (!prompt) {
      setAiDraftError("Describe what the assignment should cover.")
      return
    }

    setIsGeneratingDraft(true)
    setAiDraftError(null)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/assignments/ai/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        draft?: AiAssignmentDraftPayload
        error?: string
      } | null

      if (!response.ok || !payload?.draft) {
        throw new Error(payload?.error ?? "Could not generate assignment.")
      }

      setCreateForm((prev) => ({
        ...prev,
        title:
          typeof payload.draft?.title === "string"
            ? payload.draft.title
            : prev.title,
        description:
          typeof payload.draft?.description === "string"
            ? payload.draft.description
            : prev.description,
        maxScore:
          typeof payload.draft?.maxScore === "number"
            ? String(payload.draft.maxScore)
            : prev.maxScore,
        allowTextSubmission: payload.draft?.allowTextSubmission !== false,
        allowFileSubmission: payload.draft?.allowFileSubmission === true,
      }))
      setAiDraftPrompt("")
      setIsAiDraftOpen(false)
      setIsCreateOpen(true)
    } catch (error) {
      setAiDraftError(
        error instanceof Error
          ? error.message
          : "Could not generate assignment.",
      )
    } finally {
      setIsGeneratingDraft(false)
    }
  }

  async function generateSubmissionFeedback() {
    if (!reviewAssignment || !selectedSubmission) return

    setIsGeneratingFeedback(true)
    setFormError(null)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(
          classId,
        )}/assignments/${encodeURIComponent(
          reviewAssignment.id,
        )}/submissions/${encodeURIComponent(
          selectedSubmission.id,
        )}/ai/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: gradeScore }),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        feedback?: string
        error?: string
      } | null

      if (!response.ok || !payload?.feedback) {
        throw new Error(payload?.error ?? "Could not draft feedback.")
      }

      setGradeFeedback(payload.feedback)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not draft feedback.",
      )
    } finally {
      setIsGeneratingFeedback(false)
    }
  }

  async function generateAssignmentSupport({
    form,
    mode,
    setForm,
    target,
  }: {
    form: CreateForm
    mode: AiSupportMode
    setForm: Dispatch<SetStateAction<CreateForm>>
    target: AiSupportTarget
  }) {
    if (!form.title.trim() && !form.description.trim()) {
      setFormError("Add a title or notes before generating AI support.")
      return
    }

    setAiSupportTarget(target)
    setFormError(null)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/assignments/ai/support`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            title: form.title,
            description: form.description,
            maxScore: Number.parseFloat(form.maxScore),
          }),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        content?: string
        error?: string
      } | null

      if (!response.ok || !payload?.content) {
        throw new Error(payload?.error ?? "Could not generate AI support.")
      }

      setForm((prev) => ({
        ...prev,
        description: appendAiSection(prev.description, payload.content ?? ""),
      }))
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not generate AI support.",
      )
    } finally {
      setAiSupportTarget(null)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <ClassPageHeader
        title={cls.name}
        code={cls.code}
        section="Assignments"
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => setIsAiDraftOpen(true)}
              >
                <Sparkles className="h-4 w-4" />
                AI Draft
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setIsCreateOpen(true)}
              >
                <PlusCircle className="w-4 h-4" />
                New Assignment
              </Button>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(Object.keys(STATUS_CONFIG) as AssignmentDerivedStatus[]).map(
          (status) => (
            <div key={status} className="rounded-lg bg-muted/45 p-3">
              <p className="text-2xl font-bold text-foreground">
                {counts[status]}
              </p>
              <p className="text-xs text-muted-foreground">
                {STATUS_CONFIG[status].label}
              </p>
            </div>
          ),
        )}
      </div>

      {isLoadingAssignments ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner />
          Loading assignments...
        </div>
      ) : visibleAssignments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No assignments yet</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visibleAssignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              canManage={canManage}
              studentCount={studentCount}
              onOpen={() => openStudentAssignment(assignment)}
              onReview={() => setReviewAssignment(assignment)}
              onEdit={() => openEditAssignment(assignment)}
              onPublish={() =>
                updateAssignment(assignment.id, { status: "published" })
              }
              onDelete={() => {
                if (window.confirm(`Delete ${assignment.title}?`)) {
                  deleteAssignment(assignment.id)
                }
              }}
            />
          ))}
        </div>
      )}

      <Dialog
        open={isAiDraftOpen}
        onOpenChange={(open) => {
          setIsAiDraftOpen(open)
          if (!open && !isGeneratingDraft) {
            setAiDraftPrompt("")
            setAiDraftError(null)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <form onSubmit={generateAssignmentDraft} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Draft assignment with AI</DialogTitle>
              <DialogDescription>
                Describe the topic, goals, and student level. The draft opens in
                the normal assignment form before publishing.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="ai-assignment-prompt">Request</Label>
              <Textarea
                id="ai-assignment-prompt"
                value={aiDraftPrompt}
                onChange={(event) => setAiDraftPrompt(event.target.value)}
                disabled={isGeneratingDraft}
                rows={5}
                placeholder="Create a 100-point lab assignment about sorting algorithms for first-year CS students, with a short rubric."
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              The selected free model may log prompts and outputs, so avoid
              personal or sensitive student information.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAiDraftOpen(false)}
                disabled={isGeneratingDraft}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isGeneratingDraft}>
                {isGeneratingDraft ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Drafting
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
          if (!open && !isMutating) resetCreateForm()
        }}
      >
        <DialogContent className="max-w-2xl">
          <form onSubmit={submitCreate} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Create assignment</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <RequiredLabel htmlFor="assignment-title">Title</RequiredLabel>
                <Input
                  id="assignment-title"
                  value={createForm.title}
                  onChange={(event) => {
                    clearInvalidCreateField("title")
                    setCreateForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }}
                  disabled={isMutating}
                  placeholder="Essay draft"
                  aria-invalid={invalidCreateField === "title"}
                  data-assignment-form-field="title"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="assignment-description">Notes</Label>
                  <AssignmentAiButtons
                    disabled={isMutating || isGeneratingDraft}
                    loadingMode={getSupportModeForTarget(
                      aiSupportTarget,
                      "create",
                    )}
                    onGenerate={(mode) =>
                      generateAssignmentSupport({
                        form: createForm,
                        mode,
                        setForm: setCreateForm,
                        target: `create:${mode}`,
                      })
                    }
                  />
                </div>
                <Textarea
                  id="assignment-description"
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  disabled={isMutating}
                  rows={4}
                  placeholder="Instructions, requirements, links, or grading notes"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <DeadlineFields
                  idPrefix="assignment"
                  value={createForm.dueAt}
                  onChange={(dueAt) => {
                    clearInvalidCreateField("dueAt")
                    setCreateForm((prev) => ({ ...prev, dueAt }))
                  }}
                  disabled={isMutating}
                  invalid={invalidCreateField === "dueAt"}
                  fieldKey="dueAt"
                  required
                />
              </div>

              <div className="space-y-2">
                <RequiredLabel htmlFor="assignment-score">
                  Max points
                </RequiredLabel>
                <Input
                  id="assignment-score"
                  type="number"
                  min="1"
                  step="0.5"
                  value={createForm.maxScore}
                  onChange={(event) => {
                    clearInvalidCreateField("maxScore")
                    setCreateForm((prev) => ({
                      ...prev,
                      maxScore: event.target.value,
                    }))
                  }}
                  disabled={isMutating}
                  aria-invalid={invalidCreateField === "maxScore"}
                  data-assignment-form-field="maxScore"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="assignment-files">Prompt files</Label>
                <AssignmentFilePicker
                  id="assignment-files"
                  multiple
                  disabled={isMutating}
                  selectedText={formatSelectedFileText(createForm.files)}
                  description="Attach prompt files for students"
                  onFiles={(files) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      files,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CheckRow
                label="Accept text responses"
                checked={createForm.allowTextSubmission}
                onCheckedChange={(checked) => {
                  clearInvalidCreateField("submissionModes")
                  setCreateForm((prev) => ({
                    ...prev,
                    allowTextSubmission: checked,
                  }))
                }}
                invalid={invalidCreateField === "submissionModes"}
                fieldKey="submissionModes"
              />
              <CheckRow
                label="Accept file"
                checked={createForm.allowFileSubmission}
                onCheckedChange={(checked) => {
                  clearInvalidCreateField("submissionModes")
                  setCreateForm((prev) => ({
                    ...prev,
                    allowFileSubmission: checked,
                  }))
                }}
                invalid={invalidCreateField === "submissionModes"}
              />
              <CheckRow
                label="Accept late submissions"
                checked={createForm.allowLateSubmissions}
                onCheckedChange={(checked) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    allowLateSubmissions: checked,
                  }))
                }
              />
            </div>

            <DialogFooter>
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
                onClick={() => void createAssignmentWithStatus("published")}
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
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editAssignment)}
        onOpenChange={(open) => {
          if (!open && !isMutating) setEditAssignment(null)
        }}
      >
        {editAssignment && (
          <DialogContent className="max-w-2xl">
            <form onSubmit={submitEdit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Edit assignment</DialogTitle>
                <DialogDescription>
                  Update assignment details or add more prompt files.
                </DialogDescription>
              </DialogHeader>

              <AssignmentFormFields
                form={editForm}
                setForm={setEditForm}
                isMutating={isMutating}
                generatingSupportMode={getSupportModeForTarget(
                  aiSupportTarget,
                  "edit",
                )}
                onGenerateSupport={(mode) =>
                  generateAssignmentSupport({
                    form: editForm,
                    mode,
                    setForm: setEditForm,
                    target: `edit:${mode}`,
                  })
                }
              />

              {editAssignment.files.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Existing files stay attached. Add new files above if needed.
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditAssignment(null)}
                  disabled={isMutating}
                >
                  Cancel
                </Button>
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
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(selectedAssignment)}
        onOpenChange={(open) => {
          if (!open) setSelectedAssignment(null)
        }}
      >
        {selectedAssignment && (
          <DialogContent className="max-w-2xl">
            <form onSubmit={submitStudentWork} className="space-y-4">
              <AssignmentDialogHeader assignment={selectedAssignment} />
              <AssignmentFiles
                assignment={selectedAssignment}
                onOpen={openAssignmentFile}
              />
              {selectedAssignment.allowTextSubmission && (
                <div className="space-y-2">
                  <Label htmlFor="submission-text">Response</Label>
                  <Textarea
                    id="submission-text"
                    value={submissionText}
                    onChange={(event) => setSubmissionText(event.target.value)}
                    rows={6}
                    disabled={isMutating}
                  />
                </div>
              )}
              {selectedAssignment.allowFileSubmission && (
                <div className="space-y-2">
                  <Label htmlFor="submission-file">File</Label>
                  <AssignmentFilePicker
                    id="submission-file"
                    disabled={isMutating}
                    selectedText={submissionFile?.name ?? ""}
                    description="Attach your assignment file"
                    onFiles={(files) => setSubmissionFile(files[0] ?? null)}
                  />
                  {selectedAssignment.mySubmission?.fileOriginalFilename && (
                    <p className="text-xs text-muted-foreground">
                      Current file:{" "}
                      {selectedAssignment.mySubmission.fileOriginalFilename}
                    </p>
                  )}
                </div>
              )}
              {selectedAssignment.mySubmission?.gradedAt && (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-sm font-semibold">
                    Score: {selectedAssignment.mySubmission.score}/
                    {selectedAssignment.maxScore}
                  </p>
                  {selectedAssignment.mySubmission.feedback && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedAssignment.mySubmission.feedback}
                    </p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedAssignment(null)}
                  disabled={isMutating}
                >
                  Close
                </Button>
                <Button type="submit" disabled={isMutating}>
                  {isMutating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {selectedAssignment.mySubmission ? "Resubmit" : "Submit"}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(reviewAssignment)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewAssignment(null)
            setSelectedSubmission(null)
          }
        }}
      >
        {reviewAssignment && classRow && (
          <DialogContent className="h-[min(42rem,calc(100vh-2rem))] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{reviewAssignment.title}</DialogTitle>
              <DialogDescription>
                Review submissions from the class roster.
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-h-0 min-w-0 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="min-h-0 min-w-0 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classRow.students.map((student) => {
                      const submission = reviewAssignment.submissions.find(
                        (item) => item.studentUserId === student.id,
                      )

                      return (
                        <TableRow key={student.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {student.display_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {student.email}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <RosterStatus submission={submission} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {submission
                              ? format(
                                  new Date(submission.submittedAt),
                                  "MMM d, h:mm a",
                                )
                              : "Missing"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!submission}
                              onClick={() =>
                                submission &&
                                openGrade(reviewAssignment, submission)
                              }
                            >
                              Grade
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="min-h-0 min-w-0 overflow-y-auto rounded-lg border p-4">
                {selectedSubmission ? (
                  <form onSubmit={submitGrade} className="space-y-4">
                    {selectedSubmission.textResponse && (
                      <div className="space-y-2">
                        <Label>Text response</Label>
                        <div className="max-h-44 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm">
                          {selectedSubmission.textResponse}
                        </div>
                      </div>
                    )}
                    {selectedSubmission.fileOriginalFilename && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start gap-2"
                        onClick={() =>
                          openSubmissionFile(
                            reviewAssignment,
                            selectedSubmission,
                          )
                        }
                      >
                        <Download className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">
                          {selectedSubmission.fileOriginalFilename}
                        </span>
                      </Button>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="grade-score">Score</Label>
                      <Input
                        id="grade-score"
                        type="number"
                        min="0"
                        max={reviewAssignment.maxScore}
                        step="0.5"
                        value={gradeScore}
                        onChange={(event) => setGradeScore(event.target.value)}
                        disabled={isMutating}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="grade-feedback">Feedback</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          onClick={generateSubmissionFeedback}
                          disabled={isGeneratingFeedback || isMutating}
                        >
                          {isGeneratingFeedback ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          Draft feedback
                        </Button>
                      </div>
                      <Textarea
                        id="grade-feedback"
                        value={gradeFeedback}
                        onChange={(event) =>
                          setGradeFeedback(event.target.value)
                        }
                        disabled={isMutating}
                        rows={5}
                      />
                    </div>
                    <Button type="submit" disabled={isMutating}>
                      {isMutating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving
                        </>
                      ) : (
                        "Save grade"
                      )}
                    </Button>
                  </form>
                ) : (
                  <div className="grid h-full min-w-0 place-items-center px-4 text-center text-sm text-muted-foreground">
                    <p className="max-w-48 text-wrap leading-6">
                      Select a submitted student to review their work.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

function AssignmentCard({
  assignment,
  canManage,
  studentCount,
  onOpen,
  onReview,
  onEdit,
  onPublish,
  onDelete,
}: {
  assignment: ClassAssignment
  canManage: boolean
  studentCount: number
  onOpen: () => void
  onReview: () => void
  onEdit: () => void
  onPublish: () => void
  onDelete: () => void
}) {
  const derivedStatus = getAssignmentDerivedStatus(assignment)
  const status = STATUS_CONFIG[derivedStatus]
  const StatusIcon = status.icon
  const submittedCount = assignment.submissions.length
  const gradedCount = assignment.submissions.filter(
    (submission) => submission.gradedAt,
  ).length
  const overdue =
    assignment.status === "published" &&
    !assignment.mySubmission &&
    isPast(new Date(assignment.dueAt))

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {assignment.title}
                </p>
                <Badge
                  variant="secondary"
                  className={cn("border-0 text-[10px]", status.badge)}
                >
                  <StatusIcon className="mr-1 h-2.5 w-2.5" />
                  {status.label}
                </Badge>
              </div>
              {assignment.description && (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {assignment.description}
                </p>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span
              className={cn(
                "flex items-center gap-1",
                overdue && "font-medium text-destructive",
              )}
            >
              <Clock className="h-3 w-3" />
              Due {format(new Date(assignment.dueAt), "MMM d, h:mm a")}
            </span>
            <span>{assignment.maxScore} pts</span>
            <span>
              {assignment.allowTextSubmission ? "Text" : ""}
              {assignment.allowTextSubmission && assignment.allowFileSubmission
                ? " + "
                : ""}
              {assignment.allowFileSubmission ? "File" : ""}
            </span>
            {assignment.files.length > 0 && (
              <span>{assignment.files.length} prompt files</span>
            )}
            {canManage && (
              <span>
                {submittedCount}/{studentCount} submitted &middot; {gradedCount}{" "}
                graded
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage ? (
            <>
              {assignment.status === "draft" && (
                <Button size="sm" variant="outline" onClick={onPublish}>
                  Publish
                </Button>
              )}
              <Button size="sm" onClick={onReview}>
                Review
              </Button>
              <Button size="sm" variant="outline" onClick={onEdit}>
                Edit
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onOpen}>
              {assignment.mySubmission ? "View" : "Start"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AssignmentDialogHeader({
  assignment,
}: {
  assignment: ClassAssignment
}) {
  return (
    <DialogHeader>
      <DialogTitle>{assignment.title}</DialogTitle>
      <DialogDescription>
        Due {format(new Date(assignment.dueAt), "MMM d, h:mm a")} &middot;{" "}
        {assignment.maxScore} points
      </DialogDescription>
      {assignment.description && (
        <div className="pt-2">
          <MarkdownContent content={assignment.description} />
        </div>
      )}
    </DialogHeader>
  )
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

function AssignmentFilePicker({
  id,
  multiple = false,
  disabled = false,
  description,
  selectedText,
  onFiles,
}: {
  id: string
  multiple?: boolean
  disabled?: boolean
  description: string
  selectedText: string
  onFiles: (files: File[]) => void
}) {
  return (
    <>
      <label
        htmlFor={id}
        className={cn(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-input bg-muted/20 px-4 py-5 text-center transition-colors hover:bg-muted/40",
          "has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Input
          id={id}
          type="file"
          multiple={multiple}
          className="sr-only"
          onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
          disabled={disabled}
        />
        <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          Choose {multiple ? "files" : "file"}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">
          {description}
        </span>
      </label>
      <p className="min-h-4 text-xs text-muted-foreground">{selectedText}</p>
    </>
  )
}

function formatSelectedFileText(files: File[]) {
  if (files.length === 0) return ""

  return `${files.length} file${files.length === 1 ? "" : "s"} selected`
}

function validateCreateForm(form: CreateForm) {
  const title = form.title.trim()
  const dueAt = form.dueAt.trim()
  const maxScore = Number.parseFloat(form.maxScore)

  if (!title) {
    throw new AssignmentFormValidationError(
      "Assignment title is required.",
      "title",
    )
  }

  if (!dueAt || Number.isNaN(Date.parse(dueAt))) {
    throw new AssignmentFormValidationError(
      "Assignment due date is required.",
      "dueAt",
    )
  }

  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    throw new AssignmentFormValidationError(
      "Max points must be greater than zero.",
      "maxScore",
    )
  }

  if (!form.allowTextSubmission && !form.allowFileSubmission) {
    throw new AssignmentFormValidationError(
      "Enable text, file, or both submission modes.",
      "submissionModes",
    )
  }

  return maxScore
}

function AssignmentFiles({
  assignment,
  onOpen,
}: {
  assignment: ClassAssignment
  onOpen: (assignment: ClassAssignment, fileId: string) => void
}) {
  if (assignment.files.length === 0) return null

  return (
    <div className="space-y-2">
      <Label>Files</Label>
      <div className="grid gap-2">
        {assignment.files.map((file) => (
          <button
            key={file.id}
            type="button"
            onClick={() => onOpen(assignment, file.id)}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50"
          >
            <span className="min-w-0 truncate">{file.originalFilename}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatFileSize(file.sizeBytes)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onCheckedChange,
  invalid = false,
  fieldKey,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  invalid?: boolean
  fieldKey?: AssignmentCreateFieldKey
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-[color,box-shadow]",
        invalid &&
          "border-destructive ring-[3px] ring-destructive/20 dark:ring-destructive/40",
      )}
      tabIndex={fieldKey ? -1 : undefined}
      data-assignment-form-field={fieldKey}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-invalid={invalid}
      />
      {label}
    </label>
  )
}

function AssignmentAiButtons({
  disabled,
  loadingMode,
  onGenerate,
}: {
  disabled: boolean
  loadingMode: AiSupportMode | null
  onGenerate: (mode: AiSupportMode) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={disabled || Boolean(loadingMode)}
        onClick={() => onGenerate("rubric")}
      >
        {loadingMode === "rubric" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Rubric
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={disabled || Boolean(loadingMode)}
        onClick={() => onGenerate("alternate_questions")}
      >
        {loadingMode === "alternate_questions" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Questions
      </Button>
    </div>
  )
}

function DeadlineFields({
  idPrefix,
  value,
  onChange,
  disabled,
  invalid = false,
  fieldKey,
  required = false,
}: {
  idPrefix: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  invalid?: boolean
  fieldKey?: AssignmentCreateFieldKey
  required?: boolean
}) {
  const date = getDeadlineDatePart(value)
  const time = getDeadlineTimePart(value)

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_9.5rem]">
      <div className="space-y-2">
        {required ? (
          <RequiredLabel htmlFor={`${idPrefix}-due-date`}>
            Due date
          </RequiredLabel>
        ) : (
          <Label htmlFor={`${idPrefix}-due-date`}>Due date</Label>
        )}
        <Input
          id={`${idPrefix}-due-date`}
          type="date"
          value={date}
          onChange={(event) =>
            onChange(combineDeadlineParts(event.target.value, time))
          }
          disabled={disabled}
          aria-invalid={invalid}
          data-assignment-form-field={fieldKey}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-due-time`}>Time</Label>
        <Select
          value={time}
          onValueChange={(nextTime) =>
            onChange(combineDeadlineParts(date, nextTime))
          }
          disabled={disabled}
        >
          <SelectTrigger
            id={`${idPrefix}-due-time`}
            className="w-full"
            aria-invalid={invalid}
          >
            <SelectValue placeholder="Choose time" />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function AssignmentFormFields({
  form,
  generatingSupportMode,
  setForm,
  isMutating,
  onGenerateSupport,
}: {
  form: CreateForm
  generatingSupportMode?: AiSupportMode | null
  setForm: Dispatch<SetStateAction<CreateForm>>
  isMutating: boolean
  onGenerateSupport?: (mode: AiSupportMode) => void
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-assignment-title">Title</Label>
          <Input
            id="edit-assignment-title"
            value={form.title}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, title: event.target.value }))
            }
            disabled={isMutating}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="edit-assignment-description">Notes</Label>
            {onGenerateSupport ? (
              <AssignmentAiButtons
                disabled={isMutating}
                loadingMode={generatingSupportMode ?? null}
                onGenerate={onGenerateSupport}
              />
            ) : null}
          </div>
          <Textarea
            id="edit-assignment-description"
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                description: event.target.value,
              }))
            }
            disabled={isMutating}
            rows={4}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <DeadlineFields
            idPrefix="edit-assignment"
            value={form.dueAt}
            onChange={(dueAt) => setForm((prev) => ({ ...prev, dueAt }))}
            disabled={isMutating}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-assignment-score">Max points</Label>
          <Input
            id="edit-assignment-score"
            type="number"
            min="1"
            step="0.5"
            value={form.maxScore}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, maxScore: event.target.value }))
            }
            disabled={isMutating}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-assignment-files">Add prompt files</Label>
          <AssignmentFilePicker
            id="edit-assignment-files"
            multiple
            disabled={isMutating}
            selectedText={formatSelectedFileText(form.files)}
            description="Attach additional prompt files"
            onFiles={(files) =>
              setForm((prev) => ({
                ...prev,
                files,
              }))
            }
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckRow
          label="Accept text responses"
          checked={form.allowTextSubmission}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, allowTextSubmission: checked }))
          }
        />
        <CheckRow
          label="Accept file"
          checked={form.allowFileSubmission}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, allowFileSubmission: checked }))
          }
        />
        <CheckRow
          label="Accept late submissions"
          checked={form.allowLateSubmissions}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, allowLateSubmissions: checked }))
          }
        />
        <CheckRow
          label="Published"
          checked={form.status === "published"}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              status: checked ? "published" : "draft",
            }))
          }
        />
      </div>
    </>
  )
}

function appendAiSection(description: string, content: string) {
  return [description.trim(), content.trim()].filter(Boolean).join("\n\n")
}

function getSupportModeForTarget(
  target: AiSupportTarget | null,
  prefix: "create" | "edit",
): AiSupportMode | null {
  if (!target?.startsWith(`${prefix}:`)) return null

  return target.endsWith(":rubric") ? "rubric" : "alternate_questions"
}

function toDatetimeLocalValue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function getDeadlineDatePart(value: string) {
  return toDatetimeLocalValue(value).split("T")[0] ?? ""
}

function getDeadlineTimePart(value: string) {
  const time = toDatetimeLocalValue(value).split("T")[1]?.slice(0, 5)
  return TIME_OPTIONS.some((option) => option.value === time) ? time : "23:59"
}

function combineDeadlineParts(date: string, time: string) {
  if (!date) return ""
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = (time || "23:59").split(":").map(Number)
  const deadline = new Date(year, month - 1, day, hour, minute)

  return Number.isNaN(deadline.getTime()) ? "" : deadline.toISOString()
}

function RosterStatus({
  submission,
}: {
  submission?: ClassAssignmentSubmission
}) {
  if (!submission) {
    return <Badge variant="secondary">Missing</Badge>
  }

  if (submission.gradedAt) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
        Graded
      </Badge>
    )
  }

  if (submission.isLate) {
    return <Badge variant="destructive">Late</Badge>
  }

  return (
    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300">
      Submitted
    </Badge>
  )
}
