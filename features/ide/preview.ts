import type { Workspace } from "@/features/ide/types"

export function buildPreviewDocument(workspace: Workspace, activePath: string) {
  if (workspace["/index.html"]?.kind === "file") {
    const html = workspace["/index.html"].content ?? ""
    const css = workspace["/styles.css"]?.content ?? ""
    const js = workspace["/script.js"]?.content ?? ""
    return html
      .replace(
        /<link[^>]+href=["']\.\/styles\.css["'][^>]*>/,
        `<style>${css}</style>`,
      )
      .replace(
        /<script[^>]+src=["']\.\/script\.js["'][^>]*><\/script>/,
        `<script>${js}</script>`,
      )
  }

  const activeEntry = workspace[activePath]
  if (activeEntry?.kind !== "file")
    return emptyPreview("Open a file to preview.")

  if (activePath.endsWith(".md")) {
    return markdownPreview(activeEntry.content ?? "")
  }

  if (activePath.endsWith(".json")) {
    return codePreview(activeEntry.content ?? "", "JSON")
  }

  return codePreview(activeEntry.content ?? "", basename(activePath))
}

export function getProblems(workspace: Workspace, activePath: string) {
  const problems: string[] = []

  for (const [path, entry] of Object.entries(workspace)) {
    if (entry.kind !== "file") continue
    if (path.endsWith(".json")) {
      try {
        JSON.parse(entry.content ?? "")
      } catch (error) {
        problems.push(
          `${path}: ${error instanceof Error ? error.message : "Invalid JSON."}`,
        )
      }
    }
  }

  if (activePath.endsWith(".html")) {
    const content = workspace[activePath]?.content ?? ""
    if (!content.includes("</html>")) {
      problems.push(`${activePath}: missing closing </html> tag.`)
    }
  }

  return problems
}

function markdownPreview(markdown: string) {
  const html = markdown
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`
      if (line.startsWith("## ")) {
        return `<h2>${escapeHtml(line.slice(3))}</h2>`
      }
      if (!line.trim()) return "<br />"
      return `<p>${escapeHtml(line).replace(/`([^`]+)`/g, "<code>$1</code>")}</p>`
    })
    .join("")

  return `<!doctype html><html><head>${previewStyles()}</head><body><main>${html}</main></body></html>`
}

function codePreview(code: string, label: string) {
  return `<!doctype html><html><head>${previewStyles()}</head><body><main><h1>${escapeHtml(label)}</h1><pre>${escapeHtml(code)}</pre></main></body></html>`
}

function emptyPreview(message: string) {
  return `<!doctype html><html><head>${previewStyles()}</head><body><main><p>${escapeHtml(message)}</p></main></body></html>`
}

function previewStyles() {
  return `<style>
    body { margin: 0; background: #f8fafc; color: #172033; font-family: Inter, system-ui, sans-serif; }
    main { max-width: 760px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 16px; font-size: 28px; line-height: 1.15; }
    h2 { margin: 22px 0 10px; font-size: 20px; }
    p { line-height: 1.6; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    code { border-radius: 4px; background: #e8eef8; padding: 2px 4px; }
    pre { overflow: auto; border: 1px solid #d8e0ec; border-radius: 8px; background: white; padding: 16px; line-height: 1.5; }
  </style>`
}

function basename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? "project"
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
