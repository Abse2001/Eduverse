"use client"

import {
  BookOpen,
  Braces,
  ChevronRight,
  Copy,
  FileCode2,
  FileJson,
  FileText,
  FolderOpen,
  Globe,
  Hash,
  MoreHorizontal,
  Pencil,
  Scissors,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { FileKind, FileTreeNode } from "@/features/ide/types"
import { cn } from "@/lib/utils"

export type PendingCreateEntry = {
  kind: FileKind
  parentPath: string
}

type FileTreeProps = {
  nodes: FileTreeNode[]
  activePath: string
  canPaste: boolean
  pendingCreate?: PendingCreateEntry | null
  onCopy: (path: string) => void
  onCut: (path: string) => void
  onCreateCancel: () => void
  onCreateCommit: (name: string) => boolean
  onDelete: (path: string) => void
  onOpen: (path: string) => void
  onPaste: (path: string) => void
  onRename: (path: string) => void
}

type FileTreeRowProps = Omit<FileTreeProps, "nodes"> & {
  node: FileTreeNode
  level: number
}

export function FileTree({
  nodes,
  activePath,
  canPaste,
  pendingCreate,
  onCopy,
  onCut,
  onCreateCancel,
  onCreateCommit,
  onDelete,
  onOpen,
  onPaste,
  onRename,
}: FileTreeProps) {
  return (
    <div className="space-y-0.5">
      {pendingCreate?.parentPath === "/" ? (
        <PendingCreateRow
          kind={pendingCreate.kind}
          level={0}
          onCancel={onCreateCancel}
          onCommit={onCreateCommit}
        />
      ) : null}
      {nodes.map((node) => (
        <FileTreeRow
          key={node.path}
          node={node}
          activePath={activePath}
          canPaste={canPaste}
          pendingCreate={pendingCreate}
          level={0}
          onCopy={onCopy}
          onCut={onCut}
          onCreateCancel={onCreateCancel}
          onCreateCommit={onCreateCommit}
          onDelete={onDelete}
          onOpen={onOpen}
          onPaste={onPaste}
          onRename={onRename}
        />
      ))}
    </div>
  )
}

function FileTreeRow({
  node,
  activePath,
  canPaste,
  pendingCreate,
  level,
  onCopy,
  onCut,
  onCreateCancel,
  onCreateCommit,
  onDelete,
  onOpen,
  onPaste,
  onRename,
}: FileTreeRowProps) {
  const isDirectory = node.kind === "directory"

  return (
    <div>
      <div
        className={cn(
          "group flex h-7 w-full items-center gap-1.5 rounded pr-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
          activePath === node.path &&
            "bg-primary/10 text-primary dark:bg-indigo-500/15 dark:text-indigo-200",
        )}
        style={{ paddingLeft: `${8 + level * 14}px` }}
      >
        <button
          type="button"
          onClick={() => {
            if (!isDirectory) onOpen(node.path)
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {isDirectory ? (
            <>
              <ChevronRight className="h-3 w-3 rotate-90 text-muted-foreground/70 dark:text-slate-600" />
              <FolderOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
            </>
          ) : (
            <>
              <span className="w-3" />
              <FileIcon path={node.path} className="h-3.5 w-3.5" />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </button>
        <FileTreeMenu
          canPaste={canPaste}
          isDirectory={isDirectory}
          node={node}
          onCopy={onCopy}
          onCut={onCut}
          onDelete={onDelete}
          onOpen={onOpen}
          onPaste={onPaste}
          onRename={onRename}
        />
      </div>
      {isDirectory && node.children.length > 0 ? (
        <div>
          {node.children.map((child) => (
            <FileTreeRow
              key={child.path}
              node={child}
              activePath={activePath}
              canPaste={canPaste}
              pendingCreate={pendingCreate}
              level={level + 1}
              onCopy={onCopy}
              onCut={onCut}
              onCreateCancel={onCreateCancel}
              onCreateCommit={onCreateCommit}
              onDelete={onDelete}
              onOpen={onOpen}
              onPaste={onPaste}
              onRename={onRename}
            />
          ))}
        </div>
      ) : null}
      {isDirectory && pendingCreate?.parentPath === node.path ? (
        <PendingCreateRow
          kind={pendingCreate.kind}
          level={level + 1}
          onCancel={onCreateCancel}
          onCommit={onCreateCommit}
        />
      ) : null}
    </div>
  )
}

function PendingCreateRow({
  kind,
  level,
  onCancel,
  onCommit,
}: {
  kind: FileKind
  level: number
  onCancel: () => void
  onCommit: (name: string) => boolean
}) {
  const [name, setName] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isDirectory = kind === "directory"

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function commitPendingName() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      onCancel()
      return
    }
    if (!onCommit(trimmedName)) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <div
      className="flex h-7 w-full items-center gap-1.5 rounded bg-primary/10 pr-1 text-xs text-primary dark:bg-indigo-500/15 dark:text-indigo-200"
      style={{ paddingLeft: `${8 + level * 14}px` }}
    >
      {isDirectory ? (
        <>
          <ChevronRight className="h-3 w-3 rotate-90 text-muted-foreground/70 dark:text-slate-600" />
          <FolderOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
        </>
      ) : (
        <>
          <span className="w-3" />
          <FileText className="h-3.5 w-3.5" />
        </>
      )}
      <input
        ref={inputRef}
        value={name}
        onBlur={commitPendingName}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commitPendingName()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
        className="min-w-0 flex-1 rounded-sm border border-primary/30 bg-background px-1 py-0.5 text-xs text-foreground outline-none focus:border-primary dark:border-indigo-400/30 dark:bg-slate-950/60"
        aria-label={isDirectory ? "New folder name" : "New file name"}
      />
    </div>
  )
}

function FileTreeMenu({
  canPaste,
  isDirectory,
  node,
  onCopy,
  onCut,
  onDelete,
  onOpen,
  onPaste,
  onRename,
}: Omit<
  FileTreeProps,
  "activePath" | "nodes" | "pendingCreate" | "onCreateCancel" | "onCreateCommit"
> & {
  isDirectory: boolean
  node: FileTreeNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 data-[state=open]:bg-muted data-[state=open]:text-foreground data-[state=open]:opacity-100 dark:hover:bg-slate-700 dark:hover:text-white dark:data-[state=open]:bg-slate-700 dark:data-[state=open]:text-white"
          aria-label={`Open menu for ${node.name}`}
          title="More"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {!isDirectory ? (
          <DropdownMenuItem
            className="text-xs dark:focus:bg-slate-800 dark:focus:text-white"
            onClick={() => onOpen(node.path)}
          >
            <FileText className="h-3.5 w-3.5" />
            Open
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="text-xs dark:focus:bg-slate-800 dark:focus:text-white"
          onClick={() => onCopy(node.path)}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs dark:focus:bg-slate-800 dark:focus:text-white"
          onClick={() => onCut(node.path)}
        >
          <Scissors className="h-3.5 w-3.5" />
          Cut
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs dark:focus:bg-slate-800 dark:focus:text-white"
          disabled={!canPaste}
          onClick={() => onPaste(node.path)}
        >
          <Copy className="h-3.5 w-3.5" />
          Paste
        </DropdownMenuItem>
        <DropdownMenuSeparator className="dark:bg-slate-700" />
        <DropdownMenuItem
          className="text-xs dark:focus:bg-slate-800 dark:focus:text-white"
          onClick={() => onRename(node.path)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs text-destructive focus:bg-destructive/10 focus:text-destructive dark:text-rose-300 dark:focus:bg-rose-500/15 dark:focus:text-rose-200"
          onClick={() => onDelete(node.path)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FileIcon({
  path,
  className,
}: {
  path: string
  className?: string
}) {
  if (path.endsWith(".html")) return <Globe className={className} />
  if (path.endsWith(".css")) return <Hash className={className} />
  if (path.endsWith(".json")) return <FileJson className={className} />
  if (path.endsWith(".md")) return <BookOpen className={className} />
  if (
    path.endsWith(".c") ||
    path.endsWith(".h") ||
    path.endsWith(".cpp") ||
    path.endsWith(".cc")
  ) {
    return <Braces className={className} />
  }
  if (
    path.endsWith(".js") ||
    path.endsWith(".ts") ||
    path.endsWith(".py") ||
    path.endsWith(".sql")
  ) {
    return <FileCode2 className={className} />
  }

  return <FileText className={className} />
}
