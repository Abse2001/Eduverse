import type { TerminalLine, Workspace } from "@/features/ide/types"

type RunnerLine = Omit<TerminalLine, "id">

export function runCodeFile(workspace: Workspace, path: string): RunnerLine[] {
  const entry = workspace[path]
  if (entry?.kind !== "file") {
    return [{ kind: "error", text: `run: no such file: ${path}` }]
  }

  const code = entry.content ?? ""

  if (path.endsWith(".js")) return runJavaScript(code)
  if (path.endsWith(".py")) return runPython(code)
  if (path.endsWith(".c") || path.endsWith(".cpp") || path.endsWith(".cc")) {
    return runCFamily(code, path.endsWith(".c") ? "C" : "C++")
  }
  if (path.endsWith(".sql")) return runSql(code)

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
      JSON.parse(code)
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

  if (path.endsWith(".ts")) {
    return [
      {
        kind: "error",
        text: "TypeScript editing is ready. Browser execution needs a TypeScript transpiler step.",
      },
    ]
  }

  return [{ kind: "output", text: code }]
}

export function runJavaScript(code: string): RunnerLine[] {
  const logs: string[] = []
  const safeConsole = {
    log: (...values: unknown[]) => {
      logs.push(values.map(formatValue).join(" "))
    },
  }

  try {
    Function("console", `"use strict";\n${code}`)(safeConsole)
    return successOutput(logs)
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

function runPython(code: string): RunnerLine[] {
  const logs: string[] = []
  const declaredNames = new Set<string>()
  const jsLines = [
    "const range = (start, stop, step = 1) => {",
    "  if (stop === undefined) { stop = start; start = 0; }",
    "  const values = [];",
    "  for (let value = start; step > 0 ? value < stop : value > stop; value += step) values.push(value);",
    "  return values;",
    "};",
    "const __format = (value) => Array.isArray(value) ? '[' + value.join(', ') + ']' : String(value);",
    "const print = (...values) => logs.push(values.map(__format).join(' '));",
  ]
  const lines = code.replace(/\r\n/g, "\n").split("\n")

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const defMatch = trimmed.match(/^def\s+([A-Za-z_]\w*)\(([^)]*)\):$/)
    if (defMatch) {
      const returnLine = lines[index + 1]?.trim()
      const returnMatch = returnLine?.match(/^return\s+(.+)$/)
      if (!returnMatch) {
        return unsupported("Python", "functions need a single return line")
      }
      jsLines.push(
        `function ${defMatch[1]}(${defMatch[2]}) { return ${pythonExpressionToJs(returnMatch[1])}; }`,
      )
      index += 1
      continue
    }

    if (trimmed === 'if __name__ == "__main__":') continue

    const executableLine = rawLine.startsWith(" ") ? trimmed : rawLine.trim()
    const assignmentMatch = executableLine.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/)
    if (assignmentMatch) {
      const [, name, expression] = assignmentMatch
      const operator = declaredNames.has(name) ? "" : "let "
      declaredNames.add(name)
      jsLines.push(`${operator}${name} = ${pythonExpressionToJs(expression)};`)
      continue
    }

    const printMatch = executableLine.match(/^print\((.*)\)$/)
    if (printMatch) {
      jsLines.push(`print(${pythonExpressionToJs(printMatch[1])});`)
      continue
    }

    return unsupported("Python", executableLine)
  }

  try {
    Function("logs", `${jsLines.join("\n")}`)(logs)
    return successOutput(logs)
  } catch (error) {
    return [
      {
        kind: "error",
        text: error instanceof Error ? error.message : "Python runtime error.",
      },
    ]
  }
}

function pythonExpressionToJs(expression: string) {
  return expression
    .replace(/f"([^"]*)"/g, (_, value: string) => {
      const template = value.replace(
        /\{([^}]+)\}/g,
        (_match, pythonValue) => `\${${pythonValue}}`,
      )
      return `\`${template}\``
    })
    .replace(/f'([^']*)'/g, (_, value: string) => {
      const template = value.replace(
        /\{([^}]+)\}/g,
        (_match, pythonValue) => `\${${pythonValue}}`,
      )
      return `\`${template}\``
    })
    .replace(
      /\[\s*([A-Za-z_]\w*)\s*\*\s*([A-Za-z_]\w*)\s+for\s+([A-Za-z_]\w*)\s+in\s+range\(([^)]+)\)\s*\]/g,
      "range($4).map(($3) => $1 * $2)",
    )
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
}

