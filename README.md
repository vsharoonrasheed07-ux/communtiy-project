# StayInSchool — School Dropout Tracking & Follow-up System

StayInSchool helps schools identify students at risk of dropping out early, coordinate compassionate follow-up with families, connect students to welfare schemes, and track re-enrolment outcomes across mobile, tablet, and desktop devices.

## Features

- **Role-Based Access Control (UI & API)**:
  - **Teacher**: Own class students, one-tap daily attendance (with offline IndexedDB sync), and follow-up logging.
  - **Principal**: Whole-school overview, case assignment, 7-day stale case escalations, and district/school reports.
  - **Admin**: User management, class setup, configurable 0–100 risk-score thresholds, and audit log viewer.
  - **Guardian**: Mobile-first read-only attendance view and direct messaging with teachers.
- **Configurable Risk Engine (0–100)**:
  - Attendance below 75% (`+30`), 5+ consecutive absences (`+25`), failing marks (`+15`), pending fees (`+10`), long distance (`+10`), and migration/health/child-labour/early-marriage flags (`+10` each, capped at `100`).
  - Automatically opens a follow-up case and notifies the assigned teacher when a student turns High Risk (`65+`).
- **Offline-Ready Attendance & PWA**:
  - Installable Progressive Web App (`manifest.webmanifest` + Service Worker).
  - Offline attendance queues in IndexedDB and syncs automatically when reconnected.
- **Cases Kanban & Follow-ups**:
  - Drag-and-drop board (`dnd-kit`) across `Flagged`, `Contacted`, `Home visit`, `Resolved`, and `Dropped out`.
  - Follow-up logging with optional photo/PDF attachments stored in PostgreSQL.
- **Automated Alerts & Daily Vercel Cron (`/api/cron/daily`)**:
  - Automatic SMS/WhatsApp guardian alerts after 3+ consecutive absences (provider interface supporting `mock`, `twilio`, and `msg91`).
  - Overdue follow-up reminders, 7-day principal escalation, and Monday weekly email digest (`mock` or `resend`).
- **Multilingual (`next-intl`)**:
  - Instant switcher for **English**, **Hindi (हिन्दी)**, and **Kannada (ಕನ್ನಡ)**.
- **Reports & Scheme Matching**:
  - Dropout reasons, class attendance, monthly trends, ward/village heatmap table, CSV & PDF export, and welfare scheme recommendations.

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS (`#F0EDE2` cream, `#17423B` sidebar, `#1F6F61` teal primary, Inter 400/500)
- **Database**: PostgreSQL (Neon) + Prisma ORM
- **Auth & Security**: JWT in `httpOnly` cookies (`jose`), `bcryptjs`, `zod` validation, login rate-limiting, input sanitization, and `AuditLog` tracking
- **Charts & Kanban**: Chart.js (`react-chartjs-2`), `@dnd-kit/core`, `jspdf`

## Demo Logins (after running seed)

All seeded accounts share the demo password: `Password123!`

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@stayinschool.org` | `Password123!` |
| **Principal** | `principal@stayinschool.org` | `Password123!` |
| **Teacher (Class 6A)** | `ananya@stayinschool.org` | `Password123!` |
| **Teacher (Class 7B)** | `ramesh@stayinschool.org` | `Password123!` |
| **Teacher (Class 8A)** | `lakshmi@stayinschool.org` | `Password123!` |
| **Guardian** | `guardian@stayinschool.org` | `Password123!` |

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
DATABASE_URL="postgresql://user:password@ep-example.aws.neon.tech/stayinschool?sslmode=require"
AUTH_SECRET="your-random-32-char-secret"
CRON_SECRET="your-random-cron-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SMS_PROVIDER="mock"       # "mock" | "twilio" | "msg91"
EMAIL_PROVIDER="mock"     # "mock" | "resend"
```

## Creating a Neon PostgreSQL Database

1. Sign in at [https://neon.tech](https://neon.tech) and click **New Project**.
2. Choose PostgreSQL 16 and your nearest region, then create the project.
3. From the **Connection Details** panel, copy the **Pooled connection string** (`?sslmode=require`).
4. Paste it as `DATABASE_URL` in `.env` (locally) and in Vercel Environment Variables (production).

## Local Setup, Migrations & Seed

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template and add your Neon DATABASE_URL
cp .env.example .env

# 3. Generate Prisma Client & run migrations
npx prisma generate
npm run prisma:migrate

# 4. Seed 60 students, 3 teachers, 1 principal, 1 admin, 1 guardian, and 90 days of attendance
npm run prisma:seed

# 5. Start the development server
npm run dev
```

Run unit tests and checks:

```bash
npm test
npm run lint
npm run build
```

## Deploying to Vercel

1. Push this repository to GitHub.
2. In the [Vercel Dashboard](https://vercel.com), click **Add New Project** and import your GitHub repository.
3. Under **Environment Variables**, add:
   - `DATABASE_URL` (your Neon PostgreSQL connection string)
   - `AUTH_SECRET` (a random 32+ character string)
   - `CRON_SECRET` (a random secret token)
   - `NEXT_PUBLIC_APP_URL` (your `https://your-app.vercel.app` URL)
   - `SMS_PROVIDER` (`mock`, `twilio`, or `msg91` + provider keys if live)
   - `EMAIL_PROVIDER` (`mock` or `resend` + `RESEND_API_KEY` if live)
4. Click **Deploy**. The `build` script runs `prisma generate && next build` automatically.
5. After the first deploy, run migrations and seed against your Neon database from your local machine (pointing `.env` `DATABASE_URL` to Neon):
   ```bash
   npx prisma migrate deploy
   npm run prisma:seed
   ```

## Enabling the Vercel Daily Cron Job

`vercel.json` is pre-configured to invoke `/api/cron/daily` once per day (`0 1 * * *`):

```json
{
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 1 * * *"
    }
  ]
}
```

When `CRON_SECRET` is configured in Vercel's Environment Variables, Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on every scheduled invocation. You can inspect or manually trigger it in **Vercel Project → Settings → Cron Jobs**.
