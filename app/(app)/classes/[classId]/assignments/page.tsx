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
  Send,
  Trash2,
  Upload,
} from "lucide-react"
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  use,
  useMemo,
  useState,
} from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import {
  type AssignmentDerivedStatus,
  type ClassAssignment,
  type ClassAssignmentSubmission,
  getAssignmentDerivedStatus,
  useClassAssignments,
} from "@/features/assignments/use-class-assignments"
import { formatFileSize } from "@/features/chat/file-utils"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

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
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const maxScore = Number.parseFloat(createForm.maxScore)

    if (!createForm.allowTextSubmission && !createForm.allowFileSubmission) {
      setFormError("Enable text, file, or both submission modes.")
      return
    }

    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      setFormError("Max points must be greater than zero.")
      return
    }

    try {
      setFormError(null)
      await createAssignment({
        title: createForm.title,
        description: createForm.description,
        dueAt: createForm.dueAt,
        maxScore,
        status: createForm.status,
        allowLateSubmissions: createForm.allowLateSubmissions,
        allowTextSubmission: createForm.allowTextSubmission,
        allowFileSubmission: createForm.allowFileSubmission,
        files: createForm.files,
      })
      resetCreateForm()
      setIsCreateOpen(false)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not create assignment.",
      )
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

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{cls.name}</h1>
          <p className="text-sm text-muted-foreground">
            {cls.code} &middot; {visibleAssignments.length} assignments
          </p>
        </div>
        {canManage && (
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setIsCreateOpen(true)}
          >
            <PlusCircle className="w-4 h-4" />
            New Assignment
          </Button>
        )}
      </div>

      {assignmentsError && (
        <Alert variant="destructive">
          <AlertDescription>{assignmentsError}</AlertDescription>
        </Alert>
      )}

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
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open && !isMutating) resetCreateForm()
        }}
      >
        <DialogContent className="max-w-2xl">
          <form onSubmit={submitCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create assignment</DialogTitle>
              <DialogDescription>
                Draft or publish work for this class.
              </DialogDescription>
            </DialogHeader>

            {(formError || assignmentsError) && (
              <Alert variant="destructive">
                <AlertDescription>
                  {formError ?? assignmentsError}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="assignment-title">Title</Label>
                <Input
                  id="assignment-title"
                  value={createForm.title}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  disabled={isMutating}
                  placeholder="Essay draft"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="assignment-description">Notes</Label>
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
                  onChange={(dueAt) =>
                    setCreateForm((prev) => ({ ...prev, dueAt }))
                  }
                  disabled={isMutating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignment-score">Max points</Label>
                <Input
                  id="assignment-score"
                  type="number"
                  min="1"
                  step="0.5"
                  value={createForm.maxScore}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      maxScore: event.target.value,
                    }))
                  }
                  disabled={isMutating}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="assignment-files">Prompt files</Label>
                <Input
                  id="assignment-files"
                  type="file"
                  multiple
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      files: Array.from(event.target.files ?? []),
                    }))
                  }
                  disabled={isMutating}
                />
                {createForm.files.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {createForm.files.length} file
                    {createForm.files.length === 1 ? "" : "s"} selected
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CheckRow
                label="Accept text responses"
                checked={createForm.allowTextSubmission}
                onCheckedChange={(checked) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    allowTextSubmission: checked,
                  }))
                }
              />
              <CheckRow
                label="Accept file"
                checked={createForm.allowFileSubmission}
                onCheckedChange={(checked) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    allowFileSubmission: checked,
                  }))
                }
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
              <CheckRow
                label="Publish now"
                checked={createForm.status === "published"}
                onCheckedChange={(checked) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    status: checked ? "published" : "draft",
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
              <Button type="submit" disabled={isMutating}>
                {isMutating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Save
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

              {(formError || assignmentsError) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {formError ?? assignmentsError}
                  </AlertDescription>
                </Alert>
              )}

              <AssignmentFormFields
                form={editForm}
                setForm={setEditForm}
                isMutating={isMutating}
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
              {(formError || assignmentsError) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {formError ?? assignmentsError}
                  </AlertDescription>
                </Alert>
              )}
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
                  <Input
                    id="submission-file"
                    type="file"
                    onChange={(event) =>
                      setSubmissionFile(event.target.files?.[0] ?? null)
                    }
                    disabled={isMutating}
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
          <DialogContent className="max-w-[calc(100vw-2rem)] lg:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{reviewAssignment.title}</DialogTitle>
              <DialogDescription>
                Review submissions from the class roster.
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="min-w-0 rounded-lg border">
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

              <div className="min-w-0 rounded-lg border p-4">
                {selectedSubmission ? (
                  <form onSubmit={submitGrade} className="space-y-4">
                    {formError && (
                      <Alert variant="destructive">
                        <AlertDescription>{formError}</AlertDescription>
                      </Alert>
                    )}
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
                      <Label htmlFor="grade-feedback">Feedback</Label>
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
                  <div className="grid min-h-64 min-w-0 place-items-center px-4 text-center text-sm text-muted-foreground">
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
        <p className="pt-2 text-sm leading-6 text-foreground">
          {assignment.description}
        </p>
      )}
    </DialogHeader>
  )
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
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      {label}
    </label>
  )
}

function DeadlineFields({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const date = getDeadlineDatePart(value)
  const time = getDeadlineTimePart(value)

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_9.5rem]">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-due-date`}>Due date</Label>
        <Input
          id={`${idPrefix}-due-date`}
          type="date"
          value={date}
          onChange={(event) =>
            onChange(combineDeadlineParts(event.target.value, time))
          }
          disabled={disabled}
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
          <SelectTrigger id={`${idPrefix}-due-time`} className="w-full">
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
  setForm,
  isMutating,
}: {
  form: CreateForm
  setForm: Dispatch<SetStateAction<CreateForm>>
  isMutating: boolean
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
          <Label htmlFor="edit-assignment-description">Notes</Label>
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
          <Input
            id="edit-assignment-files"
            type="file"
            multiple
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                files: Array.from(event.target.files ?? []),
              }))
            }
            disabled={isMutating}
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

function toDatetimeLocalValue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function getDeadlineDatePart(value: string) {
  return value.split("T")[0] ?? ""
}

function getDeadlineTimePart(value: string) {
  const time = value.split("T")[1]?.slice(0, 5)
  return TIME_OPTIONS.some((option) => option.value === time) ? time : "23:59"
}

function combineDeadlineParts(date: string, time: string) {
  if (!date) return ""
  return `${date}T${time || "23:59"}`
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
