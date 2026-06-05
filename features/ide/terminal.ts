import type { PathChange, TerminalLine, Workspace } from "@/features/ide/types"
import {
  basename,
  defaultContentForPath,
  ensureParentDirectories,
  joinPath,
  listDirectory,
  printTree,
  removePath,
  renameWorkspaceEntry,
  resolvePath,
  tokenizeCommand,
} from "@/features/ide/workspace"

type CommandResult = {
  cwd?: string
  workspace?: Workspace
  openPath?: string
  pathChange?: PathChange
  preview?: boolean
  clear?: boolean
  removedPath?: string
  lines: Array<Omit<TerminalLine, "id">>
}

export function runVirtualCommand({
  command,
  cwd,
  workspace,
  activePath,
  problems,
}: {
  command: string
  cwd: string
  workspace: Workspace
  activePath: string
  problems: string[]
}): CommandResult {
  const [name = "", ...args] = tokenizeCommand(command)

  switch (name) {
    case "help":
      return {
        lines: [
          {
            kind: "output",
            text: [
              "Commands:",
              "  pwd, ls, tree, cd <folder>",
              "  mkdir <folder>, touch <file>, rm <file>, rmdir <folder>",
              "  mv <from> <to>, rename <from> <to>",
              "  cat <file>, open <file>, run [file], preview, problems",
              "  echo <text> > <file>, clear, save",
            ].join("\n"),
          },
        ],
      }
    case "pwd":
      return { lines: [{ kind: "output", text: cwd }] }
    case "ls":
      return {
        lines: [{ kind: "output", text: listDirectory(workspace, cwd) }],
      }
    case "tree":
      return { lines: [{ kind: "output", text: printTree(workspace) }] }
    case "cd":
      return changeDirectory({ args, cwd, workspace })
    case "mkdir":
      return makeDirectory({ args, cwd, workspace })
    case "touch":
      return touchFile({ args, cwd, workspace })
    case "rm":
    case "rmdir":
      return removeEntry({ args, cwd, name, workspace })
    case "mv":
    case "rename":
      return renameEntry({ args, cwd, name, workspace })
    case "cat":
      return readFile({ args, cwd, workspace })
    case "open":
      return openFile({ args, cwd, workspace })
    case "run": {
      const path = args[0] ? resolvePath(cwd, args[0]) : activePath
      return { lines: runFile(workspace, path) }
    }
    case "preview":
      return {
        preview: true,
        lines: [{ kind: "success", text: "Preview refreshed." }],
      }
    case "problems":
      return {
        lines:
          problems.length > 0
            ? problems.map((problem) => ({ kind: "error", text: problem }))
            : [{ kind: "success", text: "No problems found." }],
      }
    case "clear":
      return { clear: true, lines: [] }
    case "save":
      return {
        lines: [{ kind: "success", text: "Workspace saved in memory." }],
      }
    case "echo":
      return handleEchoCommand(command, cwd, workspace)
    case "gcc":
    case "clang":
    case "python":
    case "python3":
    case "node":
    case "npm":
    case "make":
      return {
        lines: [
          {
            kind: "error",
            text: `${name}: real process execution needs a secure backend sandbox. Use browser-safe \`run\` for JavaScript and previews for web files.`,
          },
        ],
      }
    default:
      return {
        lines: [
          {
            kind: "error",
            text: `${name}: command not found. Type \`help\` for supported virtual commands.`,
          },
        ],
      }
  }
}

function changeDirectory({
  args,
  cwd,
  workspace,
}: {
  args: string[]
  cwd: string
  workspace: Workspace
}): CommandResult {
  const target = resolvePath(cwd, args[0] ?? "/")
  if (workspace[target]?.kind !== "directory") {
    return {
      lines: [{ kind: "error", text: `cd: no such directory: ${target}` }],
    }
  }
  return { cwd: target, lines: [{ kind: "success", text: target }] }
}

