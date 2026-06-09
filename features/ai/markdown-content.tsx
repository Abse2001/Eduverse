"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type MarkdownContentProps = {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "space-y-3 text-sm leading-6 text-inherit",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_li]:pl-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc",
        "[&_hr]:border-border",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/50 [&_pre]:p-3",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-left",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        "[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold",
        className,
      )}
    >
      {parseMarkdownBlocks(content)}
    </div>
  )
}

function parseMarkdownBlocks(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocks: ReactNode[] = []
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
      blocks.push(
        <pre key={blocks.length}>
          <code>{codeLines.join("\n")}</code>
        </pre>,
      )
      continue
    }

    const setextHeading = lines[index + 1]?.trim()
    if (/^=+$/.test(setextHeading ?? "") || /^-+$/.test(setextHeading ?? "")) {
      const HeadingTag = setextHeading?.startsWith("=") ? "h2" : "h3"
      blocks.push(
        <HeadingTag key={blocks.length}>{parseInline(trimmed)}</HeadingTag>,
      )
      index += 2
      continue
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push(<hr key={blocks.length} />)
      index += 1
      continue
    }

    if (isTableStart(lines, index)) {
      const rows: string[][] = []
      while (index < lines.length && isTableRow(lines[index])) {
        if (!isTableDivider(lines[index])) {
          rows.push(parseTableRow(lines[index]))
        }
        index += 1
      }

      const [header, ...bodyRows] = rows
      const headerCells = header ? withStableKeys(header) : []
      const bodyRowsWithKeys = withStableKeys(bodyRows, (row) => row.join("|"))
      blocks.push(
        <table key={blocks.length}>
          {header ? (
            <thead>
              <tr>
                {headerCells.map(({ key, value }) => (
                  <th key={key}>{parseInline(value)}</th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {bodyRowsWithKeys.map(({ key, value: row }) => {
              const rowCells = withStableKeys(row)
              return (
                <tr key={key}>
                  {rowCells.map(({ key: cellKey, value: cell }) => (
                    <td key={cellKey}>{parseInline(cell)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>,
      )
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      const HeadingTag = level <= 2 ? "h2" : "h3"
      blocks.push(
        <HeadingTag key={blocks.length}>{parseInline(heading[2])}</HeadingTag>,
      )
      index += 1
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length) {
        const match = /^[-*]\s+(.+)$/.exec(lines[index].trim())
        if (!match) break
        items.push(match[1])
        index += 1
      }
      blocks.push(
        <ul key={blocks.length}>
          {withStableKeys(items).map(({ key, value }) => (
            <li key={key}>{parseInline(value)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length) {
        const match = /^\d+[.)]\s+(.+)$/.exec(lines[index].trim())
        if (!match) break
        items.push(match[1])
        index += 1
      }
      blocks.push(
        <ol key={blocks.length}>
          {withStableKeys(items).map(({ key, value }) => (
            <li key={key}>{parseInline(value)}</li>
          ))}
        </ol>,
      )
      continue
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      blocks.push(
        <blockquote
          key={blocks.length}
          className="border-l-2 border-primary/40 pl-3 text-muted-foreground"
        >
          {parseInline(quoteLines.join(" "))}
        </blockquote>,
      )
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (index < lines.length && shouldContinueParagraph(lines[index])) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    blocks.push(
      <p key={blocks.length}>{parseInline(paragraphLines.join(" "))}</p>,
    )
  }

  return blocks
}

function shouldContinueParagraph(line: string) {
  const trimmed = line.trim()
  return (
    Boolean(trimmed) &&
    !trimmed.startsWith("```") &&
    !/^(#{1,6})\s+/.test(trimmed) &&
    !/^[-*_]{3,}$/.test(trimmed) &&
    !/^[-*]\s+/.test(trimmed) &&
    !/^\d+[.)]\s+/.test(trimmed) &&
    !trimmed.startsWith(">") &&
    !isTableRow(line)
  )
}

function parseInline(text: string) {
  const nodes: ReactNode[] = []
  const pattern =
    /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|(https?:\/\/[^\s)]+))/g
  let cursor = 0
  let match = pattern.exec(text)

  while (match) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }

    if (match[2]) {
      nodes.push(<strong key={nodes.length}>{match[2]}</strong>)
    } else if (match[3]) {
      nodes.push(<em key={nodes.length}>{match[3]}</em>)
    } else if (match[4]) {
      nodes.push(<code key={nodes.length}>{match[4]}</code>)
    } else if (match[5] && match[6]) {
      nodes.push(
        <a
          key={nodes.length}
          href={match[6]}
          target="_blank"
          rel="noreferrer noopener"
        >
          {match[5]}
        </a>,
      )
    } else if (match[7]) {
      nodes.push(
        <a
          key={nodes.length}
          href={match[7]}
          target="_blank"
          rel="noreferrer noopener"
        >
          {match[7]}
        </a>,
      )
    }

    cursor = pattern.lastIndex
    match = pattern.exec(text)
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

function isTableStart(lines: string[], index: number) {
  return isTableRow(lines[index]) && isTableDivider(lines[index + 1] ?? "")
}

function isTableRow(line: string) {
  const trimmed = line.trim()
  return trimmed.includes("|") && trimmed.split("|").length >= 3
}

function isTableDivider(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function withStableKeys<T>(items: T[], getText = (item: T) => String(item)) {
  const seen = new Map<string, number>()
  return items.map((value) => {
    const text = getText(value)
    const count = seen.get(text) ?? 0
    seen.set(text, count + 1)
    return {
      key: keyFromText(`${text}:${count}`),
      value,
    }
  })
}

function keyFromText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return `${hash}`
}
