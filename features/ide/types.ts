export type FileKind = "file" | "directory"

export type WorkspaceEntry = {
  kind: FileKind
  content?: string
}

export type Workspace = Record<string, WorkspaceEntry>

export type ProjectTemplate = {
  id: string
  label: string
  description: string
  files: Workspace
  entryFile: string
}

export type TerminalLine = {
  id: number
  kind: "input" | "output" | "error" | "success"
  text: string
}

export type PathChange = {
  from: string
  to: string
}

export type ClipboardState = {
  mode: "copy" | "cut"
  path: string
}

export type PreviewMode = "preview" | "problems"

export type FileTreeNode = {
  path: string
  name: string
  kind: FileKind
  children: FileTreeNode[]
}
