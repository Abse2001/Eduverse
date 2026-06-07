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
        "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/50 [&_pre]:p-3",
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

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed)
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
          {items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item.slice(0, 16)}`}>
              {parseInline(item)}
            </li>
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
          {items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item.slice(0, 16)}`}>
              {parseInline(item)}
            </li>
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
    !/^(#{1,4})\s+/.test(trimmed) &&
    !/^[-*]\s+/.test(trimmed) &&
    !/^\d+[.)]\s+/.test(trimmed) &&
    !trimmed.startsWith(">")
  )
}

function parseInline(text: string) {
  const nodes: ReactNode[] = []
  const pattern =
    /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\))/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }

    if (match[2]) {
      nodes.push(<strong key={nodes.length}>{match[2]}</strong>)
    } else if (match[3]) {
      nodes.push(<code key={nodes.length}>{match[3]}</code>)
    } else if (match[4] && match[5]) {
      nodes.push(
        <a
          key={nodes.length}
          href={match[5]}
          target="_blank"
          rel="noreferrer noopener"
        >
          {match[4]}
        </a>,
      )
    }

    cursor = pattern.lastIndex
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}
