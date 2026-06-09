import { describe, expect, test } from "bun:test"
import { buildPreviewDocument } from "@/features/ide/preview"
import type { Workspace } from "@/features/ide/types"

describe("IDE preview", () => {
  test("previews the active markdown file even when index.html exists", () => {
    const workspace: Workspace = {
      "/index.html": {
        kind: "file",
        content: "<h1>HTML app</h1>",
      },
      "/notes.md": {
        kind: "file",
        content: "# Study Notes\n\n- Read chapter 1\n- Try `quiz()`",
      },
    }

    const preview = buildPreviewDocument(workspace, "/notes.md")

    expect(preview.includes("<h1>Study Notes</h1>")).toEqual(true)
    expect(preview.includes("<ul>")).toEqual(true)
    expect(preview.includes("<li>Read chapter 1</li>")).toEqual(true)
    expect(preview.includes("<code>quiz()</code>")).toEqual(true)
    expect(preview.includes("HTML app")).toEqual(false)
  })
})
