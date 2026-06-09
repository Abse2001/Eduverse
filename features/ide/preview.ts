import type { Workspace } from "@/features/ide/types"

export function buildPreviewDocument(
  workspace: Workspace,
  activePath: string,
  isDarkMode = false,
) {
  if (workspace["/index.html"]?.kind === "file") {
    const html = workspace["/index.html"].content ?? ""
    const css = workspace["/styles.css"]?.content ?? ""
    const js = workspace["/script.js"]?.content ?? ""
    return injectPreviewTheme(html, isDarkMode)
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
    return emptyPreview("Open a file to preview.", isDarkMode)

  if (activePath.endsWith(".md")) {
    return markdownPreview(activeEntry.content ?? "", isDarkMode)
  }

  if (activePath.endsWith(".json")) {
    return codePreview(activeEntry.content ?? "", "JSON", isDarkMode)
  }

  return codePreview(
    activeEntry.content ?? "",
    basename(activePath),
    isDarkMode,
  )
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

function markdownPreview(markdown: string, isDarkMode: boolean) {
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

  return `<!doctype html><html><head>${previewStyles(isDarkMode)}</head><body><main>${html}</main></body></html>`
}

function codePreview(code: string, label: string, isDarkMode: boolean) {
  return `<!doctype html><html><head>${previewStyles(isDarkMode)}</head><body><main><h1>${escapeHtml(label)}</h1><pre>${escapeHtml(code)}</pre></main></body></html>`
}

function emptyPreview(message: string, isDarkMode: boolean) {
  return `<!doctype html><html><head>${previewStyles(isDarkMode)}</head><body><main><p>${escapeHtml(message)}</p></main></body></html>`
}

function previewStyles(isDarkMode: boolean) {
  const colors = getPreviewColors(isDarkMode)

  return `<style>
    :root { color-scheme: ${isDarkMode ? "dark" : "light"}; }
    body { margin: 0; background: ${colors.background}; color: ${colors.foreground}; font-family: Inter, system-ui, sans-serif; }
    main { max-width: 760px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 16px; font-size: 28px; line-height: 1.15; }
    h2 { margin: 22px 0 10px; font-size: 20px; }
    p { line-height: 1.6; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    code { border-radius: 4px; background: ${colors.muted}; padding: 2px 4px; }
    pre { overflow: auto; border: 1px solid ${colors.border}; border-radius: 8px; background: ${colors.card}; padding: 16px; line-height: 1.5; }
  </style>`
}

function injectPreviewTheme(html: string, isDarkMode: boolean) {
  const theme = `<style data-eduverse-preview-theme>${previewBaseStyles(isDarkMode)}</style>`

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${theme}`)
  }

  return `<!doctype html><html><head>${theme}</head><body>${html}</body></html>`
}

function previewBaseStyles(isDarkMode: boolean) {
  const colors = getPreviewColors(isDarkMode)

  return `
    :root { color-scheme: ${isDarkMode ? "dark" : "light"}; }
    html, body { min-height: 100%; }
    body {
      background: ${colors.background};
      color: ${colors.foreground};
    }
  `
}

function getPreviewColors(isDarkMode: boolean) {
  return isDarkMode
    ? {
        background: "#020817",
        foreground: "#e5e7eb",
        card: "#0f172a",
        muted: "#1e293b",
        border: "#334155",
      }
    : {
        background: "#f8fafc",
        foreground: "#172033",
        card: "#ffffff",
        muted: "#e8eef8",
        border: "#d8e0ec",
      }
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
