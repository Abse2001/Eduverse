"use client"

import {
  Building2,
  CircleHelp,
  DoorOpen,
  Palette,
  Search,
  Video,
} from "lucide-react"
import Image from "next/image"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type HelpArticle = {
  id: string
  category: string
  title: string
  summary: string
  icon: typeof CircleHelp
  image?: {
    src: string
    alt: string
    width: number
    height: number
  }
  tags: string[]
  sections: Array<{
    title: string
    items: string[]
  }>
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "switching-organizations",
    category: "Getting Started",
    title: "Switching organizations",
    summary:
      "Move between schools, teams, or workspaces from the organization menu in the top bar.",
    icon: Building2,
    image: {
      src: "/help/switch-organization.png",
      alt: "Organization selector open with the active organization and another organization option highlighted.",
      width: 2828,
      height: 1518,
    },
    tags: ["organization", "workspace", "switch", "dashboard"],
    sections: [
      {
        title: "Change your current workspace",
        items: [
          "Open the organization selector in the top-right navigation bar.",
          "Choose the organization you want to work in. Eduverse returns you to the dashboard after the switch completes.",
          "Use Create organization when you need to start a new workspace instead of joining an existing one.",
        ],
      },
      {
        title: "What changes after switching",
        items: [
          "Classes, users, feature settings, and extensions update to match the selected organization.",
          "Your role badge in the organization menu shows whether you are using that workspace as a student, teacher, or administrator.",
        ],
      },
    ],
  },
  {
    id: "customization-features",
    category: "Getting Started",
    title: "Customization and feature settings",
    summary:
      "Control which class tools are available and add custom extensions for an organization.",
    icon: Palette,
    tags: ["features", "extensions", "customization", "admin", "classes"],
    sections: [
      {
        title: "Organization features",
        items: [
          "Administrators can open the dashboard Features tab to turn tools like Chat, Materials, Assignments, Sessions, Exams, Results, and Extensions on or off.",
          "Organization-level settings define the default feature set for classes in that workspace.",
        ],
      },
      {
        title: "Custom extensions",
        items: [
          "Use Add Extension to create organization-specific tools with a name, description, and optional launch URL.",
          "Enabled extensions can appear in class navigation when they are available for the selected class.",
        ],
      },
    ],
  },
  {
    id: "live-sessions",
    category: "Classes",
    title: "Live sessions",
    summary:
      "Join class sessions with video, audio, screen sharing, participants, chat, and the shared whiteboard.",
    icon: Video,
    tags: ["sessions", "live", "video", "audio", "whiteboard", "screen"],
    sections: [
      {
        title: "Joining a session",
        items: [
          "Open a class from the sidebar, then select Sessions from the class navigation.",
          "Use the Join session control to connect. The session status updates from Offline to Connecting to Live Session.",
          "If Sessions is disabled for the class, Eduverse shows a disabled-feature message instead of the live room.",
        ],
      },
      {
        title: "Session tools",
        items: [
          "Use the microphone and camera controls to manage your own audio and video.",
          "Use screen sharing when you need to present your screen to the room.",
          "Open Participants or Chat from the right panel controls, and use the whiteboard tools during shared work.",
        ],
      },
    ],
  },
  {
    id: "invite-access-problems",
    category: "Troubleshooting",
    title: "Invite or access problems",
    summary:
      "Check the common reasons an organization, class, or feature is not visible.",
    icon: DoorOpen,
    tags: ["invite", "access", "permissions", "role", "class"],
    sections: [
      {
        title: "Organization access",
        items: [
          "Confirm you are signed in with the same email address that received the invite.",
          "If you belong to multiple organizations, switch to the correct organization from the top-right selector.",
          "Ask an administrator to resend the invite if the original invitation was revoked, expired, or sent to the wrong email address.",
        ],
      },
      {
        title: "Class or feature access",
        items: [
          "Classes only appear when your account is a member of that class in the selected organization.",
          "Some class tools may be hidden because an administrator or teacher disabled the feature for the organization or class.",
          "If a page redirects to the dashboard, select an organization first and try the class link again.",
        ],
      },
    ],
  },
]

export function HelpScreen() {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const filteredArticles = useMemo(() => {
    if (!normalizedQuery) return HELP_ARTICLES

    return HELP_ARTICLES.filter((article) => {
      const searchableText = [
        article.category,
        article.title,
        article.summary,
        ...article.tags,
        ...article.sections.flatMap((section) => [
          section.title,
          ...section.items,
        ]),
      ]
        .join(" ")
        .toLowerCase()

      return searchableText.includes(normalizedQuery)
    })
  }, [normalizedQuery])
  const categories = Array.from(
    new Set(filteredArticles.map((article) => article.category)),
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CircleHelp className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Help</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Find quick guidance for organization setup, class sessions, and
            access issues.
          </p>
        </div>
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search help articles..."
            className="pl-9"
          />
        </div>
      </div>

      {filteredArticles.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium text-foreground">
              No help articles found
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try searching for organization, sessions, invites, or features.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <section key={category} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {category}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {categoryDescriptions[category] ?? "Help articles"}
                </p>
              </div>
              <div className="grid gap-4">
                {filteredArticles
                  .filter((article) => article.category === category)
                  .map((article) => (
                    <HelpArticleCard key={article.id} article={article} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

const categoryDescriptions: Record<string, string> = {
  "Getting Started": "Workspace navigation and configuration basics.",
  Classes: "Guidance for class tools and learning spaces.",
  Troubleshooting: "Common access, invite, and visibility problems.",
}

function HelpArticleCard({ article }: { article: HelpArticle }) {
  const Icon = article.icon

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  {article.title}
                </h3>
                <Badge variant="secondary" className="text-[10px]">
                  {article.category}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {article.summary}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {article.sections.map((section) => (
                <div key={section.title}>
                  <h4 className="text-sm font-medium text-foreground">
                    {section.title}
                  </h4>
                  <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {article.image ? (
              <div className="overflow-hidden rounded-lg border bg-muted">
                <Image
                  src={article.image.src}
                  alt={article.image.alt}
                  width={article.image.width}
                  height={article.image.height}
                  className="h-auto w-full"
                  sizes="(min-width: 1024px) 832px, calc(100vw - 4rem)"
                />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