function makeDirectory({
  args,
  cwd,
  workspace,
}: {
  args: string[]
  cwd: string
  workspace: Workspace
}): CommandResult {
  if (!args[0]) {
    return { lines: [{ kind: "error", text: "mkdir: missing folder name" }] }
  }
  const path = resolvePath(cwd, args[0])
  if (workspace[path]) {
    return { lines: [{ kind: "error", text: `mkdir: ${path} already exists` }] }
  }
  return {
    workspace: {
      ...ensureParentDirectories(workspace, path),
      [path]: { kind: "directory" },
    },
    lines: [{ kind: "success", text: `created ${path}/` }],
  }
}

function touchFile({
  args,
  cwd,
  workspace,
}: {
  args: string[]
  cwd: string
  workspace: Workspace
}): CommandResult {
  if (!args[0]) {
    return { lines: [{ kind: "error", text: "touch: missing file name" }] }
  }
  const path = resolvePath(cwd, args[0])
  if (workspace[path]?.kind === "directory") {
    return { lines: [{ kind: "error", text: `touch: ${path} is a directory` }] }
  }
  return {
    workspace: {
      ...ensureParentDirectories(workspace, path),
      [path]: workspace[path] ?? {
        kind: "file",
        content: defaultContentForPath(path),
      },
    },
    openPath: path,
    lines: [{ kind: "success", text: `ready ${path}` }],
  }
}

function removeEntry({
  args,
  cwd,
  name,
  workspace,
}: {
  args: string[]
  cwd: string
  name: string
  workspace: Workspace
}): CommandResult {
  const recursive = args.includes("-r")
  const pathArg = name === "rm" && args[0] === "-r" ? args[1] : args[0]

  if (!pathArg) {
    return { lines: [{ kind: "error", text: `${name}: missing path` }] }
  }
  const path = resolvePath(cwd, pathArg)
  if (path === "/") {
    return { lines: [{ kind: "error", text: `${name}: cannot remove root` }] }
  }
  if (!workspace[path]) {
    return {
      lines: [{ kind: "error", text: `${name}: no such path: ${path}` }],
    }
  }
  if (name === "rmdir" && workspace[path].kind !== "directory") {
    return {
      lines: [{ kind: "error", text: `rmdir: not a directory: ${path}` }],
    }
  }
  if (workspace[path].kind === "directory" && name === "rm" && !recursive) {
    return {
      lines: [
        { kind: "error", text: "rm: use rm -r <folder> for directories" },
      ],
    }
  }

  const nextWorkspace = removePath(workspace, path)

  return {
    workspace: nextWorkspace,
    removedPath: path,
    lines: [{ kind: "success", text: `removed ${path}` }],
  }
}

function renameEntry({
  args,
  cwd,
  name,
  workspace,
}: {
  args: string[]
  cwd: string
  name: string
  workspace: Workspace
}): CommandResult {
  if (!args[0] || !args[1]) {
    return {
      lines: [{ kind: "error", text: `${name}: usage ${name} <from> <to>` }],
    }
  }

  const from = resolvePath(cwd, args[0])
  const rawTo = resolvePath(cwd, args[1])
  const to =
    workspace[rawTo]?.kind === "directory"
      ? joinPath(rawTo, basename(from))
      : rawTo
  const result = renameWorkspaceEntry(workspace, from, to)

  if (result.error) {
    return { lines: [{ kind: "error", text: result.error }] }
  }

  return {
    workspace: result.workspace,
    openPath: result.workspace[to]?.kind === "file" ? to : undefined,
    pathChange: { from, to },
    lines: [{ kind: "success", text: `renamed ${from} -> ${to}` }],
  }
}

function readFile({
  args,
  cwd,
  workspace,
}: {
  args: string[]
  cwd: string
  workspace: Workspace
}): CommandResult {
  if (!args[0]) {
    return { lines: [{ kind: "error", text: "cat: missing file name" }] }
  }
  const path = resolvePath(cwd, args[0])
  const entry = workspace[path]
  if (entry?.kind !== "file") {
    return { lines: [{ kind: "error", text: `cat: no such file: ${path}` }] }
  }
  return { lines: [{ kind: "output", text: entry.content ?? "" }] }
}

