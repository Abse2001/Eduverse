"use client"

import {
  CheckCircle2,
  Code2,
  Folder,
  FolderOpen,
  Globe,
  PanelBottom,
  Play,
  Plus,
  Save,
  SquareTerminal,
  X,
} from "lucide-react"
import dynamic from "next/dynamic"
import { use, useMemo, useRef, useState } from "react"
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
import { FileIcon, FileTree } from "@/features/ide/file-tree"
import { buildPreviewDocument, getProblems } from "@/features/ide/preview"
import {
  INITIAL_TERMINAL,
  PROJECT_TEMPLATES,
  SUPPORTED_LANGUAGES,
} from "@/features/ide/templates"
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
  defaultContentForPath,
  ensureParentDirectories,
  firstFilePath,
  isPathInside,
  joinPath,
  languageForPath,
  nextAvailablePath,
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

type PreviewMode = "preview" | "problems"

export default function IdePage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "extensions.ide")

  const [templateId, setTemplateId] = useState(PROJECT_TEMPLATES[0].id)
  const activeTemplate = useMemo(
    () =>
      PROJECT_TEMPLATES.find((template) => template.id === templateId) ??
      PROJECT_TEMPLATES[0],
    [templateId],
  )
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
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview")
  const [clipboardPath, setClipboardPath] = useState<ClipboardState | null>(
    null,
  )
  const [fontSize, setFontSize] = useState(14)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const terminalIdRef = useRef(INITIAL_TERMINAL.length + 1)

  const activeEntry = workspace[activePath]
  const activeContent = activeEntry?.content ?? ""
  const fileTree = useMemo(() => buildFileTree(workspace), [workspace])
  const problems = useMemo(
    () => getProblems(workspace, activePath),
    [workspace, activePath],
  )
  const previewDocument = useMemo(
    () => buildPreviewDocument(workspace, activePath),
    [workspace, activePath],
  )

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

  function switchTemplate(nextTemplateId: string) {
    const nextTemplate =
      PROJECT_TEMPLATES.find((template) => template.id === nextTemplateId) ??
      PROJECT_TEMPLATES[0]

    setTemplateId(nextTemplate.id)
    setWorkspace(nextTemplate.files)
    setActivePath(nextTemplate.entryFile)
    setOpenPaths([nextTemplate.entryFile])
    setCwd("/")
    setPreviewMode("preview")
    setTerminalLines([
      {
        id: terminalIdRef.current++,
        kind: "success",
        text: `Loaded ${nextTemplate.label}.`,
      },
    ])
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
    const path = nextAvailablePath(workspace, joinPath(cwd, "new-file.js"))
    setWorkspace((currentWorkspace) => ({
      ...ensureParentDirectories(currentWorkspace, path),
      [path]: { kind: "file", content: defaultContentForPath(path) },
    }))
    activateFile(path)
    appendTerminal({ kind: "success", text: `Created ${path}` })
  }

  function createFolderFromButton() {
    const path = nextAvailablePath(workspace, joinPath(cwd, "new-folder"))
    setWorkspace((currentWorkspace) => ({
      ...ensureParentDirectories(currentWorkspace, path),
      [path]: { kind: "directory" },
    }))
    appendTerminal({ kind: "success", text: `Created ${path}/` })
  }

  function copyWorkspacePath(path: string) {
    if (path === "/") return
    setClipboardPath({ mode: "copy", path })
    appendTerminal({ kind: "success", text: `copied ${path}` })
  }

  function cutWorkspacePath(path: string) {
    if (path === "/") return
    setClipboardPath({ mode: "cut", path })
    appendTerminal({ kind: "success", text: `cut ${path}` })
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
      appendTerminal({ kind: "error", text: result.error })
      return
    }

    applyWorkspaceChange({
      workspace: result.workspace,
      pathChange: result.pathChange,
    })

    if (result.openPath) activateFile(result.openPath)
    if (clipboardPath.mode === "cut") setClipboardPath(null)
    appendTerminal({
      kind: "success",
      text: `${clipboardPath.mode === "cut" ? "moved" : "pasted"} ${result.path}`,
    })
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
      appendTerminal({ kind: "error", text: result.error })
      return
    }

    applyWorkspaceChange({
      workspace: result.workspace,
      pathChange: { from: path, to: nextPath },
    })
    appendTerminal({ kind: "success", text: `renamed ${path} -> ${nextPath}` })
  }

  function deleteWorkspacePath(path: string) {
    if (path === "/") return
    if (!window.confirm(`Delete ${path}?`)) return

    applyWorkspaceChange({
      workspace: removePath(workspace, path),
      removedPath: path,
    })
    appendTerminal({ kind: "success", text: `removed ${path}` })
  }

  function runActiveFile() {
    setTerminalOpen(true)
    const command = runCommandForPath(activePath)
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
      <div className="flex h-[calc(100vh-3.5rem)] min-h-[680px] flex-col overflow-hidden bg-[#10131a] text-slate-100">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 bg-[#171b24] px-3">
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500 text-white">
              <Code2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-4 text-white">
                {cls.name}
              </h1>
              <p className="truncate text-[11px] leading-3 text-slate-400">
                {cls.code} IDE
              </p>
            </div>
          </div>

          <Separator orientation="vertical" className="h-6 bg-slate-800" />

          <Select value={templateId} onValueChange={switchTemplate}>
            <SelectTrigger className="h-8 w-40 border-slate-700 bg-slate-900 text-xs text-slate-100">
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

          <div className="hidden min-w-0 max-w-80 text-xs text-slate-400 lg:block">
            {activeTemplate.description}
          </div>

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
              className="h-8 gap-1.5 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
              onClick={runActiveFile}
            >
              <Play className="h-3.5 w-3.5" />
              Run
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 hover:bg-slate-800"
              onClick={() => setSavedAt(new Date())}
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
                <aside className="flex h-full min-h-0 flex-col bg-[#141821]">
                  <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800 px-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                      <FolderOpen className="h-3.5 w-3.5" />
                      Files
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
                      onCopy={copyWorkspacePath}
                      onCut={cutWorkspacePath}
                      onDelete={deleteWorkspacePath}
                      onOpen={openFile}
                      onPaste={pasteWorkspacePath}
                      onRename={renameWorkspacePath}
                    />
                  </div>
                  <div className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
                    {SUPPORTED_LANGUAGES.join(" / ")}
                  </div>
                </aside>
              </ResizablePanel>

              <ResizableHandle className="bg-slate-800" withHandle />

              <ResizablePanel defaultSize={52} minSize={30}>
                <section className="flex h-full min-w-0 flex-col overflow-hidden bg-[#1d222d]">
                  <div className="flex h-10 shrink-0 items-end overflow-x-auto border-b border-slate-800 bg-[#171b24]">
                    {openPaths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => openFile(path)}
                        className={cn(
                          "group flex h-10 max-w-48 shrink-0 items-center gap-2 border-r border-slate-800 px-3 text-xs text-slate-400",
                          activePath === path &&
                            "border-t-2 border-t-indigo-400 bg-[#1d222d] text-slate-100",
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
                            className="rounded p-0.5 opacity-0 hover:bg-slate-700 group-hover:opacity-100"
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
                        theme="vs-dark"
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
                      <div className="grid h-full place-items-center text-sm text-slate-500">
                        Open a file from the tree.
                      </div>
                    )}
                  </div>
                </section>
              </ResizablePanel>

              <ResizableHandle
                className="bg-slate-800 max-lg:hidden"
                withHandle
              />

              <ResizablePanel
                className="max-lg:hidden"
                defaultSize={30}
                minSize={20}
              >
                <aside className="flex h-full min-h-0 flex-col bg-[#141821]">
                  <div className="flex h-10 shrink-0 items-center border-b border-slate-800">
                    <PreviewTab
                      active={previewMode === "preview"}
                      label="Preview"
                      icon={Globe}
                      onClick={() => setPreviewMode("preview")}
                    />
                    <PreviewTab
                      active={previewMode === "problems"}
                      label="Problems"
                      icon={CheckCircle2}
                      onClick={() => setPreviewMode("problems")}
                    />
                  </div>

                  {previewMode === "preview" ? (
                    <iframe
                      title="Project preview"
                      className="min-h-0 flex-1 bg-white"
                      sandbox="allow-scripts allow-forms allow-modals"
                      srcDoc={previewDocument}
                    />
                  ) : (
                    <div className="min-h-0 flex-1 overflow-auto p-3">
                      <ProblemsList problems={problems} />
                    </div>
                  )}
                </aside>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle className="bg-slate-800" withHandle />

          <ResizablePanel defaultSize={28} minSize={10}>
            <section className="flex h-full min-h-0 flex-col bg-[#0b0f16]">
              <button
                type="button"
                className="flex h-10 w-full shrink-0 items-center gap-2 border-b border-slate-800 px-3 text-left text-xs font-semibold text-slate-300"
                onClick={() => setTerminalOpen((open) => !open)}
              >
                <SquareTerminal className="h-4 w-4 text-emerald-400" />
                Terminal
                <span className="font-normal text-slate-500">{cwd}</span>
                {savedAt ? (
                  <span className="ml-auto flex items-center gap-1 font-normal text-slate-500">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    Saved {savedAt.toLocaleTimeString()}
                  </span>
                ) : (
                  <span className="ml-auto font-normal text-slate-500">
                    Virtual CLI
                  </span>
                )}
                <PanelBottom className="h-4 w-4" />
              </button>

              {terminalOpen ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-5">
                    {terminalLines.map((line) => (
                      <pre
                        key={line.id}
                        className={cn(
                          "whitespace-pre-wrap",
                          line.kind === "input" && "text-sky-300",
                          line.kind === "output" && "text-slate-300",
                          line.kind === "error" && "text-rose-300",
                          line.kind === "success" && "text-emerald-300",
                        )}
                      >
                        {line.text}
                      </pre>
                    ))}
                  </div>
                  <form
                    onSubmit={submitTerminal}
                    className="flex h-10 shrink-0 items-center gap-2 border-t border-slate-800 px-3 font-mono text-xs"
                  >
                    <span className="text-slate-500">{cwd} $</span>
                    <input
                      value={terminalInput}
                      onChange={(event) => setTerminalInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          submitTerminalCommand()
                        }
                      }}
                      className="h-full min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-600"
                      placeholder="Try: help, ls, mkdir src, touch app.js, mv app.js main.js, rm main.js"
                      spellCheck={false}
                    />
                  </form>
                </div>
              ) : null}
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  )
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
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
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
      className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-100"
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
        "flex h-full flex-1 items-center justify-center gap-2 border-r border-slate-800 text-xs font-semibold text-slate-500",
        active && "bg-[#1d222d] text-slate-100",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function ProblemsList({ problems }: { problems: string[] }) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">
        <CheckCircle2 className="h-4 w-4" />
        No problems found in the current browser checks.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {problems.map((problem) => (
        <div
          key={problem}
          className="rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {problem}
        </div>
      ))}
    </div>
  )
}
