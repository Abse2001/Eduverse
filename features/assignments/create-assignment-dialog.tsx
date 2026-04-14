"use client"

import { useRef, useState, type FormEvent } from "react"
import { FileText, PlusCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Class } from "@/lib/mock-data"

export interface CreateAssignmentValues {
  title: string
  description: string
  classIds: string[]
  attachmentFileName?: string
}

interface CreateAssignmentDialogProps {
  classes: Class[]
  currentClassId: string
  onCreate: (values: CreateAssignmentValues) => void
}

export function CreateAssignmentDialog({
  classes,
  currentClassId,
  onCreate,
}: CreateAssignmentDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [selectedClassIds, setSelectedClassIds] = useState([currentClassId])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [titleError, setTitleError] = useState("")

  function resetForm() {
    setTitle("")
    setDescription("")
    setSelectedClassIds([currentClassId])
    setSelectedFile(null)
    setTitleError("")

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)

    if (!nextOpen) {
      resetForm()
    }
  }

  function removeSelectedFile() {
    setSelectedFile(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function handleClassCheckedChange(classId: string, checked: boolean) {
    if (classId === currentClassId) return

    setSelectedClassIds((current) =>
      checked
        ? [...current, classId]
        : current.filter((candidate) => candidate !== classId),
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setTitleError("Title is required.")
      return
    }

    onCreate({
      title: trimmedTitle,
      description: description.trim(),
      classIds: selectedClassIds,
      attachmentFileName: selectedFile?.name,
    })

    resetForm()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <PlusCircle className="w-4 h-4" />
          New Assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 px-6 pt-6 pr-12 pb-4">
          <DialogTitle>Create Assignment</DialogTitle>
          <DialogDescription>
            Add a new assignment for the selected classes. Only students in
            those classes can see it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-6 py-2">
            <FieldGroup className="gap-4">
              <Field data-invalid={Boolean(titleError)}>
                <Label htmlFor="assignment-title">Title</Label>
                <Input
                  id="assignment-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    if (titleError) setTitleError("")
                  }}
                  placeholder="Assignment title"
                  aria-invalid={Boolean(titleError)}
                  aria-describedby={
                    titleError ? "assignment-title-error" : undefined
                  }
                />
                <FieldError id="assignment-title-error">
                  {titleError}
                </FieldError>
              </Field>

              <Field>
                <Label htmlFor="assignment-description">
                  Description / Instructions
                </Label>
                <Textarea
                  id="assignment-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add instructions or context for students"
                  className="min-h-28 resize-none"
                />
                <FieldDescription>
                  Optional notes, requirements, or submission guidance.
                </FieldDescription>
              </Field>

              <Field>
                <Label>Classes</Label>
                <div className="space-y-2 rounded-md border border-input p-3">
                  {classes.map((cls) => {
                    const checked = selectedClassIds.includes(cls.id)
                    const isCurrentClass = cls.id === currentClassId

                    return (
                      <label
                        key={cls.id}
                        className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isCurrentClass}
                          onCheckedChange={(value) =>
                            handleClassCheckedChange(cls.id, value === true)
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">
                            {cls.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {cls.code}
                            {isCurrentClass ? " - Current class" : ""}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <FieldDescription>
                  The current class is always included.
                </FieldDescription>
              </Field>

              <Field>
                <Label htmlFor="assignment-pdf">PDF Upload</Label>
                <Input
                  ref={fileInputRef}
                  id="assignment-pdf"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] ?? null)
                  }
                />
                {selectedFile ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{selectedFile.name}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={removeSelectedFile}
                      aria-label="Remove selected PDF"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                <FieldDescription>
                  Optional PDF handout or instructions.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create Assignment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