function openFile({
  args,
  cwd,
  workspace,
}: {
  args: string[]
  cwd: string
  workspace: Workspace
}): CommandResult {
  if (!args[0]) {
    return { lines: [{ kind: "error", text: "open: missing file name" }] }
  }
  const path = resolvePath(cwd, args[0])
  if (workspace[path]?.kind !== "file") {
    return { lines: [{ kind: "error", text: `open: no such file: ${path}` }] }
  }
  return {
    openPath: path,
    lines: [{ kind: "success", text: `opened ${path}` }],
  }
}

function runFile(
  workspace: Workspace,
  path: string,
): Array<Omit<TerminalLine, "id">> {
  const entry = workspace[path]
  if (entry?.kind !== "file") {
    return [{ kind: "error", text: `run: no such file: ${path}` }]
  }

  if (path.endsWith(".js")) return runJavaScript(entry.content ?? "")
  if (path.endsWith(".html") || path.endsWith(".css")) {
    return [
      {
        kind: "success",
        text: "Use `preview` or the Preview panel to view web files.",
      },
    ]
  }

  if (path.endsWith(".json")) {
    try {
      JSON.parse(entry.content ?? "")
      return [{ kind: "success", text: `${path} is valid JSON.` }]
    } catch (error) {
      return [
        {
          kind: "error",
          text: error instanceof Error ? error.message : "Invalid JSON.",
        },
      ]
    }
  }

  if (path.endsWith(".md")) {
    return [
      {
        kind: "success",
        text: "Markdown preview is available in the Preview panel.",
      },
    ]
  }

  if (path.endsWith(".py")) {
    return [
      {
        kind: "error",
        text: "Python execution needs Pyodide or a backend sandbox. Editing and syntax highlighting are ready.",
      },
    ]
  }

  if (path.endsWith(".c") || path.endsWith(".h")) {
    return [
      {
        kind: "error",
        text: "C compilation needs a secure backend sandbox with gcc or clang.",
      },
    ]
  }

  if (path.endsWith(".ts")) {
    return [
      {
        kind: "error",
        text: "TypeScript editing is ready. Browser execution needs a TypeScript transpiler step.",
      },
    ]
  }

  return [{ kind: "output", text: entry.content ?? "" }]
}

function runJavaScript(code: string): Array<Omit<TerminalLine, "id">> {
  const logs: string[] = []
  const safeConsole = {
    log: (...values: unknown[]) => {
      logs.push(values.map(formatConsoleValue).join(" "))
    },
  }

  try {
    Function("console", `"use strict";\n${code}`)(safeConsole)
    return [
      {
        kind: "success",
        text:
          logs.length > 0
            ? `${logs.join("\n")}\nProcess exited with code 0`
            : "Process exited with code 0",
      },
    ]
  } catch (error) {
    return [
      {
        kind: "error",
        text:
          error instanceof Error ? error.message : "JavaScript runtime error.",
      },
    ]
  }
}

function handleEchoCommand(
  command: string,
  cwd: string,
  workspace: Workspace,
): CommandResult {
  const redirectIndex = command.indexOf(">")
  if (redirectIndex === -1) {
    return {
      lines: [{ kind: "output", text: command.replace(/^echo\s+/, "") }],
    }
  }

  const rawText = command.slice(4, redirectIndex).trim()
  const rawPath = command.slice(redirectIndex + 1).trim()
  if (!rawPath) {
    return { lines: [{ kind: "error", text: "echo: missing output file" }] }
  }
  const path = resolvePath(cwd, rawPath)
  const content = `${rawText.replace(/^["']|["']$/g, "")}\n`

  return {
    workspace: {
      ...ensureParentDirectories(workspace, path),
      [path]: { kind: "file", content },
    },
    openPath: path,
    lines: [{ kind: "success", text: `wrote ${path}` }],
  }
}

function formatConsoleValue(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
