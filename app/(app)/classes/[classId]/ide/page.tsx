"use client"

import {
  CheckCircle2,
  Folder,
  FolderOpen,
  Globe,
  PanelBottom,
  Play,
  Plus,
  RotateCcw,
  Save,
  SquareTerminal,
  X,
} from "lucide-react"
import dynamic from "next/dynamic"
import { use, useEffect, useMemo, useRef, useState } from "react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import type { PendingCreateEntry } from "@/features/ide/file-tree"
import { FileIcon, FileTree } from "@/features/ide/file-tree"
import { buildPreviewDocument, getProblems } from "@/features/ide/preview"
import { INITIAL_TERMINAL, PROJECT_TEMPLATES } from "@/features/ide/templates"
import { runVirtualCommand } from "@/features/ide/terminal"
import type {
  ClipboardState,
  PathChange,
  TerminalLine,
  Workspace,
} from "@/features/ide/types"
import {
  basename,
  buildFileTree,
  ensureParentDirectories,
  firstFilePath,
  isPathInside,
  joinPath,
  languageForPath,
  parentDir,
  pasteWorkspaceEntry,
  remapPathForRename,
  removePath,
  renameWorkspaceEntry,
  resolvePath,
  runCommandForPath,
} from "@/features/ide/workspace"
import { cn } from "@/lib/utils"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

type PreviewMode = "preview" | "console"
type PreviewConsoleLine = {
  id: number
  level: "log" | "info" | "warn" | "error"
  message: string
}
type SavedIdeWorkspace = {
  version: 1
  templateId: string
  workspace: Workspace
  activePath: string
  openPaths: string[]
  cwd: string
  fontSize: number
  savedAt: string
}

const TERMINAL_COLLAPSED_SIZE = 5
const TERMINAL_DEFAULT_SIZE = 28
const IDE_WORKSPACE_STORAGE_PREFIX = "eduverse:ide-workspace:"

