import type {
  ClipboardState,
  FileTreeNode,
  PathChange,
  Workspace,
} from "@/features/ide/types"

export function buildFileTree(workspace: Workspace): FileTreeNode[] {
  const root: FileTreeNode = {
    path: "/",
    name: "project",
    kind: "directory",
    children: [],
  }

  for (const [path, entry] of Object.entries(workspace).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (path === "/") continue
    const segments = path.split("/").filter(Boolean)
    let current = root

    for (const [index, segment] of segments.entries()) {
      const childPath = `/${segments.slice(0, index + 1).join("/")}`
      let child = current.children.find((node) => node.path === childPath)
      if (!child) {
        child = {
          path: childPath,
          name: segment,
          kind: index === segments.length - 1 ? entry.kind : "directory",
          children: [],
        }
        current.children.push(child)
      }
      current = child
    }
  }

  sortTree(root)
  return root.children
}

export function listDirectory(workspace: Workspace, cwd: string) {
  const children = directChildren(workspace, cwd)
  if (children.length === 0) return "(empty)"

  return children
    .map(
      (path) =>
        `${basename(path)}${workspace[path].kind === "directory" ? "/" : ""}`,
    )
    .join("  ")
}

export function printTree(workspace: Workspace) {
  const lines = ["project/"]
  const nodes = buildFileTree(workspace)

  function walk(node: FileTreeNode, depth: number) {
    lines.push(
      `${"  ".repeat(depth)}${node.name}${node.kind === "directory" ? "/" : ""}`,
    )

    for (const child of node.children) {
      walk(child, depth + 1)
    }
  }

  for (const node of nodes) {
    walk(node, 1)
  }

  return lines.join("\n")
}

export function tokenizeCommand(command: string) {
  return (
    command
      .match(/"[^"]*"|'[^']*'|\S+/g)
      ?.map((part) => part.replace(/^["']|["']$/g, "")) ?? []
  )
}

export function resolvePath(cwd: string, path: string) {
  if (!path || path === ".") return cwd
  const parts = (path.startsWith("/") ? path : `${cwd}/${path}`)
    .split("/")
    .filter(Boolean)
  const resolved: string[] = []

  for (const part of parts) {
    if (part === ".") continue
    if (part === "..") resolved.pop()
    else resolved.push(part)
  }

  return `/${resolved.join("/")}` || "/"
}

export function joinPath(base: string, name: string) {
  return resolvePath(base, name)
}

export function ensureParentDirectories(workspace: Workspace, path: string) {
  const nextWorkspace = { ...workspace }
  const segments = path.split("/").filter(Boolean)
  for (let index = 0; index < segments.length - 1; index++) {
    const directoryPath = `/${segments.slice(0, index + 1).join("/")}`
    nextWorkspace[directoryPath] = { kind: "directory" }
  }
  return nextWorkspace
}

export function removePath(workspace: Workspace, path: string) {
  const nextWorkspace = { ...workspace }
  for (const key of Object.keys(nextWorkspace)) {
    if (key === path || key.startsWith(`${path}/`)) {
      delete nextWorkspace[key]
    }
  }
  return nextWorkspace
}

export function renameWorkspaceEntry(
  workspace: Workspace,
  from: string,
  to: string,
) {
  if (from === "/") {
    return { workspace, error: "rename: cannot rename root" }
  }

  const source = workspace[from]
  if (!source) {
    return { workspace, error: `rename: no such path: ${from}` }
  }

  if (to === "/" || isPathInside(to, from)) {
    return { workspace, error: "rename: target cannot be inside source" }
  }

  if (workspace[to]) {
    return { workspace, error: `rename: target already exists: ${to}` }
  }

  const nextWorkspace = ensureParentDirectories(workspace, to)

  for (const [path, entry] of Object.entries(workspace)) {
    if (!isPathInside(path, from)) continue

    const nextPath = remapPathForRename(path, from, to)
    nextWorkspace[nextPath] = { ...entry }
    delete nextWorkspace[path]
  }

  return { workspace: nextWorkspace, error: null }
}

export function pasteWorkspaceEntry({
  clipboard,
  targetDirectory,
  workspace,
}: {
  clipboard: ClipboardState
  targetDirectory: string
  workspace: Workspace
}): {
  workspace: Workspace
  error: string | null
  path?: string
  openPath?: string
  pathChange?: PathChange
} {
  const source = workspace[clipboard.path]
  if (!source) {
    return { workspace, error: `paste: no such path: ${clipboard.path}` }
  }

  if (workspace[targetDirectory]?.kind !== "directory") {
    return { workspace, error: `paste: not a directory: ${targetDirectory}` }
  }

  if (
    clipboard.mode === "cut" &&
    isPathInside(targetDirectory, clipboard.path)
  ) {
    return { workspace, error: "paste: cannot move a folder inside itself" }
  }

  const requestedPath = joinPath(targetDirectory, basename(clipboard.path))
  const destinationPath =
    clipboard.mode === "copy"
      ? nextAvailablePath(workspace, requestedPath)
      : requestedPath

  if (clipboard.mode === "cut") {
    const result = renameWorkspaceEntry(
      workspace,
      clipboard.path,
      destinationPath,
    )

    return {
      workspace: result.workspace,
      error: result.error,
      path: destinationPath,
      openPath: source.kind === "file" ? destinationPath : undefined,
      pathChange: result.error
        ? undefined
        : { from: clipboard.path, to: destinationPath },
    }
  }

  const nextWorkspace = ensureParentDirectories(workspace, destinationPath)
  const entriesToCopy = Object.entries(workspace).filter(([path]) =>
    isPathInside(path, clipboard.path),
  )

  for (const [path, entry] of entriesToCopy) {
    const nextPath = remapPathForRename(path, clipboard.path, destinationPath)
    nextWorkspace[nextPath] = { ...entry }
  }

  return {
    workspace: nextWorkspace,
    error: null,
    path: destinationPath,
    openPath: source.kind === "file" ? destinationPath : undefined,
  }
}

export function isPathInside(path: string, containerPath: string) {
  return path === containerPath || path.startsWith(`${containerPath}/`)
}

export function remapPathForRename(path: string, from: string, to: string) {
  if (!isPathInside(path, from)) return path
  return `${to}${path.slice(from.length)}`
}

export function parentDir(path: string) {
  const parts = path.split("/").filter(Boolean)
  parts.pop()
  return parts.length === 0 ? "/" : `/${parts.join("/")}`
}

export function nextAvailablePath(workspace: Workspace, path: string) {
  if (!workspace[path]) return path
  const extensionIndex = path.lastIndexOf(".")
  const base = extensionIndex > -1 ? path.slice(0, extensionIndex) : path
  const extension = extensionIndex > -1 ? path.slice(extensionIndex) : ""
  let index = 2
  let nextPath = `${base}-${index}${extension}`

  while (workspace[nextPath]) {
    index += 1
    nextPath = `${base}-${index}${extension}`
  }

  return nextPath
}

export function firstFilePath(workspace: Workspace) {
  return Object.entries(workspace).find(
    ([, entry]) => entry.kind === "file",
  )?.[0]
}

export function basename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? "project"
}

export function languageForPath(path: string) {
  if (path.endsWith(".html")) return "html"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".js")) return "javascript"
  if (path.endsWith(".ts")) return "typescript"
  if (path.endsWith(".py")) return "python"
  if (path.endsWith(".c") || path.endsWith(".h")) return "c"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".md")) return "markdown"
  if (path.endsWith(".sql")) return "sql"
  return "plaintext"
}

