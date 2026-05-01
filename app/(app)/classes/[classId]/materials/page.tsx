"use client"

import { format } from "date-fns"
import {
  Download,
  FileText,
  ImageIcon,
  Layers,
  Loader2,
  PlusCircle,
  Search,
  Upload,
  Video,
} from "lucide-react"
import Image from "next/image"
import { type FormEvent, use, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import {
  type ClassMaterial,
  useClassMaterials,
} from "@/features/materials/use-class-materials"
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
    getDownloadUrl,
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
      const url = await getDownloadUrl(material.id, disposition)
      window.open(url, "_blank", "noopener,noreferrer")
    } finally {
      setOpeningMaterialId(null)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{cls.name}</h1>
          <p className="text-sm text-muted-foreground">
            {cls.code} &middot; {materials.length} materials
          </p>
        </div>
        {canUpload && (
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setIsUploadOpen(true)}
          >
            <PlusCircle className="w-4 h-4" />
            Upload Material
          </Button>
        )}
      </div>

      {materialsError && (
        <Alert variant="destructive">
          <AlertDescription>{materialsError}</AlertDescription>
        </Alert>
      )}

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

            {(uploadError || materialsError) && (
              <Alert variant="destructive">
                <AlertDescription>
                  {uploadError ?? materialsError}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="material-file">File</Label>
              <Input
                id="material-file"
                type="file"
                accept="image/*,application/pdf,video/*,.ppt,.pptx,.odp,.key"
                onChange={(event) => selectUploadFile(event.target.files?.[0])}
                disabled={isUploading}
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  {selectedFile.name} &middot; {formatBytes(selectedFile.size)}
                </p>
              )}
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
    </div>
  )
}

function MaterialCard({
  material,
  isOpening,
  onOpen,
  onDownload,
}: {
  material: ClassMaterial
  isOpening: boolean
  onOpen: () => void
  onDownload: () => void
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
            <button
              type="button"
              onClick={onOpen}
              className="block w-full text-left text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors"
            >
              {material.title}
            </button>
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
            {cfg.label}
          </Badge>
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
      </CardContent>
    </Card>
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
