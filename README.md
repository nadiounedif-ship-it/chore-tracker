# 🏠 Chore Manager — Family Chore & Earnings Platform

**Chore Manager** is a full-stack, production-quality family chore distribution and financial management platform. Modeled like a small company, it empowers parents (Bosses) to distribute chores, track working time, and manage payroll, while allowing children (Workers) to join multiple teams with a single account, complete chores, clock in/out using NFC or QR badges, and grow their personal piggy bank.

---

## 🌟 Key Features

1. **Role Separation & Multi-Tenant Team Structure**:
   - **One Boss = Exactly One Team**: Enforced at the database and API level.
   - **One Worker = Multiple Teams**: Workers join multiple parent/family teams using a single unified account.
   - **Independent Team Finances**: Earnings and payment records in Team A never mix with Team B.
2. **Precision Euro Monetary System**:
   - All financial balances are handled directly in **Euros (€)** with exact precision using PostgreSQL `Decimal(10, 2)`.
   - Hourly calculations are rounded **up** to 2 digits after the comma (e.g. `25 mins @ 3.50 €/hr = 1,46 €`).
   - Clean European currency formatting (`12,50 €`).
3. **Dynamic Age-Based Salaries with Birthday Adjustments**:
   - Hourly rates automatically adjust based on the worker's exact age on the day of work.
   - Historical earnings are permanently snapshotted and never recalculated.
4. **Universal Attendance & Work Tracking**:
   - **Web NFC Support**: Boss scans worker's NFC tag via smartphone.
   - **Dynamic QR Code Scanner**: Automatic fallback using camera or screen scanning for iPhones and PCs.
   - **Remote Work Mode**: Stopwatch timer with mandatory Before and After photo proofs.
5. **Piggy Bank & Financial Ledgers**:
   - **Combined Piggy Bank**: Shows total unpaid earnings across all joined teams.
   - **Team Breakdown**: View earnings separately for Dad, Mum, etc.
   - **One-Click Payouts**: Bosses record official payments with immutable audit trails.
6. **Progressive Web App (PWA)**:
   - Installable on mobile devices (Android and iOS) and desktop.
   - Offline caching for chore lists and app shell.

---

## 🚀 Beginner Quick-Start Guide

### Step 1: Set Up Free Neon PostgreSQL Database

