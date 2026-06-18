"use client"

import { format } from "date-fns"
import {
  Download,
  FileDown,
  FileText,
  ImageIcon,
  Layers,
  Loader2,
  PlusCircle,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react"
import Image from "next/image"
import { type FormEvent, use, useEffect, useState } from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownContent } from "@/features/ai/markdown-content"
import {
  downloadCachedMedia,
  loadCachedMedia,
} from "@/features/chat/media-cache"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import {
  type ClassMaterial,
  useClassMaterials,
} from "@/features/materials/use-class-materials"
import { toast } from "@/hooks/use-toast"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

type FilterType = "all" | ClassMaterial["type"]

const TYPE_CONFIG: Record<
  ClassMaterial["type"],
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  image: {
    label: "Image",
    icon: ImageIcon,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
  },
  pdf: {
    label: "PDF",
    icon: FileText,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/30",
  },
  video: {
    label: "Video",
    icon: Video,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/30",
  },
  slide: {
    label: "Slides",
    icon: Layers,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/30",
  },
}

export default function MaterialsPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { authUser, currentUser } = useApp()
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "materials")
  const {
    materials,
    isLoading: isLoadingMaterials,
    isUploading,
    errorMessage: materialsError,
    uploadMaterial,
    deleteMaterial,
    refreshMaterials,
  } = useClassMaterials({
    classId,
    uploaderUserId: authUser?.id ?? currentUser.id ?? null,
  })
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState("")
  const [uploadDescription, setUploadDescription] = useState("")
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [openingMaterialId, setOpeningMaterialId] = useState<string | null>(
    null,
  )
  const [summaryMaterial, setSummaryMaterial] = useState<ClassMaterial | null>(
    null,
  )
  const [materialSummary, setMaterialSummary] = useState("")
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const uploadOrMaterialsError = uploadError ?? materialsError

  useEffect(() => {
    if (!materialsError && !uploadError) return

    toast({
      title: uploadError
        ? "Could not upload material"
        : "Could not load materials",
      description: uploadOrMaterialsError,
      variant: "destructive",
    })
  }, [materialsError, uploadError, uploadOrMaterialsError])

  useEffect(() => {
    if (!summaryError) return

    toast({
      title: "Could not summarize material",
      description: summaryError,
      variant: "destructive",
    })
  }, [summaryError])

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return (
      <ClassFeatureDisabledFallback
        classId={classId}
        featureLabel="Materials"
      />
    )
  }

  const canUpload =
    currentUser.role === "teacher" || currentUser.role === "admin"
  const filtered = materials.filter((material) => {
    const normalizedSearch = search.toLowerCase()
    const matchesSearch =
      material.title.toLowerCase().includes(normalizedSearch) ||
      material.originalFilename.toLowerCase().includes(normalizedSearch) ||
      material.description.toLowerCase().includes(normalizedSearch)
    const matchesFilter = filter === "all" || material.type === filter

    return matchesSearch && matchesFilter
  })

  const filterCounts: Record<FilterType, number> = {
    all: materials.length,
    image: materials.filter((material) => material.type === "image").length,
    pdf: materials.filter((material) => material.type === "pdf").length,
    video: materials.filter((material) => material.type === "video").length,
    slide: materials.filter((material) => material.type === "slide").length,
  }

  const filterLabels: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "image", label: "Images" },
    { key: "slide", label: "Slides" },
    { key: "pdf", label: "PDFs" },
    { key: "video", label: "Videos" },
  ]

  function resetUploadForm() {
    setSelectedFile(null)
    setUploadTitle("")
    setUploadDescription("")
    setUploadError(null)
  }

  function selectUploadFile(file?: File) {
    if (!file) return

    setSelectedFile(file)
    setUploadError(null)
    if (!uploadTitle.trim()) {
      setUploadTitle(titleFromFileName(file.name))
    }
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedFile) {
      setUploadError("Choose a file to upload.")
      return
    }

    try {
      setUploadError(null)
      await uploadMaterial({
        file: selectedFile,
        title: uploadTitle,
        description: uploadDescription,
      })
      resetUploadForm()
      setIsUploadOpen(false)
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Could not upload material.",
      )
    }
  }

  async function openMaterial(
    material: ClassMaterial,
    disposition: "inline" | "attachment" = "inline",
  ) {
    try {
      setOpeningMaterialId(material.id)
      if (disposition === "attachment") {
        await downloadCachedMedia({
          classId,
          materialId: material.id,
          fileName: material.originalFilename,
        })
      } else {
        const media = await loadCachedMedia({
          classId,
          materialId: material.id,
        })
        window.open(media.objectUrl, "_blank", "noopener,noreferrer")
      }
    } finally {
      setOpeningMaterialId(null)
    }
  }

  async function removeMaterial(material: ClassMaterial) {
    if (!window.confirm(`Delete ${material.title}?`)) return

    try {
      setOpeningMaterialId(material.id)
      await deleteMaterial(material.id)
    } catch (error) {
      toast({
        title: "Could not delete material",
        description:
          error instanceof Error ? error.message : "Could not delete material.",
        variant: "destructive",
      })
    } finally {
      setOpeningMaterialId(null)
    }
  }

  async function summarizeMaterial(material: ClassMaterial) {
    setSummaryMaterial(material)
    setMaterialSummary("")
    setSummaryError(null)
    setIsSummarizing(true)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(
          classId,
        )}/materials/${encodeURIComponent(material.id)}/ai/summary`,
        { method: "POST" },
      )
      const payload = (await response.json().catch(() => null)) as {
        summary?: string
        cached?: boolean
        generatedAt?: string | null
        error?: string
      } | null

      if (!response.ok || !payload?.summary) {
        throw new Error(payload?.error ?? "Could not summarize material.")
      }

      setMaterialSummary(payload.summary)
      if (!material.hasAiSummary || !payload.cached) {
        setSummaryMaterial({
          ...material,
          hasAiSummary: true,
          aiSummaryGeneratedAt:
            payload.generatedAt ?? material.aiSummaryGeneratedAt,
        })
        void refreshMaterials()
      }
    } catch (error) {
      setSummaryError(
        error instanceof Error
          ? error.message
          : "Could not summarize material.",
      )
    } finally {
      setIsSummarizing(false)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <ClassPageHeader
        title={cls.name}
        code={cls.code}
        section="Materials"
        actions={
          canUpload ? (
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setIsUploadOpen(true)}
            >
              <PlusCircle className="w-4 h-4" />
              Upload Material
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search materials..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {filterLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                filter === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:border-primary/50 hover:text-foreground",
              )}
            >
              {label}
              {filterCounts[key] > 0 && (
                <span
                  className={cn(
                    "ml-1",
                    filter === key ? "opacity-70" : "opacity-50",
                  )}
                >
                  {filterCounts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoadingMaterials ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner />
          Loading materials...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No materials found</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              isOpening={openingMaterialId === material.id}
              onOpen={() => openMaterial(material)}
              onDownload={() => openMaterial(material, "attachment")}
              onSummarize={() => summarizeMaterial(material)}
              onDelete={canUpload ? () => removeMaterial(material) : undefined}
            />
          ))}
        </div>
      )}

      <Dialog
        open={isUploadOpen}
        onOpenChange={(open) => {
          setIsUploadOpen(open)
          if (!open && !isUploading) resetUploadForm()
        }}
      >
        <DialogContent>
          <form onSubmit={submitUpload} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Upload material</DialogTitle>
              <DialogDescription>
                Add an image, PDF, video, or slide deck to this class.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="material-file">File</Label>
              <MaterialFilePicker
                id="material-file"
                accept="image/*,application/pdf,video/*,.ppt,.pptx,.odp,.key"
                disabled={isUploading}
                selectedText={selectedFile?.name ?? ""}
                onFile={selectUploadFile}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="material-title">Title</Label>
              <Input
                id="material-title"
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                disabled={isUploading}
                placeholder="Lecture 4 notes"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="material-description">Description</Label>
              <Textarea
                id="material-description"
                value={uploadDescription}
                onChange={(event) => setUploadDescription(event.target.value)}
                disabled={isUploading}
                placeholder="Optional context for students"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUploadOpen(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!selectedFile || isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(summaryMaterial)}
        onOpenChange={(open) => {
          if (!open && !isSummarizing) {
            setSummaryMaterial(null)
            setMaterialSummary("")
            setSummaryError(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {summaryMaterial?.title ?? "Study summary"}
            </DialogTitle>
            <DialogDescription>
              {summaryMaterial?.hasAiSummary
                ? "Saved AI-generated study support for this material."
                : "AI-generated study support for this material."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Avoid using AI with personal or sensitive material.
          </p>

          {isSummarizing ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {summaryMaterial?.hasAiSummary
                ? "Loading study summary..."
                : "Creating study summary..."}
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border bg-muted/30 p-4">
              {materialSummary ? (
                <MarkdownContent content={materialSummary} />
              ) : (
                <p className="text-sm text-muted-foreground">No summary yet.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!summaryMaterial || !materialSummary) return
                downloadSummaryPdf(summaryMaterial, materialSummary)
              }}
              disabled={isSummarizing || !materialSummary || !summaryMaterial}
            >
              <FileDown className="w-4 h-4" />
              Download PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSummaryMaterial(null)}
              disabled={isSummarizing}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MaterialCard({
  material,
  isOpening,
  onOpen,
  onDownload,
  onSummarize,
  onDelete,
}: {
  material: ClassMaterial
  isOpening: boolean
  onOpen: () => void
  onDownload: () => void
  onSummarize: () => void
  onDelete?: () => void
}) {
  const cfg = TYPE_CONFIG[material.type]
  const Icon = cfg.icon

  return (
    <Card className="group hover:shadow-md transition-all hover:border-primary/30 overflow-hidden">
      {material.type === "image" && material.thumbnailUrl ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full bg-muted text-left"
        >
          <Image
            src={material.thumbnailUrl}
            alt={material.title}
            width={480}
            height={216}
            unoptimized
            className="h-36 w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "flex h-36 w-full items-center justify-center",
            cfg.bg,
            cfg.color,
          )}
        >
          <Icon className="h-10 w-10" />
        </button>
      )}
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              cfg.bg,
            )}
          >
            <Icon className={cn("w-5 h-5", cfg.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={onOpen}
                className="block min-w-0 flex-1 text-left text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors"
              >
                {material.title}
              </button>
              {material.hasAiSummary ? (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  Summarized
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatBytes(material.sizeBytes)} &middot;{" "}
              {format(new Date(material.createdAt), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        {material.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {material.description}
          </p>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {material.originalFilename}
        </p>
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <Badge
            variant="secondary"
            className={cn("text-[10px] border-0", cfg.bg, cfg.color)}
          >
            {material.source === "chat" ? "Chat" : cfg.label}
          </Badge>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={onSummarize}
              disabled={isOpening}
            >
              <Sparkles className="h-3 w-3" />
              Study
            </Button>
            {onDelete ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                disabled={isOpening}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5 h-7"
              onClick={onDownload}
              disabled={isOpening}
            >
              {isOpening ? (
                <Spinner className="w-3 h-3" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              Download
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MaterialFilePicker({
  id,
  accept,
  disabled,
  selectedText,
  onFile,
}: {
  id: string
  accept: string
  disabled: boolean
  selectedText: string
  onFile: (file?: File) => void
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
          accept={accept}
          className="sr-only"
          onChange={(event) => onFile(event.target.files?.[0])}
          disabled={disabled}
        />
        <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Choose file</span>
        <span className="mt-1 text-xs text-muted-foreground">
          Add a class material file
        </span>
      </label>
      <p className="min-h-4 text-xs text-muted-foreground">{selectedText}</p>
    </>
  )
}

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB"]
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exp

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exp]}`
}