function runCFamily(code: string, label: "C" | "C++"): RunnerLine[] {
  if (!/\bint\s+main\s*\(/.test(code)) {
    return unsupported(label, "missing int main() entry point")
  }

  const variables = readCVariables(code)
  const logs: string[] = []

  for (const match of code.matchAll(
    /printf\s*\(\s*"((?:\\"|[^"])*)"\s*([^)]*)\)/g,
  )) {
    const format = unescapeCString(match[1])
    const args = match[2]
      .replace(/^,/, "")
      .split(",")
      .map((arg) => arg.trim())
      .filter(Boolean)
      .map((arg) => variables.get(arg) ?? arg.replace(/^["']|["']$/g, ""))
    logs.push(applyPrintf(format, args))
  }

  for (const match of code.matchAll(/cout\s*<<\s*([^;]+)/g)) {
    const parts = match[1]
      .split("<<")
      .map((part) => part.trim())
      .filter((part) => part !== "std::endl" && part !== "endl")
      .map((part) => {
        if (/^".*"$/.test(part)) return unescapeCString(part.slice(1, -1))
        return variables.get(part) ?? part
      })
    logs.push(parts.join(""))
  }

  if (logs.length === 0) {
    return unsupported(label, "add printf(...) or cout << ... output")
  }

  return successOutput(logs.map((line) => line.replace(/\n$/g, "")))
}

function readCVariables(code: string) {
  const variables = new Map<string, string | number>()
  const declarationPattern =
    /\b(?:int|float|double|char\s*\*|string|std::string)\s+([A-Za-z_]\w*)\s*=\s*("[^"]*"|[-+]?\d+(?:\.\d+)?)\s*;/g

  for (const match of code.matchAll(declarationPattern)) {
    const rawValue = match[2]
    variables.set(
      match[1],
      rawValue.startsWith('"')
        ? unescapeCString(rawValue.slice(1, -1))
        : Number(rawValue),
    )
  }

  return variables
}

function applyPrintf(format: string, args: Array<string | number>) {
  let argIndex = 0
  return format.replace(/%[dfsci]/g, () => String(args[argIndex++] ?? ""))
}

function unescapeCString(value: string) {
  return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\t/g, "\t")
}

function runSql(code: string): RunnerLine[] {
  const tables = new Map<string, { columns: string[]; rows: string[][] }>()
  const output: string[] = []
  const statements = code
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    const createMatch = statement.match(
      /^create\s+table\s+(\w+)\s*\(([\s\S]+)\)$/i,
    )
    if (createMatch) {
      const columns = createMatch[2].split(",").map((column) => {
        return column.trim().split(/\s+/)[0]
      })
      tables.set(createMatch[1].toLowerCase(), { columns, rows: [] })
      continue
    }

    const insertMatch = statement.match(
      /^insert\s+into\s+(\w+)(?:\s*\([^)]+\))?\s+values\s*\((.+)\)$/i,
    )
    if (insertMatch) {
      const table = tables.get(insertMatch[1].toLowerCase())
      if (!table) return unsupported("SQL", `unknown table ${insertMatch[1]}`)
      table.rows.push(splitSqlValues(insertMatch[2]))
      continue
    }

    const selectMatch = statement.match(
      /^select\s+(.+)\s+from\s+(\w+)(?:\s+where\s+(\w+)\s*=\s*(.+))?$/i,
    )
    if (selectMatch) {
      const table = tables.get(selectMatch[2].toLowerCase())
      if (!table) return unsupported("SQL", `unknown table ${selectMatch[2]}`)
      const selectedColumns =
        selectMatch[1].trim() === "*"
          ? table.columns
          : selectMatch[1].split(",").map((column) => column.trim())
      const selectedIndexes = selectedColumns.map((column) =>
        table.columns.findIndex(
          (tableColumn) => tableColumn.toLowerCase() === column.toLowerCase(),
        ),
      )
      if (selectedIndexes.some((index) => index === -1)) {
        return unsupported("SQL", "selected column does not exist")
      }

      const whereColumn = selectMatch[3]
      const whereValue = selectMatch[4]?.replace(/^['"]|['"]$/g, "")
      const whereIndex = whereColumn
        ? table.columns.findIndex(
            (column) => column.toLowerCase() === whereColumn.toLowerCase(),
          )
        : -1
      const rows = table.rows.filter((row) => {
        if (!whereColumn) return true
        return row[whereIndex] === whereValue
      })
      output.push(formatSqlRows(selectedColumns, selectedIndexes, rows))
      continue
    }

    const literalSelect = statement.match(/^select\s+(.+)$/i)
    if (literalSelect) {
      output.push(literalSelect[1].replace(/^['"]|['"]$/g, ""))
      continue
    }

    return unsupported("SQL", statement)
  }

  return successOutput(output)
}

function splitSqlValues(valueList: string) {
  return (
    valueList
      .match(/'[^']*'|"[^"]*"|[^,]+/g)
      ?.map((value) => value.trim().replace(/^['"]|['"]$/g, "")) ?? []
  )
}

function formatSqlRows(columns: string[], indexes: number[], rows: string[][]) {
  if (rows.length === 0) return "(0 rows)"
  const lines = [
    columns.join(" | "),
    columns.map((column) => "-".repeat(column.length)).join("-|-"),
  ]
  for (const row of rows) {
    lines.push(indexes.map((index) => row[index] ?? "").join(" | "))
  }
  return lines.join("\n")
}

function successOutput(logs: string[]): RunnerLine[] {
  return [
    {
      kind: "success",
      text:
        logs.length > 0
          ? `${logs.join("\n")}\nProcess exited with code 0`
          : "Process exited with code 0",
    },
  ]
}

function unsupported(language: string, detail: string): RunnerLine[] {
  return [
    {
      kind: "error",
      text: `${language} runner supports classroom basics right now. Unsupported: ${detail}.`,
    },
  ]
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