1. Open your browser and go to: **[https://neon.tech](https://neon.tech)**
2. Click the **Sign Up** button in the top right corner (you can sign in with your Google or GitHub account).
3. Once logged in, click **Create Project**.
4. Name the project `chore-manager` and click **Create Project**.
5. You will see a dashboard with a box titled **Connection Details**. Look for the string starting with:
   ```text
   postgresql://...
   ```
6. Click the **Copy** button next to the connection string.
7. Open the file `server/.env` inside the project folder:
   `C:\Users\Aminm\.gemini\antigravity\scratch\chore-manager\server\.env`
8. Find the line:
   ```text
   DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-sample-pooler.region.aws.neon.tech/neondb?sslmode=require"
   ```
9. Replace it with your copied Neon connection string, and save the file.

---

### Step 2: Push Database Schema & Seed Demo Data

Once you have pasted your Neon `DATABASE_URL` in `server/.env`, run the following two commands in your terminal:

```bash
# Apply database tables
cd server
npm run prisma:push

# Populate realistic demo family data
npm run prisma:seed
```

---

### Step 3: Run the Application

Start the backend server and frontend development server:

**Terminal 1 (Backend Server):**
```bash
cd server
npm run dev
```
*(Runs on `http://localhost:4000`)*

**Terminal 2 (Frontend Client):**
```bash
cd client
npm run dev
```
*(Runs on `http://localhost:5173`)*

Open your browser to: **[http://localhost:5173](http://localhost:5173)**

---

## 👥 Pre-Configured Demo Accounts

For effortless testing, the seed script creates a complete family scenario:

| Role | Name | Email | Password | Details |
| :--- | :--- | :--- | :--- | :--- |
| **Boss** | David Miller (Dad) | `dad@family.test` | `Password123!` | Owns team **"Dad's Crew"** |
| **Boss** | Sarah Miller (Mum) | `mum@family.test` | `Password123!` | Owns team **"Mum's Home Hub"** |
| **Worker** | Lucas (Age 16) | `lucas@family.test` | `Password123!` | Member of **both** Dad's and Mum's teams |
| **Worker** | Emma (Age 14) | `emma@family.test` | `Password123!` | Member of **both** Dad's and Mum's teams |
| **Worker** | Noah (Age 12) | `noah@family.test` | `Password123!` | Member of Mum's team |

*Tip: The login page includes 1-click quick login buttons for all demo users!*

---

## 📱 Hardware & Attendance Verification

- **NFC Badges**:
  - Lucas: `NFC-LUCAS-001`
  - Emma: `NFC-EMMA-002`
  - Noah: `NFC-NOAH-003`
- **QR Code Fallback**:
  - In the Worker view, tap the **"📱 My QR Badge"** tab.
  - The worker's phone displays their personalized high-resolution QR code.
  - The Boss can scan this badge directly on their phone or type the UID into the scanner tab.

## ⚙️ New account and team settings

- Open **Profile** in the top bar to update your name, username and profile photo, change your password, verify or change your email address, and manage email notification preferences. Date of birth is read-only because it determines hourly pay.
- Workers can open **My Teams** to accept or decline invitations, switch teams, review team information, or leave a team. Leaving preserves earnings and completed work history.
- Bosses can set payment frequency in **Profile → Payment Settings**. Existing payment periods keep their original schedule; newly opened periods use the current setting.
- Chores can only be deleted if no worker request, assignment, or work session exists. This rule is enforced by the API.

## ✉️ Email delivery setup (optional)

In `server/.env`, configure `RESEND_API_KEY` and `EMAIL_FROM`. Create a free Resend account, verify the sending domain shown in `EMAIL_FROM`, and use an address on that domain. Keep the API key on the server; never add it to the client environment. Email notifications require a verified user email address and the user's enabled notification categories. In-app notifications continue to work when email delivery is not configured or a send fails.

Apply the additive database migration and regenerate Prisma Client when deploying this version:

```bash
cd server
npx prisma migrate deploy
npx prisma generate
```

The migration adds profile verification/preferences, inactivity-aware sessions, payment schedule details, and notification references. It does not delete existing records.

## 📲 Install on a phone

On Android, open Chore Manager in Chrome and use **Install app** when it appears, or select **Add to Home screen** in Chrome's menu. On iPhone/iPad, open the site in Safari, tap **Share**, then **Add to Home Screen**. NFC requires a compatible Android device, Chrome, and HTTPS. Camera QR scanning is the cross-device fallback. Offline mode caches the app shell only; account, chore and financial actions require a network connection.

---

## 📁 Project Architecture

```text
chore-manager/
├── server/                      # Express + TypeScript + Prisma Backend
│   ├── prisma/
│   │   ├── schema.prisma        # Complete PostgreSQL relational schema
│   │   └── seed.ts              # Demo family seed data script
│   ├── src/
│   │   ├── index.ts             # Express server entry point
│   │   ├── config.ts            # Environment & secrets configuration
│   │   ├── prisma.ts            # Prisma client singleton
│   │   ├── middleware/          # Auth JWT & Multi-tenant team guards
│   │   ├── utils/               # Currency ceiling arithmetic & age calculator
│   │   └── routes/              # Modular REST API endpoints
│   └── uploads/                 # Photo proofs and avatar storage
│
└── client/                      # React + Vite + TypeScript Frontend (PWA)
    ├── src/
    │   ├── components/          # Reusable UI headers, badges, navigation
    │   ├── context/             # Authentication & Team Switcher Context
    │   ├── pages/               # Boss Dashboard, Worker Dashboard, AuthPage
    │   ├── services/            # Type-safe API client
    │   └── types/               # TypeScript interfaces
    ├── vite.config.ts           # Vite + PWA service worker config
    └── tailwind.config.js       # Modern color palette & styles
```
