# Chore Manager — Project Status & Roadmap

This document tracks current progress, milestones, architecture decisions, and configuration requirements for **Chore Manager**.

Last updated: 2026-11-13

---

## 1. Project Phase Tracker

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1** | Project Scaffolding, Core Authentication, Database Setup, & Team Creation | 🟢 **Completed** |
| **Phase 2** | Team Management, Invitations & Multi-Team Switching | 🟢 **Completed** |
| **Phase 3** | Chore Management & Weekly Organization | 🟢 **Completed** |
| **Phase 4** | Salary System & Age-Based Brackets | 🟢 **Completed** |
| **Phase 5** | Work Tracking (NFC, QR Code Fallback & Remote Photo Proofs) | 🟢 **Completed** |
| **Phase 6** | Piggy Bank Ledger, Financial Separation & Payment Periods | 🟢 **Completed** |
| **Phase 7** | Shopping Requests, Notifications, Goals, Calendar & Achievements | 🟡 **Partially implemented** (shopping, notifications, goals implemented; dashboard deadline calendar added; recurring rules, achievement unlocks, and disputes are not wired to user-facing flows) |
| **Phase 8** | Seed Data, Production Polish, PWA Optimization & Testing | 🟢 **Completed** (Neon DB Connected & Verified) |

---

## 2. Important Technical Decisions

1. **Monetary Precision**: All monetary values are represented in **Euros (€)** with 2 digits after the comma using PostgreSQL `Decimal(10, 2)` (or SQLite/Prisma equivalent for local development). Calculations round **up** to 2 decimal places.
2. **Team Structure Invariant**:
   - One Boss = Exactly One Team (`bossId` unique constraint).
   - One Worker = Multiple Teams (via `TeamMember`).
   - One Global Account per user with role (`BOSS` or `WORKER`).
3. **Hardware Fallback Strategy**: Web NFC is utilized for Android Chrome; camera-based QR codes and manual code confirmation are provided as universal fallbacks.
4. **Decoupled Architecture**:
   - `server/`: Express + TypeScript + Prisma ORM + Zod + JWT authentication.
   - `client/`: React + Vite + TypeScript + Tailwind CSS + Lucide Icons + TanStack Query + React Router.

---

## 3. Required Configuration & External Services

- **Database**: Neon PostgreSQL connection string (`DATABASE_URL`). For immediate local testing, SQLite or a local PostgreSQL instance can be used until external credentials are provided.
- **Image Storage**: Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`). A local static upload fallback is built into the server for offline testing.
- **Secrets**: `JWT_SECRET` for signing authentication tokens.

---

## 4. Known Issues & Follow-up Work
- Bosses can edit an open or assigned chore before work sessions begin. The server locks edits once a work session exists or a chore is closed.
- Workers can withdraw a pending chore request; its assignment remains in the database as cancelled for history.
- Boss and worker dashboards now include a month-filtered list of chore completion deadlines. This is an agenda view, not a full calendar grid.
- `RecurringChoreRule`, `Achievement`/`UserAchievement`, and `Dispute` database models exist, but recurring chore generation, achievement unlocking, and dispute review do not yet have complete user-facing workflows.
- The client production build reports a large JavaScript bundle (about 671 kB before gzip). Consider splitting dashboard/scanner code into lazy-loaded chunks.
- The offline experience caches app assets only. Chore, account, and finance data require a network connection.
- No automated test suite is currently configured. Server and client TypeScript/production builds are the available checks.

---

## 5. Live Verification Tests

- **Database Synchronization**: Tables, indexes, and constraints pushed to cloud Neon PostgreSQL in 2.77s.
- **Seeding Execution**: Successfully seeded 2 Boss accounts, 3 Worker accounts, 2 independent teams, 4 chores, and historical ledger transactions.
- **Authentication & Invariant Validation**:
  - Live probe test verified Dad login returns `Owned Team: Dad's Crew`.
  - Live probe test verified Lucas login returns `Teams Joined: 2` (Dad's Crew and Mum's Home Hub) with single global badge `NFC-LUCAS-001`.
  - Financial amounts confirmed in Euros (€) with 2 decimal digits after comma and ceiling rounding for hourly work.