function downloadSummaryPdf(material: ClassMaterial, summary: string) {
  const pdfBytes = createSummaryPdf({
    title: material.title,
    fileName: material.originalFilename,
    generatedAt: material.aiSummaryGeneratedAt,
    summary,
  })
  const blob = new Blob([pdfBytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = `${slugifyFileName(material.title)}-study-summary.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function createSummaryPdf(input: {
  title: string
  fileName: string
  generatedAt: string | null
  summary: string
}) {
  const pageWidth = 595
  const pageHeight = 842
  const margin = 48
  const bodyFontSize = 11
  const bodyLineHeight = 15
  const contentWidth = pageWidth - margin * 2
  const lines: PdfBlock[] = [
    ...wrapPdfText(input.title, 48).map((text, index) => ({
      text,
      fontSize: index === 0 ? 18 : 16,
      lineHeight: 22,
      indent: 0,
      font: "bold" as const,
    })),
    {
      text: `Source: ${input.fileName}`,
      fontSize: 10,
      lineHeight: 14,
      indent: 0,
      font: "regular" as const,
    },
    {
      text: `Generated: ${
        input.generatedAt
          ? format(new Date(input.generatedAt), "MMM d, yyyy h:mm a")
          : format(new Date(), "MMM d, yyyy h:mm a")
      }`,
      fontSize: 10,
      lineHeight: 18,
      indent: 0,
      font: "regular" as const,
    },
    {
      text: "",
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      indent: 0,
      font: "regular" as const,
    },
    ...markdownToPdfBlocks(input.summary, contentWidth, bodyFontSize),
  ]
  const pages: string[][] = []
  let currentPage: string[] = []
  let y = pageHeight - margin

  for (const line of lines) {
    if (isPdfTableBlock(line)) {
      if (line.spaceBefore) y -= line.spaceBefore

      const columnCount = Math.max(line.headers.length, 1)
      const columnWidth = contentWidth / columnCount
      const tableRows = [line.headers, ...line.rows]

      for (const [rowIndex, row] of tableRows.entries()) {
        const fontSize = rowIndex === 0 ? 9 : 8
        const rowFont = rowIndex === 0 ? "F2" : "F1"
        const cellLineHeight = 11
        const maxCellChars = Math.max(
          8,
          Math.floor((columnWidth - 8) / (fontSize * 0.52)),
        )
        const wrappedCells = Array.from({ length: columnCount }, (_, index) =>
          wrapPdfText(cleanMarkdownText(row[index] ?? ""), maxCellChars),
        )
        const totalRowLines = Math.max(
          1,
          ...wrappedCells.map((cellLines) => cellLines.length),
        )
        let renderedRowLines = 0

        while (renderedRowLines < totalRowLines) {
          const availableLines = Math.max(
            0,
            Math.floor((y - margin - 8) / cellLineHeight),
          )

          if (availableLines <= 0) {
            pages.push(currentPage)
            currentPage = []
            y = pageHeight - margin
            continue
          }

          const linesThisChunk = Math.min(
            availableLines,
            totalRowLines - renderedRowLines,
          )
          const rowHeight = linesThisChunk * cellLineHeight + 8
          const rowTop = y
          const rowBottom = y - rowHeight
          currentPage.push(
            `${margin} ${rowBottom} ${contentWidth} ${rowHeight} re S`,
          )

          for (let columnIndex = 1; columnIndex < columnCount; columnIndex++) {
            const x = margin + columnWidth * columnIndex
            currentPage.push(`${x} ${rowBottom} m ${x} ${rowTop} l S`)
          }

          wrappedCells.forEach((cellLines, columnIndex) => {
            const x = margin + columnWidth * columnIndex + 4
            cellLines
              .slice(renderedRowLines, renderedRowLines + linesThisChunk)
              .forEach((cellLine, lineIndex) => {
                currentPage.push(
                  `BT /${rowFont} ${fontSize} Tf 1 0 0 1 ${x} ${
                    rowTop - 13 - lineIndex * cellLineHeight
                  } Tm (${escapePdfText(cellLine)}) Tj ET`,
                )
              })
          })

          renderedRowLines += linesThisChunk
          y -= rowHeight
        }
      }

      y -= 8
      continue
    }

    const spaceBefore = "spaceBefore" in line ? (line.spaceBefore ?? 0) : 0
    const lineHeight = line.lineHeight + spaceBefore
    if (y - lineHeight < margin) {
      pages.push(currentPage)
      currentPage = []
      y = pageHeight - margin
    }

    y -= spaceBefore

    if (isPdfRuleBlock(line)) {
      currentPage.push(
        `${margin} ${y - 4} m ${pageWidth - margin} ${y - 4} l S`,
      )
      y -= line.lineHeight
      continue
    }

    if (line.text) {
      const fontName = line.font === "bold" ? "F2" : "F1"
      currentPage.push(
        `BT /${fontName} ${line.fontSize} Tf 1 0 0 1 ${margin + line.indent} ${y} Tm (${escapePdfText(
          line.text,
        )}) Tj ET`,
      )
    }

    y -= lineHeight
  }

  pages.push(currentPage)

  const objects: string[] = []
  const pageObjectNumbers: number[] = []
  const fontObjectNumber = 3
  const boldFontObjectNumber = 4

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[fontObjectNumber] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  objects[boldFontObjectNumber] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"

  pages.forEach((pageCommands, index) => {
    const pageObjectNumber = 5 + index * 2
    const contentObjectNumber = pageObjectNumber + 1
    const stream = pageCommands.join("\n")

    pageObjectNumbers.push(pageObjectNumber)
    objects[pageObjectNumber] = [
      "<< /Type /Page",
      "/Parent 2 0 R",
      `/MediaBox [0 0 ${pageWidth} ${pageHeight}]`,
      `/Resources << /Font << /F1 ${fontObjectNumber} 0 R /F2 ${boldFontObjectNumber} 0 R >> >>`,
      `/Contents ${contentObjectNumber} 0 R`,
      ">>",
    ].join(" ")
    objects[contentObjectNumber] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })

  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers
    .map((pageObjectNumber) => `${pageObjectNumber} 0 R`)
    .join(" ")}] /Count ${pageObjectNumbers.length} >>`

  return encodePdf(objects)
}

function encodePdf(objects: string[]) {
  const parts = ["%PDF-1.4\n"]
  const offsets = [0]

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber++) {
    offsets[objectNumber] = byteLength(parts.join(""))
    parts.push(`${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`)
  }

  const xrefOffset = byteLength(parts.join(""))
  parts.push(`xref\n0 ${objects.length}\n`)
  parts.push("0000000000 65535 f \n")

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber++) {
    parts.push(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`)
  }

  parts.push(
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  )

  return new TextEncoder().encode(parts.join(""))
}

type PdfTextBlock = {
  text: string
  fontSize: number
  lineHeight: number
  indent: number
  font: "regular" | "bold"
  spaceBefore?: number
}

type PdfRuleBlock = {
  rule: true
  text: ""
  fontSize: number
  lineHeight: number
  indent: number
  font: "regular"
  spaceBefore?: number
}

type PdfTableBlock = {
  table: true
  headers: string[]
  rows: string[][]
  spaceBefore?: number
}

type PdfBlock = PdfTextBlock | PdfRuleBlock | PdfTableBlock

function isPdfTableBlock(block: PdfBlock): block is PdfTableBlock {
  return "table" in block
}

function isPdfRuleBlock(block: PdfBlock): block is PdfRuleBlock {
  return "rule" in block
}

function markdownToPdfBlocks(
  markdown: string,
  contentWidth: number,
  bodyFontSize: number,
) {
  const blocks: PdfBlock[] = []
  const bodyLineHeight = 15
  const sourceLines = markdown.replace(/\r\n/g, "\n").split("\n")

  for (let index = 0; index < sourceLines.length; index++) {
    const rawLine = sourceLines[index]
    const originalLine = rawLine.replace(/\t/g, "  ")
    const trimmed = originalLine.trim()

    if (
      isMarkdownTableRow(trimmed) &&
      isMarkdownTableSeparator(sourceLines[index + 1]?.trim() ?? "")
    ) {
      const headers = parseMarkdownTableRow(trimmed)
      const rows: string[][] = []
      index += 2

      while (index < sourceLines.length) {
        const tableLine = sourceLines[index].trim()
        if (isMarkdownTableRow(tableLine)) {
          rows.push(parseMarkdownTableRow(tableLine))
          index++
          continue
        }

        if (isLikelyBrokenTableContinuation(tableLine) && rows.length > 0) {
          const lastRow = rows[rows.length - 1]
          const lastCellIndex = Math.max(0, lastRow.length - 1)
          lastRow[lastCellIndex] =
            `${lastRow[lastCellIndex]} ${cleanMarkdownText(
              tableLine.replace(/^\|\s*/, ""),
            )}`.trim()
          index++
          continue
        }

        if (isLikelyBrokenTableContinuation(tableLine) && rows.length === 0) {
          rows.push([cleanMarkdownText(tableLine.replace(/^\|\s*/, ""))])
          index++
          continue
        }

        index--
        break
      }

      blocks.push({
        table: true,
        headers,
        rows,
        spaceBefore: blocks.length ? 8 : 0,
      })
      continue
    }

    if (!trimmed) {
      blocks.push({
        text: "",
        fontSize: bodyFontSize,
        lineHeight: 8,
        indent: 0,
        font: "regular",
      })
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({
        rule: true,
        text: "",
        fontSize: bodyFontSize,
        lineHeight: 14,
        indent: 0,
        font: "regular",
        spaceBefore: 2,
      })
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      blocks.push(
        ...makeWrappedPdfBlocks(cleanMarkdownText(heading[2]), {
          contentWidth,
          fontSize: level <= 2 ? 14 : 12,
          lineHeight: level <= 2 ? 18 : 16,
          indent: 0,
          font: "bold",
          spaceBefore: blocks.length ? 8 : 0,
        }),
      )
      continue
    }

    const bullet = trimmed.match(/^([-*+])\s+(.+)$/)
    if (bullet) {
      const nestingLevel = getMarkdownListNestingLevel(originalLine)
      const bulletText = cleanChecklistMarkdown(bullet[2])
      blocks.push(
        ...makeWrappedPdfBlocks(`- ${cleanMarkdownText(bulletText)}`, {
          contentWidth,
          fontSize: bodyFontSize,
          lineHeight: bodyLineHeight,
          indent: 12 + nestingLevel * 14,
          hangingIndent: 12,
          font: "regular",
        }),
      )
      continue
    }

    const numbered = trimmed.match(/^(\d+[.)])\s+(.+)$/)
    if (numbered) {
      const nestingLevel = getMarkdownListNestingLevel(originalLine)
      blocks.push(
        ...makeWrappedPdfBlocks(
          `${numbered[1]} ${cleanMarkdownText(numbered[2])}`,
          {
            contentWidth,
            fontSize: bodyFontSize,
            lineHeight: bodyLineHeight,
            indent: 12 + nestingLevel * 14,
            hangingIndent: 18,
            font: "regular",
          },
        ),
      )
      continue
    }

    const quote = trimmed.match(/^>\s*(.+)$/)
    if (quote) {
      blocks.push(
        ...makeWrappedPdfBlocks(cleanMarkdownText(quote[1]), {
          contentWidth,
          fontSize: bodyFontSize,
          lineHeight: bodyLineHeight,
          indent: 16,
          font: "regular",
        }),
      )
      continue
    }

    blocks.push(
      ...makeWrappedPdfBlocks(cleanMarkdownText(trimmed), {
        contentWidth,
        fontSize: bodyFontSize,
        lineHeight: bodyLineHeight,
        indent: 0,
        font: looksLikeSectionLabel(trimmed) ? "bold" : "regular",
        spaceBefore: looksLikeSectionLabel(trimmed) ? 6 : 0,
      }),
    )
  }

  return blocks
}

function isMarkdownTableRow(line: string) {
  return line.includes("|") && parseMarkdownTableRow(line).length >= 2
}

function isMarkdownTableSeparator(line: string) {
  if (!line.includes("|")) return false
  return parseMarkdownTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isLikelyBrokenTableContinuation(line: string) {
  return line.startsWith("|") && !isMarkdownTableSeparator(line)
}

function parseMarkdownTableRow(line: string) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanMarkdownText(cell.trim()))
}

function getMarkdownListNestingLevel(line: string) {
  const leadingSpaces = line.match(/^\s*/)?.[0].length ?? 0
  return Math.min(4, Math.floor(leadingSpaces / 2))
}

function makeWrappedPdfBlocks(
  text: string,
  options: {
    contentWidth: number
    fontSize: number
    lineHeight: number
    indent: number
    font: "regular" | "bold"
    spaceBefore?: number
    hangingIndent?: number
  },
) {
  const averageCharWidth = options.fontSize * 0.52
  const maxChars = Math.max(
    24,
    Math.floor((options.contentWidth - options.indent) / averageCharWidth),
  )

  return wrapPdfText(text, maxChars).map((line, index) => ({
    text: line,
    fontSize: options.fontSize,
    lineHeight: options.lineHeight,
    indent:
      index === 0
        ? options.indent
        : options.indent + (options.hangingIndent ?? 0),
    font: options.font,
    spaceBefore: index === 0 ? options.spaceBefore : 0,
  }))
}

function cleanMarkdownText(text: string) {
  return text
    .replace(/\[( |x|X)\]\s*/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanChecklistMarkdown(text: string) {
  return text.replace(/^\[( |x|X)\]\s*/, "")
}

function looksLikeSectionLabel(text: string) {
  return /^[A-Z][A-Za-z\s]{2,40}:$/.test(cleanMarkdownText(text))
}

function wrapPdfText(text: string, maxChars: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      continue
    }

    if (current) lines.push(current)
    current = word

    while (current.length > maxChars) {
      lines.push(current.slice(0, maxChars))
      current = current.slice(maxChars)
    }
  }

  if (current) lines.push(current)
  return lines
}

function escapePdfText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
}

function slugifyFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "material"
  )
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}
