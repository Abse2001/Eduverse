"use client"

import {
  Bell,
  BookOpen,
  Building2,
  CircleHelp,
  ClipboardCheck,
  DoorOpen,
  FileText,
  GraduationCap,
  KeyRound,
  MessageSquare,
  Palette,
  Search,
  Settings2,
  Sparkles,
  Trophy,
  Users,
  Video,
} from "lucide-react"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type HelpArticle = {
  id: string
  category: string
  title: string
  summary: string
  icon: typeof CircleHelp
  audience: HelpAudience[]
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

type HelpAudience = "All roles" | "Student" | "Teacher" | "Admin"

const FEATURED_ARTICLE_IDS = [
  "switching-organizations",
  "class-overview-navigation",
  "assignments-submissions-grading",
  "exams-integrity-results",
  "invite-access-problems",
] as const

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "switching-organizations",
    category: "Getting Started",
    title: "Switching organizations",
    summary:
      "Move between schools, teams, or workspaces from the organization menu in the top bar.",
    icon: Building2,
    audience: ["All roles"],
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
    audience: ["Admin"],
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
    id: "class-overview-navigation",
    category: "Classes",
    title: "Class overview and navigation",
    summary:
      "Use the class home page and sidebar to find announcements, deadlines, course progress, and available tools.",
    icon: BookOpen,
    audience: ["All roles"],
    image: {
      src: "/help/class-overview.png",
      alt: "Class overview page showing class navigation, progress, deadlines, teacher details, and available class tools.",
      width: 2850,
      height: 1540,
    },
    tags: [
      "class",
      "home",
      "navigation",
      "sidebar",
      "progress",
      "deadline",
      "teacher",
      "student",
    ],
    sections: [
      {
        title: "Open a class",
        items: [
          "Select a class from the sidebar. If the sidebar is collapsed, hover the icons to see class names.",
          "The class home page shows course details, teacher information, students, progress, and upcoming assignment or exam deadlines.",
          "Use the class navigation below the active class to move between enabled tools like Chat, Materials, Assignments, Sessions, Exam, Results, AI Agent, and Extensions.",
        ],
      },
      {
        title: "Manage class details",
        items: [
          "Teachers with permission and administrators can edit class name, code, room, term, stage, description, color, and results visibility from the class home page or dashboard.",
          "Disabled tools are controlled by organization or class feature settings, so the class navigation may differ between classes.",
        ],
      },
    ],
  },
  {
    id: "chat-announcements-media",
    category: "Classes",
    title: "Class chat, announcements, and media",
    summary:
      "Message the class, share files or images, search conversations, and send pinned announcements.",
    icon: MessageSquare,
    audience: ["All roles"],
    tags: [
      "chat",
      "messages",
      "announcement",
      "media",
      "files",
      "images",
      "search",
    ],
    sections: [
      {
        title: "Use class chat",
        items: [
          "Open Chat from a class to read and send class messages.",
          "Attach files or images from the composer when you need to share media with the class.",
          "Use the search button in Chat to find messages by sender, text, attachment name, media type, or announcement status.",
        ],
      },
      {
        title: "Announcements",
        items: [
          "Teachers and administrators can switch the composer into announcement mode.",
          "Announcements appear in the announcement bar above the conversation and can be opened to jump to the original message.",
          "Users with announcement permissions can remove announcement entries when they are no longer needed.",
        ],
      },
    ],
  },
  {
    id: "materials-ai-summaries",
    category: "Classes",
    title: "Materials and AI summaries",
    summary:
      "Upload class resources, preview or download files, and use AI-generated summaries when available.",
    icon: FileText,
    audience: ["All roles"],
    tags: [
      "materials",
      "resources",
      "files",
      "pdf",
      "video",
      "slides",
      "summary",
      "ai",
      "download",
    ],
    sections: [
      {
        title: "Work with materials",
        items: [
          "Open Materials from a class to view uploaded resources such as PDFs, images, videos, and slide files.",
          "Teachers and administrators can upload materials with a title and description, then refresh or delete materials when needed.",
          "Use preview or download actions to open materials through secure links.",
        ],
      },
      {
        title: "AI support",
        items: [
          "When AI summaries are available, use them to review the key points in a material without replacing the source file.",
          "Materials can also provide context for AI Agent answers when the class AI feature is enabled.",
        ],
      },
    ],
  },
  {
    id: "assignments-submissions-grading",
    category: "Classes",
    title: "Assignments, submissions, and grading",
    summary:
      "Create assignments, publish them, collect student work, and return grades with feedback.",
    icon: ClipboardCheck,
    audience: ["All roles"],
    image: {
      src: "/help/assignments.png",
      alt: "Assignments page showing assignment status, due dates, submission options, and grading workflow.",
      width: 2842,
      height: 1540,
    },
    tags: [
      "assignment",
      "assignments",
      "submission",
      "grade",
      "feedback",
      "draft",
      "published",
      "late",
      "ai",
    ],
    sections: [
      {
        title: "For teachers and administrators",
        items: [
          "Create assignments with a title, description, due date, maximum score, submission options, and optional files.",
          "Save work as a draft or publish it when students should see it.",
          "Review submissions, download submitted files, enter scores, add feedback, and use AI feedback support when configured.",
        ],
      },
      {
        title: "For students",
        items: [
          "Open Assignments to see pending, submitted, graded, and overdue work.",
          "Submit text, files, or both depending on the assignment settings.",
          "Check returned scores and teacher feedback after grading is complete.",
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
    audience: ["All roles"],
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
    id: "exams-integrity-results",
    category: "Classes",
    title: "Exams, monitoring, and retakes",
    summary:
      "Prepare exams, start attempts, monitor integrity events, grade answers, release results, and grant retakes.",
    icon: GraduationCap,
    audience: ["All roles"],
    image: {
      src: "/help/exams.png",
      alt: "Exam management page showing exam details, student attempts, monitoring status, grading, and retake controls.",
      width: 2868,
      height: 1788,
    },
    tags: [
      "exam",
      "exams",
      "quiz",
      "passcode",
      "integrity",
      "monitor",
      "retake",
      "grade",
      "results",
      "ai",
    ],
    sections: [
      {
        title: "Teacher workflow",
        items: [
          "Create exams manually or generate a draft with AI, then edit the title, duration, start time, passcode, questions, answers, and points.",
          "Publish exams when they are ready for students.",
          "Open exam details to monitor attempts, review suspicious integrity events, grade short answers, release results, or grant a retake.",
        ],
      },
      {
        title: "Student workflow",
        items: [
          "Open Exam from a class to see available exams and start an attempt when the exam is live.",
          "Enter the passcode if the exam requires one.",
          "Submit answers before the timer or closing time, then check released results when the teacher makes them available.",
        ],
      },
    ],
  },
  {
    id: "results-progress",
    category: "Classes",
    title: "Results and progress",
    summary:
      "Review assignment grades, released exam results, class averages, and student progress summaries.",
    icon: Trophy,
    audience: ["All roles"],
    tags: [
      "results",
      "grades",
      "scores",
      "progress",
      "average",
      "assignments",
      "exams",
      "visibility",
    ],
    sections: [
      {
        title: "Student results",
        items: [
          "Open Results from a class to see graded assignments and released exam results.",
          "When shared summaries are enabled, students can compare available class-level progress without managing other students' records.",
        ],
      },
      {
        title: "Teacher controls",
        items: [
          "Teachers and administrators can review roster-level result summaries for assignments and exams.",
          "Results visibility controls determine whether students can see shared class summaries.",
          "Exam results only appear to students after they are released.",
        ],
      },
    ],
  },
  {
    id: "ai-agent-ide-extensions",
    category: "Classes",
    title: "AI Agent, IDE, and extensions",
    summary:
      "Use optional class tools for AI study help, coding workspaces, and organization-specific extensions.",
    icon: Sparkles,
    audience: ["All roles"],
    tags: [
      "ai",
      "agent",
      "ide",
      "extensions",
      "custom",
      "coding",
      "terminal",
      "prompts",
    ],
    sections: [
      {
        title: "AI Agent",
        items: [
          "Open AI Agent from a class to ask study questions, request summaries, generate short quizzes, or get assignment guidance.",
          "Use suggested prompts to start quickly, and clear the chat when you want a fresh conversation for that class.",
        ],
      },
      {
        title: "Extensions and IDE",
        items: [
          "Open IDE when the coding extension is enabled for a class.",
          "Custom extensions appear under Extensions when an administrator has added them and the class has access.",
          "If an extension is missing, check whether Extensions are enabled for the organization and class.",
        ],
      },
    ],
  },
  {
    id: "search-notifications",
    category: "Account and Navigation",
    title: "Search and notifications",
    summary:
      "Find classes, tools, assignments, exams, and materials from the top bar, then follow notification updates.",
    icon: Bell,
    audience: ["All roles"],
    image: {
      src: "/help/search-notifications.png",
      alt: "Top bar search and notifications interface showing searchable class content and recent updates.",
      width: 2858,
      height: 1538,
    },
    tags: [
      "search",
      "notifications",
      "top bar",
      "classes",
      "assignments",
      "materials",
      "exams",
      "unread",
    ],
    sections: [
      {
        title: "Global search",
        items: [
          "Use the top-bar search field to find classes by name, code, term, stage, room, teacher, or student.",
          "Search can also surface enabled class tools, assignments, exams, and materials when they match your query.",
          "Select a result to open the related class page or content area.",
        ],
      },
      {
        title: "Notifications",
        items: [
          "Open the bell menu to review recent updates for the selected organization and role.",
          "Notifications can link to announcements, live sessions, new materials, published assignments, submitted or graded assignments, published exams, submitted exams, and released exam results.",
          "Mark individual notifications or all notifications as read when you are done reviewing them.",
        ],
      },
    ],
  },
  {
    id: "profile-roles-password-theme",
    category: "Account and Navigation",
    title: "Profile, roles, password, and theme",
    summary:
      "Manage account preferences, switch active organization roles, and update sign-in settings.",
    icon: KeyRound,
    audience: ["All roles"],
    tags: [
      "profile",
      "account",
      "role",
      "roles",
      "password",
      "theme",
      "language",
      "admin",
      "teacher",
      "student",
    ],
    sections: [
      {
        title: "Profile settings",
        items: [
          "Open Profile from the account menu to review your name, email, institution, and organization roles.",
          "Switch between available roles when your account has more than one role in the selected organization.",
          "Choose Light, Dark, or System theme from the profile page.",
        ],
      },
      {
        title: "Sign-in settings",
        items: [
          "Use Password from the profile page to manage your sign-in password.",
          "If a role switch changes what you can see, confirm the active role badge in the organization menu.",
          "Language options may appear in the profile page even when only English is currently enabled.",
        ],
      },
    ],
  },
  {
    id: "admin-users-classes-settings",
    category: "Administration",
    title: "Users, classes, registrations, and settings",
    summary:
      "Administer organization membership, class setup, join access, teacher permissions, and public features.",
    icon: Users,
    audience: ["Admin"],
    tags: [
      "admin",
      "administrator",
      "users",
      "invites",
      "roles",
      "classes",
      "registration",
      "join link",
      "settings",
      "teachers",
    ],
    sections: [
      {
        title: "People and access",
        items: [
          "Use the dashboard Users tab to search members, filter by role, invite users, resend or revoke invitations, and grant additional roles.",
          "Use the Public Link or registration area to manage public organization join access and incoming registration requests when those features are enabled.",
          "Invite links should be shared only with the intended person or group.",
        ],
      },
      {
        title: "Classes and organization settings",
        items: [
          "Use the Classes tab to create classes, assign or remove teachers, add students or teachers, control feature access, and end current or grouped classes for history.",
          "Use Settings to decide whether public organization features are available and which teachers can create classes or manage their own classes.",
          "Use Class History to review ended classes and prior terms.",
        ],
      },
    ],
  },
  {
    id: "admin-feature-configuration",
    category: "Administration",
    title: "Feature configuration and extensions",
    summary:
      "Choose the tools available across the organization and tune them per class.",
    icon: Settings2,
    audience: ["Admin"],
    image: {
      src: "/help/admin-features.png",
      alt: "Administrator features page showing organization-level class tool settings and extension configuration.",
      width: 2840,
      height: 1530,
    },
    tags: [
      "features",
      "feature settings",
      "extensions",
      "organization",
      "class",
      "chat",
      "materials",
      "assignments",
      "sessions",
      "exam",
      "results",
      "ai",
    ],
    sections: [
      {
        title: "Organization defaults",
        items: [
          "Open the dashboard Features tab to set organization defaults for class tools.",
          "Turning a feature off at the organization level hides it from classes even if a class previously had it enabled.",
          "Feature labels and sort order come from the configured feature definitions.",
        ],
      },
      {
        title: "Per-class access",
        items: [
          "Class feature settings can narrow which enabled organization tools appear in a specific class.",
          "Extensions can be enabled organization-wide, then shown or hidden for individual classes.",
          "When users report a missing page, check both organization and class-level feature settings.",
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
    audience: ["All roles"],
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
  {
    id: "content-and-upload-problems",
    category: "Troubleshooting",
    title: "Content, upload, or AI problems",
    summary:
      "Resolve common issues with files, assignments, exams, notifications, search results, and AI responses.",
    icon: CircleHelp,
    audience: ["All roles"],
    tags: [
      "troubleshooting",
      "upload",
      "download",
      "materials",
      "assignments",
      "exam",
      "ai",
      "notifications",
      "search",
    ],
    sections: [
      {
        title: "Files and class content",
        items: [
          "Refresh the page if a newly uploaded material, assignment file, or submission does not appear immediately.",
          "Confirm the feature is enabled for the class before troubleshooting a missing Chat, Materials, Assignments, Sessions, Exam, Results, AI Agent, or Extension page.",
          "If a secure download link expires, open the item again to generate a new link.",
        ],
      },
      {
        title: "AI, search, and notifications",
        items: [
          "AI tools require the related class feature and service configuration to be available.",
          "Global search loads class content in the background, so very new assignments, exams, or materials may take a moment to appear.",
          "Notifications are scoped to the selected organization and active role; switch roles if an expected update is missing.",
        ],
      },
    ],
  },
]

export function HelpScreen() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const navRef = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState("")
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const featuredArticles = useMemo(
    () =>
      FEATURED_ARTICLE_IDS.map((id) =>
        HELP_ARTICLES.find((article) => article.id === id),
      ).filter((article): article is HelpArticle => Boolean(article)),
    [],
  )
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
  const categories = useMemo(
    () =>
      Array.from(new Set(filteredArticles.map((article) => article.category))),
    [filteredArticles],
  )
  const anchorIds = useMemo(
    () =>
      categories.flatMap((category) => [
        getCategoryId(category),
        ...filteredArticles
          .filter((article) => article.category === category)
          .flatMap((article) => [
            article.id,
            ...article.sections.map((section) =>
              getSectionId(article.id, section.title),
            ),
          ]),
      ]),
    [categories, filteredArticles],
  )

  useEffect(() => {
    if (anchorIds.length === 0) {
      setActiveAnchorId(null)
      return
    }

    const scrollParent = getScrollParent(rootRef.current)

    function getScrollTop() {
      return scrollParent instanceof Window
        ? window.scrollY
        : scrollParent.scrollTop
    }

    function getScrollHeight() {
      return scrollParent instanceof Window
        ? document.documentElement.scrollHeight
        : scrollParent.scrollHeight
    }

    function getClientHeight() {
      return scrollParent instanceof Window
        ? window.innerHeight
        : scrollParent.clientHeight
    }

    function updateActiveAnchor() {
      const anchors = anchorIds
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => Boolean(element))

      if (anchors.length === 0) return

      const rootTop =
        scrollParent instanceof Window
          ? 0
          : scrollParent.getBoundingClientRect().top
      const targetTop = rootTop + 96
      const scrollBottom = getScrollTop() + getClientHeight()
      const pageBottom = scrollBottom >= getScrollHeight() - 2
      const positions = anchors.map((element) => ({
        id: element.id,
        top: element.getBoundingClientRect().top,
      }))
      const current = pageBottom
        ? positions.at(-1)
        : (positions.filter((anchor) => anchor.top <= targetTop).at(-1) ??
          positions[0])

      if (current) {
        setActiveAnchorId((currentId) =>
          currentId === current.id ? currentId : current.id,
        )
      }
    }

    updateActiveAnchor()
    scrollParent.addEventListener("scroll", updateActiveAnchor, {
      passive: true,
    })
    window.addEventListener("resize", updateActiveAnchor)

    return () => {
      scrollParent.removeEventListener("scroll", updateActiveAnchor)
      window.removeEventListener("resize", updateActiveAnchor)
    }
  }, [anchorIds])

  useEffect(() => {
    if (!activeAnchorId || !navRef.current) return

    const activeLink = Array.from(
      navRef.current.querySelectorAll<HTMLElement>("[data-help-nav-anchor]"),
    ).find((element) => element.dataset.helpNavAnchor === activeAnchorId)

    activeLink?.scrollIntoView({ block: "nearest" })
  }, [activeAnchorId])

  return (
    <div
      ref={rootRef}
      className="mx-auto max-w-7xl space-y-6 p-6 lg:pr-[368px]"
    >
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CircleHelp className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              How can we help?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Find quick guidance for account settings, class tools,
              administration, and common access issues.
            </p>
          </div>
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search help articles..."
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="mt-5 border-t pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Popular help
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {featuredArticles.map((article) => {
              const Icon = article.icon

              return (
                <a
                  key={article.id}
                  href={`#${article.id}`}
                  className="group flex min-h-20 items-start gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-5 text-foreground">
                      {article.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {article.category}
                    </span>
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      </div>

      <div>
        <aside className="hidden lg:block">
          <div className="fixed bottom-6 right-6 top-20 z-30 w-80 rounded-xl border bg-card shadow-sm">
            <div className="flex h-full flex-col">
              <div className="border-b p-4">
                <p className="text-sm font-semibold text-foreground">
                  Browse by topic
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Jump to any article or section.
                </p>
              </div>

              <nav ref={navRef} className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="space-y-5">
                  {categories.map((category) => {
                    const categoryId = getCategoryId(category)
                    const categoryArticles = filteredArticles.filter(
                      (article) => article.category === category,
                    )

                    return (
                      <div key={category} className="space-y-1.5">
                        <a
                          href={`#${categoryId}`}
                          data-help-nav-anchor={categoryId}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-muted",
                            activeAnchorId === categoryId
                              ? "bg-primary/10 text-primary"
                              : isCategoryActive({
                                    activeAnchorId,
                                    category,
                                    articles: categoryArticles,
                                  })
                                ? "text-primary"
                                : "text-foreground",
                          )}
                        >
                          <span>{category}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {categoryArticles.length}
                          </Badge>
                        </a>
                        <div className="space-y-1 border-l pl-2">
                          {categoryArticles.map((article) => (
                            <div key={article.id}>
                              <a
                                href={`#${article.id}`}
                                data-help-nav-anchor={article.id}
                                className={cn(
                                  "block rounded-md px-2 py-1.5 text-xs font-medium leading-4 transition-colors hover:bg-muted hover:text-foreground",
                                  activeAnchorId === article.id
                                    ? "bg-primary/10 text-primary"
                                    : isArticleActive({
                                          activeAnchorId,
                                          article,
                                        })
                                      ? "text-primary"
                                      : "text-muted-foreground",
                                )}
                              >
                                {article.title}
                              </a>
                              <div className="ml-2 space-y-0.5 border-l pl-2">
                                {article.sections.map((section) => {
                                  const sectionId = getSectionId(
                                    article.id,
                                    section.title,
                                  )

                                  return (
                                    <a
                                      key={section.title}
                                      href={`#${sectionId}`}
                                      data-help-nav-anchor={sectionId}
                                      className={cn(
                                        "block rounded-sm px-2 py-1 text-[11px] leading-4 transition-colors hover:text-foreground",
                                        activeAnchorId === sectionId
                                          ? "font-medium text-primary"
                                          : "text-muted-foreground/80",
                                      )}
                                    >
                                      {section.title}
                                    </a>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </nav>

              <div className="border-t p-4">
                <p className="text-sm font-semibold text-foreground">
                  Still need help?
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Check your active organization and role first. If the problem
                  continues, contact an organization administrator with the
                  class, page, and action you were trying to use.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 lg:hidden">
            {categories.map((category) => (
              <a
                key={category}
                href={`#${getCategoryId(category)}`}
                className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {category}
              </a>
            ))}
          </div>

          {filteredArticles.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  No help articles found
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try searching for classes, assignments, exams, results,
                  invites, or features.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {featuredArticles.slice(0, 3).map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => setQuery(article.tags[0] ?? "")}
                      className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {article.title}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {normalizedQuery ? (
                <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Showing {filteredArticles.length} result
                  {filteredArticles.length === 1 ? "" : "s"} for{" "}
                  <span className="font-medium text-foreground">{query}</span>
                </div>
              ) : null}

              {categories.map((category) => (
                <section
                  key={category}
                  id={getCategoryId(category)}
                  className="scroll-mt-20 space-y-3"
                >
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {category}
                    </h2>
                    <p className="text-sm text-muted-foreground">
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

              <section className="rounded-lg border bg-card p-5 lg:hidden">
                <p className="text-sm font-semibold text-foreground">
                  Still need help?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Check your active organization and role first. If the problem
                  continues, contact an organization administrator with the
                  class, page, and action you were trying to use.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function getCategoryId(category: string) {
  return `help-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
}

function getSectionId(articleId: string, sectionTitle: string) {
  return `${articleId}-${sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
}

function getScrollParent(element: HTMLElement | null): HTMLElement | Window {
  const appMain = element?.closest("main")

  if (appMain instanceof HTMLElement) return appMain

  let parent = element?.parentElement ?? null

  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY

    if (overflowY === "auto" || overflowY === "scroll") {
      return parent
    }

    parent = parent.parentElement
  }

  return window
}

function isCategoryActive({
  activeAnchorId,
  category,
  articles,
}: {
  activeAnchorId: string | null
  category: string
  articles: HelpArticle[]
}) {
  if (!activeAnchorId) return false
  if (activeAnchorId === getCategoryId(category)) return true

  return articles.some((article) =>
    isArticleActive({ activeAnchorId, article }),
  )
}

function isArticleActive({
  activeAnchorId,
  article,
}: {
  activeAnchorId: string | null
  article: HelpArticle
}) {
  if (!activeAnchorId) return false
  if (activeAnchorId === article.id) return true

  return article.sections.some(
    (section) => activeAnchorId === getSectionId(article.id, section.title),
  )
}

const audienceBadgeClassName: Record<HelpAudience, string> = {
  Student:
    "border-brand/20 bg-brand-subtle text-brand dark:border-brand/30 dark:bg-brand/10",
  Teacher:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  Admin:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300",
  "All roles": "border-border bg-muted text-muted-foreground",
}

const categoryDescriptions: Record<string, string> = {
  "Getting Started": "Workspace navigation and configuration basics.",
  "Account and Navigation": "Profile settings, search, and notification help.",
  Classes: "Guidance for class tools and learning spaces.",
  Administration: "Organization setup, users, classes, and feature controls.",
  Troubleshooting: "Common access, invite, and visibility problems.",
}

function HelpArticleCard({ article }: { article: HelpArticle }) {
  const Icon = article.icon

  return (
    <Card id={article.id} className="scroll-mt-20">
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
                {article.audience.map((role) => (
                  <Badge
                    key={role}
                    variant="outline"
                    className={cn("text-[10px]", audienceBadgeClassName[role])}
                  >
                    {role}
                  </Badge>
                ))}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {article.summary}
              </p>
            </div>

            <div className="space-y-4">
              {article.sections.map((section) => (
                <div
                  key={section.title}
                  id={getSectionId(article.id, section.title)}
                  className="scroll-mt-20"
                >
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
