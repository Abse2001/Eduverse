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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { FileTreeNode } from "@/features/ide/types"
import { cn } from "@/lib/utils"

type FileTreeProps = {
  nodes: FileTreeNode[]
  activePath: string
  canPaste: boolean
  onCopy: (path: string) => void
  onCut: (path: string) => void
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
  onCopy,
  onCut,
  onDelete,
  onOpen,
  onPaste,
  onRename,
}: FileTreeProps) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <FileTreeRow
          key={node.path}
          node={node}
          activePath={activePath}
          canPaste={canPaste}
          level={0}
          onCopy={onCopy}
          onCut={onCut}
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
  level,
  onCopy,
  onCut,
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
          "group flex h-7 w-full items-center gap-1.5 rounded pr-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100",
          activePath === node.path && "bg-indigo-500/15 text-indigo-200",
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
              <ChevronRight className="h-3 w-3 rotate-90 text-slate-600" />
              <FolderOpen className="h-3.5 w-3.5 text-amber-300" />
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
              level={level + 1}
              onCopy={onCopy}
              onCut={onCut}
              onDelete={onDelete}
              onOpen={onOpen}
              onPaste={onPaste}
              onRename={onRename}
            />
          ))}
        </div>
      ) : null}
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
}: Omit<FileTreeProps, "activePath" | "nodes"> & {
  isDirectory: boolean
  node: FileTreeNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition hover:bg-slate-700 hover:text-white group-hover:opacity-100 data-[state=open]:bg-slate-700 data-[state=open]:text-white data-[state=open]:opacity-100"
          aria-label={`Open menu for ${node.name}`}
          title="More"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-40 border-slate-700 bg-slate-900 text-slate-100"
      >
        {!isDirectory ? (
          <DropdownMenuItem
            className="text-xs focus:bg-slate-800 focus:text-white"
            onClick={() => onOpen(node.path)}
          >
            <FileText className="h-3.5 w-3.5" />
            Open
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="text-xs focus:bg-slate-800 focus:text-white"
          onClick={() => onCopy(node.path)}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs focus:bg-slate-800 focus:text-white"
          onClick={() => onCut(node.path)}
        >
          <Scissors className="h-3.5 w-3.5" />
          Cut
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs focus:bg-slate-800 focus:text-white"
          disabled={!canPaste}
          onClick={() => onPaste(node.path)}
        >
          <Copy className="h-3.5 w-3.5" />
          Paste
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-slate-700" />
        <DropdownMenuItem
          className="text-xs focus:bg-slate-800 focus:text-white"
          onClick={() => onRename(node.path)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs text-rose-300 focus:bg-rose-500/15 focus:text-rose-200"
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
  if (path.endsWith(".c") || path.endsWith(".h")) {
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