export function defaultContentForPath(path: string) {
  if (path.endsWith(".html")) {
    return "<!doctype html>\n<html>\n  <body>\n  </body>\n</html>\n"
  }
  if (path.endsWith(".css")) {
    return "body {\n  font-family: system-ui, sans-serif;\n}\n"
  }
  if (path.endsWith(".js")) return 'console.log("Hello, Eduverse!");\n'
  if (path.endsWith(".ts")) {
    return 'const message: string = "Hello, Eduverse!";\nconsole.log(message);\n'
  }
  if (path.endsWith(".py")) return 'print("Hello, Eduverse!")\n'
  if (path.endsWith(".c")) {
    return '#include <stdio.h>\n\nint main(void) {\n  printf("Hello, Eduverse!\\n");\n  return 0;\n}\n'
  }
  if (path.endsWith(".json")) return '{\n  "name": "eduverse-project"\n}\n'
  if (path.endsWith(".md")) return "# Notes\n\n"
  return ""
}

export function runCommandForPath(path: string) {
  if (path.endsWith(".html") || path.endsWith(".css")) return "preview"
  return `run ${path}`
}

function sortTree(node: FileTreeNode) {
  node.children.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1
    return left.name.localeCompare(right.name)
  })

  for (const child of node.children) {
    sortTree(child)
  }
}

function directChildren(workspace: Workspace, cwd: string) {
  const prefix = cwd === "/" ? "/" : `${cwd}/`
  return Object.keys(workspace)
    .filter((path) => path !== cwd && path.startsWith(prefix))
    .filter((path) => path.slice(prefix.length).split("/").length === 1)
    .sort((left, right) => {
      if (workspace[left].kind !== workspace[right].kind) {
        return workspace[left].kind === "directory" ? -1 : 1
      }
      return left.localeCompare(right)
    })
}
