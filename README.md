# Eduverse

Eduverse is a modern learning workspace for organizations, teachers, and students. It brings class management, role-based dashboards, live sessions, materials, assignments, exams, chat, results, and organization administration into one Next.js application.

The platform is designed around multi-organization education workflows. A user can belong to multiple organizations, hold different roles per organization, and enter a workspace that adapts to the selected role.

## What It Does

- Role-based dashboards for administrators, teachers, and students.
- Organization membership, invitations, role selection, and user management.
- Class management with teachers, students, schedules, rooms, semesters, and archived history.
- Class spaces for home, chat, materials, assignments, live sessions, exams, results, and extensions.
- Assignment workflows with submissions, grading, feedback, and notification hooks.
- Class materials backed by S3 storage and signed upload/download flows.
- Live classroom sessions using LiveKit.
- Exam flows with lobby, lock mode, attempts, grading, results, and audit/integrity helpers.
- Notifications for class updates, announcements, assignments, and live activity.
- Feature enablement at the organization and class level, including extension support.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI and shadcn-style components
- Supabase Auth and Postgres
- AWS S3 for class files and materials
- LiveKit for live sessions
- Bun test runner
- Biome for formatting

## Repository Structure

```txt
app/                    Next.js routes, layouts, auth, invite, workspace pages, and API routes
app/api/                Server routes for classes, assignments, materials, messages, exams, live sessions, notifications, and user context
components/             Shared app chrome, dashboards, top bar, sidebar, and UI primitives
features/               Feature modules for admin, classes, chat, materials, assignments, exams, sessions, IDE, results, help, and profile
hooks/                  Shared React hooks
lib/                    App state, Supabase clients, domain services, mock data, feature registry, utilities, and tests
supabase/migrations/    Database migrations for organizations, classes, features, assignments, chat, exams, notifications, and live sessions
types/                  Test/runtime type helpers
public/                 Static icons and placeholder assets
```

## Prerequisites

- Node.js 22 LTS recommended
- Bun
- Supabase project with the migrations in `supabase/migrations`
- AWS S3 bucket for materials and assignment files
- LiveKit project for live sessions

## Environment Setup

Create a local environment file:

```sh
cp .env.example .env
```

Fill in the required values:

```txt
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_FROM_EMAIL=
GMAIL_FROM_NAME=Eduverse

AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

Keep `SUPABASE_SECRET_KEY`, Gmail OAuth credentials, AWS credentials, and LiveKit API secrets server-only. Do not expose them to the mobile app or any public client runtime.

## Getting Started

Install dependencies:

```sh
bun install
```

Run the development server:

```sh
bun run dev
```

Open the app at:

```txt
http://localhost:3000
```

The root route redirects to `/auth`. After sign in, users are taken into the workspace at `/dashboard`.

## Available Scripts

```sh
bun run dev              # Start the Next.js development server
bun run build            # Build with webpack
bun run build:turbopack  # Build with Turbopack
bun run start            # Start the production server
bun run typecheck        # Run TypeScript checks
bun run test             # Run Bun tests
bun run format           # Format the codebase with Biome
bun run format:check     # Check formatting with Biome
```

## Core Workflows

### Authentication And Organizations

Authentication uses Supabase email/password auth. User profile and organization context are loaded through `/api/me`, and the app shell redirects unauthenticated users to `/auth`.

Organizations support memberships, invitations, selected roles, default organization selection, and role-specific workspaces.

Organization invite confirmations are sent through the Gmail API when `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_FROM_EMAIL` are configured. If Gmail is not configured, the app still creates the invite and shows the confirmation link for manual sharing.

### Classes

Classes are scoped to organizations and support teachers, students, class metadata, active/archive state, and feature settings. Class navigation is resolved from the feature registry in `lib/features/feature-registry.ts`.

### Assignments

Assignment APIs live under:

```txt
app/api/classes/[classId]/assignments
```

They support assignment listing, creation/update behavior, submissions, grading context, and student/teacher-specific views.

### Materials

Materials APIs live under:

```txt
app/api/classes/[classId]/materials
```

The server handles upload and storage behavior so clients do not need direct write access to S3.

### Chat And Announcements

Class messages live under:

```txt
app/api/classes/[classId]/messages
```

The chat system supports text, announcement, and media-aware flows, with notification side effects for announcements.

### Live Sessions

Live sessions combine class session records, LiveKit tokens, session state, participant UI, chat, audio/video rendering, and a mini bar for active sessions.

### Exams

Exam modules cover manager and student experiences, session lock behavior, question navigation, results, integrity helpers, and audit helpers.

## Database

Supabase migrations live in:

```txt
supabase/migrations
```

They define organization management, invitations, class workflows, feature enablement, materials, class chat, assignments, exams, notifications, and live-session support.

Apply migrations to the target Supabase project before running production-like flows.

## Mobile Companion

The sibling repository `../Eduverse-mobile-app` is the Expo mobile companion for daily student and teacher workflows. It shares Supabase-backed domain data with this web app and should use this web app's API routes for server-owned behavior such as assignment submission, chat side effects, file downloads, notification actions, and role-aware validation.

## Development Notes

- Prefer server routes for mutations that need validation, storage access, notification side effects, or role checks.
- Keep server-only secrets out of client components and mobile configuration.
- Use the feature registry when adding class-level capabilities.
- Keep UI components consistent with the existing Radix/shadcn-style component set.
- Use focused tests for shared domain logic and high-risk workflow behavior.

## Project Status

Eduverse is an active product codebase, not a blank starter. Some mock data remains for dashboard history, sample activity, and empty-state support, while core organization, class, assignment, chat, material, notification, exam, and session infrastructure is implemented through Supabase-backed modules and API routes.