export default function IdePage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "extensions.ide")

  const [templateId, setTemplateId] = useState(PROJECT_TEMPLATES[0].id)
  const [workspace, setWorkspace] = useState<Workspace>(
    () => PROJECT_TEMPLATES[0].files,
  )
  const [activePath, setActivePath] = useState(PROJECT_TEMPLATES[0].entryFile)
  const [openPaths, setOpenPaths] = useState<string[]>([
    PROJECT_TEMPLATES[0].entryFile,
  ])
  const [cwd, setCwd] = useState("/")
  const [terminalInput, setTerminalInput] = useState("")
  const [terminalLines, setTerminalLines] =
    useState<TerminalLine[]>(INITIAL_TERMINAL)
  const [terminalOpen, setTerminalOpen] = useState(true)
  const [terminalInputFocused, setTerminalInputFocused] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview")
  const [previewConsoleLines, setPreviewConsoleLines] = useState<
    PreviewConsoleLine[]
  >([])
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0)
  const [pendingCreate, setPendingCreate] = useState<PendingCreateEntry | null>(
    null,
  )
  const [clipboardPath, setClipboardPath] = useState<ClipboardState | null>(
    null,
  )
  const [fontSize, setFontSize] = useState(14)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const previewConsoleIdRef = useRef(1)
  const terminalIdRef = useRef(INITIAL_TERMINAL.length + 1)
  const terminalInputRef = useRef<HTMLInputElement | null>(null)
  const terminalPanelRef = useRef<ImperativePanelHandle | null>(null)
  const terminalScrollRef = useRef<HTMLDivElement | null>(null)
  const terminalBottomRef = useRef<HTMLDivElement | null>(null)
  const isDarkMode = useResolvedDarkMode()

  const activeEntry = workspace[activePath]
  const activeContent = activeEntry?.content ?? ""
  const hasMainHtml = workspace["/index.html"]?.kind === "file"
  const isMarkdownActive =
    activeEntry?.kind === "file" && activePath.endsWith(".md")
  const showPreviewPanel = hasMainHtml || isMarkdownActive
  const showPreviewTabs = hasMainHtml && !isMarkdownActive
  const fileTree = useMemo(() => buildFileTree(workspace), [workspace])
  const problems = useMemo(
    () => getProblems(workspace, activePath),
    [workspace, activePath],
  )
  const previewDocument = useMemo(
    () => buildPreviewDocument(workspace, activePath, isDarkMode),
    [workspace, activePath, isDarkMode],
  )

  useEffect(() => {
    const savedWorkspace = loadSavedIdeWorkspace(classId)
    if (!savedWorkspace) return

    setTemplateId(savedWorkspace.templateId)
    setWorkspace(savedWorkspace.workspace)
    setActivePath(savedWorkspace.activePath)
    setOpenPaths(savedWorkspace.openPaths)
    setCwd(savedWorkspace.cwd)
    setFontSize(savedWorkspace.fontSize)
    setSavedAt(new Date(savedWorkspace.savedAt))
  }, [classId])

  useEffect(() => {
    setPreviewConsoleLines([])
  }, [previewDocument])

  function refreshPreview() {
    setPreviewConsoleLines([])
    setPreviewRefreshKey((key) => key + 1)
  }

  useEffect(() => {
    function handlePreviewConsoleMessage(event: MessageEvent) {
      const data = event.data as {
        source?: string
        level?: PreviewConsoleLine["level"]
        message?: string
      }
      if (data?.source !== "eduverse-preview-console") return
      if (
        data.level !== "log" &&
        data.level !== "info" &&
        data.level !== "warn" &&
        data.level !== "error"
      ) {
        return
      }
      if (typeof data.message !== "string") return
      const level = data.level
      const message = data.message

      setPreviewConsoleLines((lines) => [
        ...lines,
        {
          id: previewConsoleIdRef.current++,
          level,
          message,
        },
      ])
    }

    window.addEventListener("message", handlePreviewConsoleMessage)
    return () => {
      window.removeEventListener("message", handlePreviewConsoleMessage)
    }
  }, [])

  function scrollTerminalToBottom(behavior: ScrollBehavior = "auto") {
    requestAnimationFrame(() => {
      terminalBottomRef.current?.scrollIntoView({
        block: "end",
        behavior,
      })
    })
  }

  function toggleTerminalPanel() {
    const panel = terminalPanelRef.current
    if (!panel) {
      setTerminalOpen((open) => !open)
      return
    }

    if (panel.isCollapsed()) {
      panel.expand(TERMINAL_DEFAULT_SIZE)
      setTerminalOpen(true)
      return
    }

    panel.collapse()
    setTerminalOpen(false)
  }

  useEffect(() => {
    if (!terminalOpen) return
    scrollTerminalToBottom()
  }, [terminalLines, terminalInput, terminalOpen])

  function appendTerminal(
    lines: Array<Omit<TerminalLine, "id">> | Omit<TerminalLine, "id">,
  ) {
    const nextLines = Array.isArray(lines) ? lines : [lines]
    setTerminalLines((currentLines) => [
      ...currentLines,
      ...nextLines.map((line) => ({
        ...line,
        id: terminalIdRef.current++,
      })),
    ])
  }

  function loadTemplate(nextTemplateId: string, messagePrefix: string) {
    const nextTemplate = getProjectTemplate(nextTemplateId)
    setTemplateId(nextTemplate.id)
    setWorkspace(nextTemplate.files)
    setActivePath(nextTemplate.entryFile)
    setOpenPaths([nextTemplate.entryFile])
    setCwd("/")
    setPreviewMode("preview")
    setSavedAt(null)
    setTerminalLines([
      {
        id: terminalIdRef.current++,
        kind: "success",
        text: `${messagePrefix} ${nextTemplate.label}.`,
      },
    ])
  }

  function switchTemplate(nextTemplateId: string) {
    loadTemplate(nextTemplateId, "Loaded")
  }

  function resetSavedWorkspace() {
    if (
      !window.confirm(
        "Clear the saved IDE workspace for this class and reset the current files?",
      )
    ) {
      return
    }

    window.localStorage.removeItem(getIdeWorkspaceStorageKey(classId))
    loadTemplate(templateId, "Reset")
  }

  function openFile(path: string) {
    if (workspace[path]?.kind !== "file") return
    activateFile(path)
  }

  function activateFile(path: string) {
    setActivePath(path)
    setOpenPaths((paths) => (paths.includes(path) ? paths : [...paths, path]))
  }

  function closeFile(path: string) {
    setOpenPaths((paths) => {
      const nextPaths = paths.filter((openPath) => openPath !== path)
      if (activePath === path) {
        setActivePath(nextPaths[0] ?? firstFilePath(workspace) ?? "/")
      }
      return nextPaths
    })
  }

  function updateActiveFile(content: string) {
    if (activeEntry?.kind !== "file") return
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      [activePath]: {
        ...currentWorkspace[activePath],
        content,
      },
    }))
  }

  function createFileFromButton() {
    setPendingCreate({ kind: "file", parentPath: cwd })
  }

  function createFolderFromButton() {
    setPendingCreate({ kind: "directory", parentPath: cwd })
  }

  function cancelPendingCreate() {
    setPendingCreate(null)
  }

  function commitPendingCreate(name: string) {
    const trimmedName = name.trim()
    if (!trimmedName || !pendingCreate) {
      setPendingCreate(null)
      return true
    }

    const path = joinPath(pendingCreate.parentPath, trimmedName)
    if (workspace[path]) {
      window.alert(`${path} already exists`)
      return false
    }

    if (pendingCreate.kind === "directory") {
      setWorkspace((currentWorkspace) => ({
        ...ensureParentDirectories(currentWorkspace, path),
        [path]: { kind: "directory" },
      }))
      setPendingCreate(null)
      return true
    }

    setWorkspace((currentWorkspace) => ({
      ...ensureParentDirectories(currentWorkspace, path),
      [path]: { kind: "file", content: "" },
    }))
    activateFile(path)
    setPendingCreate(null)
    return true
  }

  function copyWorkspacePath(path: string) {
    if (path === "/") return
    setClipboardPath({ mode: "copy", path })
  }

  function cutWorkspacePath(path: string) {
    if (path === "/") return
    setClipboardPath({ mode: "cut", path })
  }

  function pasteWorkspacePath(targetPath: string) {
    if (!clipboardPath) return
    const targetDirectory =
      workspace[targetPath]?.kind === "directory"
        ? targetPath
        : parentDir(targetPath)
    const result = pasteWorkspaceEntry({
      clipboard: clipboardPath,
      targetDirectory,
      workspace,
    })

    if (result.error) {
      window.alert(result.error)
      return
    }

    applyWorkspaceChange({
      workspace: result.workspace,
      pathChange: result.pathChange,
    })

    if (result.openPath) activateFile(result.openPath)
    if (clipboardPath.mode === "cut") setClipboardPath(null)
  }

  function renameWorkspacePath(path: string) {
    if (path === "/") return
    const currentName = basename(path)
    const nextName = window.prompt("Rename", currentName)?.trim()
    if (!nextName || nextName === currentName) return

    const nextPath = nextName.includes("/")
      ? resolvePath(cwd, nextName)
      : joinPath(parentDir(path), nextName)
    const result = renameWorkspaceEntry(workspace, path, nextPath)

    if (result.error) {
      window.alert(result.error)
      return
    }

    applyWorkspaceChange({
      workspace: result.workspace,
      pathChange: { from: path, to: nextPath },
    })
  }

  function deleteWorkspacePath(path: string) {
    if (path === "/") return
    if (!window.confirm(`Delete ${path}?`)) return

    applyWorkspaceChange({
      workspace: removePath(workspace, path),
      removedPath: path,
    })
  }

  function runActiveFile() {
    const command = runCommandForPath(activePath)
    if (command === "preview") {
      setPreviewMode("preview")
      return
    }

    setTerminalOpen(true)
    appendTerminal({ kind: "input", text: `$ ${command}` })
    executeCommand(command)
  }

  function submitTerminal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitTerminalCommand()
  }

  function submitTerminalCommand() {
    const command = terminalInput.trim()
    if (!command) return
    setTerminalInput("")
    appendTerminal({ kind: "input", text: `${cwd} $ ${command}` })
    executeCommand(command)
  }

  function executeCommand(command: string) {
    if (command.trim() === "save") {
      const result = saveWorkspace()
      appendTerminal({
        kind: result.ok ? "success" : "error",
        text: result.message,
      })
      return
    }

    const result = runVirtualCommand({
      command,
      cwd,
      workspace,
      activePath,
      problems,
    })

    if (result.clear) {
      setTerminalLines([])
    }

    if (result.cwd) setCwd(result.cwd)
    if (result.workspace) {
      applyWorkspaceChange({
        workspace: result.workspace,
        pathChange: result.pathChange,
        removedPath: result.removedPath,
      })
    }
    if (result.openPath) activateFile(result.openPath)
    if (result.preview) setPreviewMode("preview")
    if (result.lines.length > 0) appendTerminal(result.lines)
  }

  function applyWorkspaceChange({
    workspace: nextWorkspace,
    pathChange,
    removedPath,
  }: {
    workspace: Workspace
    pathChange?: PathChange
    removedPath?: string
  }) {
    setWorkspace(nextWorkspace)

    if (pathChange) {
      setOpenPaths((paths) =>
        paths.map((path) =>
          remapPathForRename(path, pathChange.from, pathChange.to),
        ),
      )
      setActivePath((path) =>
        remapPathForRename(path, pathChange.from, pathChange.to),
      )
      setCwd((path) => remapPathForRename(path, pathChange.from, pathChange.to))
      return
    }

    if (removedPath) {
      setOpenPaths((paths) =>
        paths.filter((path) => !isPathInside(path, removedPath)),
      )
      setActivePath((path) => {
        if (
          !isPathInside(path, removedPath) &&
          nextWorkspace[path]?.kind === "file"
        ) {
          return path
        }
        return firstFilePath(nextWorkspace) ?? "/"
      })
      setCwd((path) => (isPathInside(path, removedPath) ? "/" : path))
      return
    }

    if (nextWorkspace[activePath]?.kind !== "file") {
      const fallbackPath = firstFilePath(nextWorkspace)
      if (fallbackPath) activateFile(fallbackPath)
    }
  }

  function saveWorkspace() {
    const nextSavedAt = new Date()
    const savedWorkspace: SavedIdeWorkspace = {
      version: 1,
      templateId,
      workspace,
      activePath,
      openPaths,
      cwd,
      fontSize,
      savedAt: nextSavedAt.toISOString(),
    }

    try {
      window.localStorage.setItem(
        getIdeWorkspaceStorageKey(classId),
        JSON.stringify(savedWorkspace),
      )
      setSavedAt(nextSavedAt)
      return { ok: true, message: "Workspace saved to this browser." }
    } catch {
      return { ok: false, message: "Could not save workspace." }
    }
  }

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return <ClassFeatureDisabledFallback classId={classId} featureLabel="IDE" />
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-[calc(100vh-3.5rem)] min-h-[680px] flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <ClassPageHeader
              title={cls.name}
              code={cls.code}
              section="IDE"
              size="compact"
            />
          </div>

          <Separator orientation="vertical" className="h-6" />

          <Select value={templateId} onValueChange={switchTemplate}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TEMPLATES.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1">
            <ToolbarButton
              label="Decrease font size"
              onClick={() => setFontSize((size) => Math.max(11, size - 1))}
            >
              <span className="text-xs font-bold">A</span>
            </ToolbarButton>
            <ToolbarButton
              label="Increase font size"
              onClick={() => setFontSize((size) => Math.min(22, size + 1))}
            >
              <span className="text-sm font-bold">A</span>
            </ToolbarButton>
            <Button
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={runActiveFile}
            >
              <Play className="h-3.5 w-3.5" />
              Run
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={resetSavedWorkspace}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => {
                const result = saveWorkspace()
                if (!result.ok) {
                  appendTerminal({ kind: "error", text: result.message })
                }
              }}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </header>

        <ResizablePanelGroup
          direction="vertical"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <ResizablePanel defaultSize={72} minSize={36}>
            <ResizablePanelGroup direction="horizontal" className="min-h-0">
              <ResizablePanel defaultSize={18} minSize={14} maxSize={35}>
                <aside className="flex h-full min-h-0 flex-col bg-card">
                  <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                      <FolderOpen className="h-3.5 w-3.5" />
                      Explorer
                    </div>
                    <div className="flex items-center gap-1">
                      <IconButton
                        label="New file"
                        onClick={createFileFromButton}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label="New folder"
                        onClick={createFolderFromButton}
                      >
                        <Folder className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                    <FileTree
                      nodes={fileTree}
                      activePath={activePath}
                      canPaste={Boolean(clipboardPath)}
                      pendingCreate={pendingCreate}
                      onCopy={copyWorkspacePath}
                      onCut={cutWorkspacePath}
                      onCreateCancel={cancelPendingCreate}
                      onCreateCommit={commitPendingCreate}
                      onDelete={deleteWorkspacePath}
                      onOpen={openFile}
                      onPaste={pasteWorkspacePath}
                      onRename={renameWorkspacePath}
                    />
                  </div>
                </aside>
              </ResizablePanel>

              <ResizableHandle className="bg-border" withHandle />

              <ResizablePanel defaultSize={52} minSize={30}>
                <section className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
                  <div className="flex h-10 shrink-0 items-end overflow-x-auto border-b border-border bg-card">
                    {openPaths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => openFile(path)}
                        className={cn(
                          "group flex h-10 max-w-48 shrink-0 items-center gap-2 border-r border-border px-3 text-xs text-muted-foreground",
                          activePath === path &&
                            "border-t-2 border-t-primary bg-background text-foreground",
                        )}
                      >
                        <FileIcon
                          path={path}
                          className="h-3.5 w-3.5 shrink-0"
                        />
                        <span className="truncate">{basename(path)}</span>
                        {openPaths.length > 1 ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation()
                              closeFile(path)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault()
                                event.stopPropagation()
                                closeFile(path)
                              }
                            }}
                            className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                            aria-label={`Close ${basename(path)}`}
                          >
                            <X className="h-3 w-3" />
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>

                  <div className="min-h-0 flex-1">
                    {activeEntry?.kind === "file" ? (
                      <MonacoEditor
                        height="100%"
                        language={languageForPath(activePath)}
                        theme={isDarkMode ? "vs-dark" : "vs"}
                        value={activeContent}
                        onChange={(value) => updateActiveFile(value ?? "")}
                        path={activePath}
                        options={{
                          fontSize,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          lineNumbers: "on",
                          wordWrap: "off",
                          padding: { top: 14, bottom: 14 },
                          fontFamily:
                            "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace",
                          fontLigatures: true,
                          smoothScrolling: true,
                          cursorBlinking: "smooth",
                          bracketPairColorization: { enabled: true },
                          renderLineHighlight: "all",
                          tabSize: activePath.endsWith(".py") ? 4 : 2,
                        }}
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-muted-foreground">
                        Open a file from the tree.
                      </div>
                    )}
                  </div>
                </section>
              </ResizablePanel>

              {showPreviewPanel ? (
                <>
                  <ResizableHandle
                    className="bg-border max-lg:hidden"
                    withHandle
                  />

                  <ResizablePanel
                    className="max-lg:hidden"
                    defaultSize={30}
                    minSize={20}
                  >
                    <aside className="flex h-full min-h-0 flex-col bg-card">
                      {showPreviewTabs ? (
                        <div className="flex h-10 shrink-0 items-center border-b border-border">
                          <PreviewTab
                            active={previewMode === "preview"}
                            label="Preview"
                            icon={Globe}
                            onClick={() => setPreviewMode("preview")}
                          />
                          <PreviewTab
                            active={previewMode === "console"}
                            label="Console"
                            icon={SquareTerminal}
                            onClick={() => setPreviewMode("console")}
                          />
                          <button
                            type="button"
                            className="flex h-full w-10 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={refreshPreview}
                            aria-label="Refresh preview"
                            title="Refresh preview"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}

                      {showPreviewTabs ? (
                        <>
                          <iframe
                            key={previewRefreshKey}
                            title="Project preview"
                            className={cn(
                              "min-h-0 flex-1 bg-background",
                              previewMode === "console" && "hidden",
                            )}
                            sandbox="allow-scripts allow-forms allow-modals"
                            srcDoc={previewDocument}
                          />
                          {previewMode === "console" ? (
                            <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
                              <ConsoleList
                                lines={previewConsoleLines}
                                problems={problems}
                              />
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <iframe
                          key={previewRefreshKey}
                          title="Project preview"
                          className="min-h-0 flex-1 bg-background"
                          sandbox="allow-scripts allow-forms allow-modals"
                          srcDoc={previewDocument}
                        />
                      )}
                    </aside>
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle className="bg-border" withHandle />

          <ResizablePanel
            ref={terminalPanelRef}
            collapsible
            collapsedSize={TERMINAL_COLLAPSED_SIZE}
            defaultSize={TERMINAL_DEFAULT_SIZE}
            minSize={10}
            onCollapse={() => setTerminalOpen(false)}
            onExpand={() => setTerminalOpen(true)}
          >
            <section className="flex h-full min-h-0 flex-col bg-card">
              <div className="flex h-10 w-full shrink-0 items-center gap-2 border-b border-border px-3 text-left text-xs font-semibold text-foreground">
                <SquareTerminal className="h-4 w-4 text-muted-foreground" />
                Terminal
                {savedAt ? (
                  <span className="ml-auto flex items-center gap-1 font-normal text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Saved {savedAt.toLocaleTimeString()}
                  </span>
                ) : (
                  <span className="ml-auto" />
                )}
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={toggleTerminalPanel}
                  aria-label={
                    terminalOpen ? "Collapse terminal" : "Expand terminal"
                  }
                >
                  <PanelBottom className="h-4 w-4" />
                </button>
              </div>

              {terminalOpen ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div
                    ref={terminalScrollRef}
                    tabIndex={0}
                    className="min-h-0 flex-1 overflow-auto bg-muted/20 px-3 py-2 font-mono text-xs leading-5 outline-none"
                    onBlur={(event) => {
                      if (
                        event.relatedTarget instanceof Node &&
                        event.currentTarget.contains(event.relatedTarget)
                      ) {
                        return
                      }
                      setTerminalInputFocused(false)
                    }}
                    onFocus={() => setTerminalInputFocused(true)}
                    onKeyDown={(event) => {
                      if (event.target === terminalInputRef.current) return
                      if (event.metaKey || event.ctrlKey || event.altKey) return

                      if (event.key.length === 1) {
                        event.preventDefault()
                        terminalInputRef.current?.focus()
                        setTerminalInput((input) => `${input}${event.key}`)
                        scrollTerminalToBottom()
                        return
                      }

                      if (event.key === "Backspace") {
                        event.preventDefault()
                        terminalInputRef.current?.focus()
                        setTerminalInput((input) => input.slice(0, -1))
                        scrollTerminalToBottom()
                      }
                    }}
                  >
                    {terminalLines.map((line) => (
                      <pre
                        key={line.id}
                        className={cn(
                          "whitespace-pre-wrap",
                          line.kind === "input" && "text-primary",
                          line.kind === "output" && "text-foreground",
                          line.kind === "error" && "text-destructive",
                          line.kind === "success" &&
                            "text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {line.text}
                      </pre>
                    ))}
                    <form
                      onSubmit={submitTerminal}
                      className="flex min-h-5 items-start whitespace-pre-wrap"
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {cwd} ${" "}
                      </span>
                      <div className="relative min-h-5 min-w-0 flex-1">
                        <div
                          className="pointer-events-none absolute inset-0 overflow-hidden leading-5"
                          aria-hidden="true"
                        >
                          <span className="text-foreground">
                            {terminalInput}
                          </span>
                          <span
                            className={cn(
                              "ml-px inline-block h-[1.05em] w-[0.6em] translate-y-[0.17em] border border-muted-foreground/70",
                              terminalInputFocused &&
                                "border-transparent bg-emerald-500 dark:bg-emerald-400",
                            )}
                          />
                        </div>
                        <input
                          ref={terminalInputRef}
                          value={terminalInput}
                          onChange={(event) => {
                            setTerminalInput(event.target.value)
                            scrollTerminalToBottom()
                          }}
                          onFocus={() => {
                            setTerminalInputFocused(true)
                            scrollTerminalToBottom()
                          }}
                          onBlur={() => setTerminalInputFocused(false)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault()
                              submitTerminalCommand()
                            }
                          }}
                          className="absolute inset-0 w-full bg-transparent text-transparent caret-transparent outline-none"
                          spellCheck={false}
                        />
                      </div>
                    </form>
                    <div ref={terminalBottomRef} />
                  </div>
                </div>
              ) : null}
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  )
}

function useResolvedDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    function readDarkMode() {
      const root = document.documentElement
      const theme = root.dataset.theme

      setIsDarkMode(
        root.classList.contains("dark") ||
          document.body.classList.contains("dark") ||
          theme === "dark",
      )
    }

    readDarkMode()

    const observer = new MutationObserver(readDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  return isDarkMode
}

function ToolbarButton({
  label,
  children,
  onClick,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function PreviewTab({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: typeof Globe
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full flex-1 items-center justify-center gap-2 border-r border-border text-xs font-semibold text-muted-foreground",
        active && "bg-background text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function ConsoleList({
  lines,
  problems,
}: {
  lines: PreviewConsoleLine[]
  problems: string[]
}) {
  if (problems.length === 0 && lines.length === 0) {
    return <div className="min-h-full font-mono text-xs leading-5" />
  }

  return (
    <div className="min-h-full space-y-1 p-3 font-mono text-xs leading-5">
      {problems.map((problem) => (
        <div
          key={problem}
          className="whitespace-pre-wrap border-l-2 border-destructive pl-2 text-destructive"
        >
          <span className="text-muted-foreground">error</span> {problem}
        </div>
      ))}
      {lines.map((line) => (
        <div
          key={line.id}
          className={cn(
            "whitespace-pre-wrap border-l-2 pl-2",
            line.level === "error" && "border-destructive text-destructive",
            line.level === "warn" &&
              "border-amber-500 text-amber-700 dark:text-amber-300",
            (line.level === "log" || line.level === "info") &&
              "border-muted-foreground/50 text-foreground",
          )}
        >
          <span className="text-muted-foreground">{line.level}</span>{" "}
          {line.message}
        </div>
      ))}
    </div>
  )
}

function getIdeWorkspaceStorageKey(classId: string) {
  return `${IDE_WORKSPACE_STORAGE_PREFIX}${classId}`
}

function getProjectTemplate(templateId: string) {
  return (
    PROJECT_TEMPLATES.find((template) => template.id === templateId) ??
    PROJECT_TEMPLATES[0]
  )
}

function loadSavedIdeWorkspace(classId: string): SavedIdeWorkspace | null {
  try {
    const raw = window.localStorage.getItem(getIdeWorkspaceStorageKey(classId))
    if (!raw) return null

    const value = JSON.parse(raw) as unknown
    if (!isSavedIdeWorkspace(value)) return null

    const activePath =
      value.workspace[value.activePath]?.kind === "file"
        ? value.activePath
        : firstFilePath(value.workspace)
    if (!activePath) return null

    const openPaths = value.openPaths.filter(
      (path) => value.workspace[path]?.kind === "file",
    )

    return {
      ...value,
      activePath,
      openPaths: openPaths.length > 0 ? openPaths : [activePath],
      cwd: value.workspace[value.cwd]?.kind === "directory" ? value.cwd : "/",
      fontSize: Math.min(22, Math.max(11, value.fontSize)),
    }
  } catch {
    return null
  }
}

function isSavedIdeWorkspace(value: unknown): value is SavedIdeWorkspace {
  if (!value || typeof value !== "object") return false

  const workspace = (value as { workspace?: unknown }).workspace
  return (
    (value as { version?: unknown }).version === 1 &&
    typeof (value as { templateId?: unknown }).templateId === "string" &&
    isWorkspace(workspace) &&
    typeof (value as { activePath?: unknown }).activePath === "string" &&
    Array.isArray((value as { openPaths?: unknown }).openPaths) &&
    (value as { openPaths: unknown[] }).openPaths.every(
      (path) => typeof path === "string",
    ) &&
    typeof (value as { cwd?: unknown }).cwd === "string" &&
    typeof (value as { fontSize?: unknown }).fontSize === "number" &&
    typeof (value as { savedAt?: unknown }).savedAt === "string" &&
    !Number.isNaN(Date.parse((value as { savedAt: string }).savedAt))
  )
}

function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false
    }

    const kind = (entry as { kind?: unknown }).kind
    const content = (entry as { content?: unknown }).content
    return (
      (kind === "directory" && content === undefined) ||
      (kind === "file" &&
        (content === undefined || typeof content === "string"))
    )
  })
}
