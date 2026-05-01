"use client"

import { use, useState } from "react"
import { getMaterialsByClass, Material } from "@/lib/mock-data"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import { useApp } from "@/lib/store"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  FileText,
  Video,
  Link as LinkIcon,
  Code2,
  Download,
  Search,
  PlusCircle,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

type FilterType = "all" | Material["type"]

const TYPE_CONFIG: Record<
  Material["type"],
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
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
  link: {
    label: "Link",
    icon: LinkIcon,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
  },
  code: {
    label: "Code",
    icon: Code2,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/30",
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
  const { currentUser } = useApp()
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "materials")
  const allMaterials = getMaterialsByClass(classId)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")

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

  const filtered = allMaterials.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
    const matchesFilter = filter === "all" || m.type === filter
    return matchesSearch && matchesFilter
  })

  const filterCounts: Record<FilterType, number> = {
    all: allMaterials.length,
    pdf: allMaterials.filter((m) => m.type === "pdf").length,
    video: allMaterials.filter((m) => m.type === "video").length,
    link: allMaterials.filter((m) => m.type === "link").length,
    code: allMaterials.filter((m) => m.type === "code").length,
    slide: allMaterials.filter((m) => m.type === "slide").length,
  }

  const filterLabels: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "slide", label: "Slides" },
    { key: "pdf", label: "PDFs" },
    { key: "video", label: "Videos" },
    { key: "code", label: "Code" },
    { key: "link", label: "Links" },
  ]

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{cls.name}</h1>
          <p className="text-sm text-muted-foreground">
            {cls.code} &middot; {allMaterials.length} materials
          </p>
        </div>
        {currentUser.role === "teacher" && (
          <Button size="sm" className="gap-2">
            <PlusCircle className="w-4 h-4" />
            Upload Material
          </Button>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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

      {/* Materials grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No materials found</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((mat) => {
            const cfg = TYPE_CONFIG[mat.type]
            const Icon = cfg.icon
            return (
              <Card
                key={mat.id}
                className="group hover:shadow-md transition-all hover:border-primary/30 cursor-pointer"
              >
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
                      <p className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
                        {mat.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {mat.size && <span>{mat.size} &middot; </span>}
                        {format(new Date(mat.uploadedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  {mat.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {mat.description}
                    </p>
                  )}
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
                      className="text-xs gap-1.5 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
