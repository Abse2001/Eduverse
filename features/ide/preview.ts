import type { Workspace } from "@/features/ide/types"

export function buildPreviewDocument(
  workspace: Workspace,
  activePath: string,
  isDarkMode = false,
) {
  const activeEntry = workspace[activePath]

  if (activeEntry?.kind === "file" && activePath.endsWith(".md")) {
    return markdownPreview(activeEntry.content ?? "", isDarkMode)
  }

  if (activeEntry?.kind === "file" && activePath.endsWith(".json")) {
    return codePreview(activeEntry.content ?? "", "JSON", isDarkMode)
  }

  if (workspace["/index.html"]?.kind === "file") {
    const html = workspace["/index.html"].content ?? ""
    const css = workspace["/styles.css"]?.content ?? ""
    const js = workspace["/script.js"]?.content ?? ""
    const document = injectPreviewTheme(html, isDarkMode)
      .replace(
        /<link[^>]+href=["']\.\/styles\.css["'][^>]*>/,
        `<style>${css}</style>`,
      )
      .replace(
        /<script[^>]+src=["']\.\/script\.js["'][^>]*><\/script>/,
        `<script>${js}</script>`,
      )
    return injectConsoleBridge(document)
  }

  if (activeEntry?.kind !== "file")
    return emptyPreview("Open a file to preview.", isDarkMode)

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
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const html: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`)
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      html.push(
        `<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`,
      )
      index += 1
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length) {
        const match = /^[-*]\s+(.+)$/.exec(lines[index].trim())
        if (!match) break
        items.push(`<li>${renderInlineMarkdown(match[1])}</li>`)
        index += 1
      }
      html.push(`<ul>${items.join("")}</ul>`)
      continue
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length) {
        const match = /^\d+[.)]\s+(.+)$/.exec(lines[index].trim())
        if (!match) break
        items.push(`<li>${renderInlineMarkdown(match[1])}</li>`)
        index += 1
      }
      html.push(`<ol>${items.join("")}</ol>`)
      continue
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      html.push(
        `<blockquote>${renderInlineMarkdown(quoteLines.join(" "))}</blockquote>`,
      )
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (
      index < lines.length &&
      shouldContinueMarkdownParagraph(lines[index])
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`)
  }

  return `<!doctype html><html><head>${previewStyles(isDarkMode)}</head><body><main>${html.join("")}</main></body></html>`
}

function shouldContinueMarkdownParagraph(line: string) {
  const trimmed = line.trim()
  return (
    Boolean(trimmed) &&
    !trimmed.startsWith("```") &&
    !/^(#{1,3})\s+/.test(trimmed) &&
    !/^[-*]\s+/.test(trimmed) &&
    !/^\d+[.)]\s+/.test(trimmed) &&
    !trimmed.startsWith(">")
  )
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    )
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
    h3 { margin: 18px 0 8px; font-size: 16px; }
    p { line-height: 1.6; }
    ul, ol { line-height: 1.6; padding-left: 24px; }
    blockquote { margin: 16px 0; border-left: 3px solid ${colors.border}; padding-left: 14px; color: ${colors.mutedForeground}; }
    a { color: ${colors.link}; font-weight: 600; text-underline-offset: 3px; }
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

function injectConsoleBridge(html: string) {
  const bridge = `<script>
(() => {
  const serialize = (value) => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };
  const post = (level, args) => {
    window.parent.postMessage({
      source: "eduverse-preview-console",
      level,
      message: Array.from(args).map(serialize).join(" ")
    }, "*");
  };
  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level];
    console[level] = (...args) => {
      post(level, args);
      original.apply(console, args);
    };
  }
  window.addEventListener("error", (event) => {
    post("error", [event.message]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    post("error", [event.reason]);
  });
})();
</script>`

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bridge}</body>`)
  }

  return `${html}${bridge}`
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
        mutedForeground: "#94a3b8",
        border: "#334155",
        link: "#93c5fd",
      }
    : {
        background: "#f8fafc",
        foreground: "#172033",
        card: "#ffffff",
        muted: "#e8eef8",
        mutedForeground: "#64748b",
        border: "#d8e0ec",
        link: "#2563eb",
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
