-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BOSS', 'WORKER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "PaymentSchedule" AS ENUM ('WEEKLY_SUNDAY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "InvitationType" AS ENUM ('WORKER_REQUEST', 'BOSS_INVITE');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChoreCategory" AS ENUM ('CLEANING', 'GARDENING', 'COOKING', 'ORGANISATION', 'LAUNDRY', 'SHOPPING', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('FIXED', 'HOURLY');

-- CreateEnum
CREATE TYPE "ChorePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ChoreStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClockMethod" AS ENUM ('NFC', 'QR', 'MANUAL', 'REMOTE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EARNING', 'PAYOUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ShoppingStatus" AS ENUM ('PENDING', 'APPROVED', 'PURCHASED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVITATION', 'CHORE_REQUEST', 'CHORE_APPROVAL', 'CHORE_REJECTION', 'CLOCK_EVENT', 'PAYMENT_RECORDED', 'SHOPPING_REQUEST', 'DISPUTE_EVENT', 'REMINDER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "paymentSchedule" "PaymentSchedule" NOT NULL DEFAULT 'WEEKLY_SUNDAY',
    "bossId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInvitation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" "InvitationType" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryBracket" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chore" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT,
    "category" "ChoreCategory" NOT NULL DEFAULT 'CLEANING',
    "priority" "ChorePriority" NOT NULL DEFAULT 'MEDIUM',
    "paymentType" "PaymentType" NOT NULL DEFAULT 'FIXED',
    "fixedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "estimatedDurationMinutes" INTEGER,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3),
    "requiresBeforeAfterPictures" BOOLEAN NOT NULL DEFAULT false,
    "requiresNfc" BOOLEAN NOT NULL DEFAULT false,
    "allowMultipleWorkers" BOOLEAN NOT NULL DEFAULT false,
    "status" "ChoreStatus" NOT NULL DEFAULT 'OPEN',
    "pictures" TEXT[],
    "recurringChoreId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringChoreRule" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ChoreCategory" NOT NULL,
    "paymentType" "PaymentType" NOT NULL,
    "fixedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "dayOfWeek" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGenerated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringChoreRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreAssignment" (
    "id" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ChoreAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreSession" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOutAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "clockInMethod" "ClockMethod" NOT NULL DEFAULT 'MANUAL',
    "clockOutMethod" "ClockMethod",
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "beforePictureUrl" TEXT,
    "afterPictureUrl" TEXT,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "workerAgeAtWork" INTEGER,
    "hourlyRateApplied" DECIMAL(10,2),
    "finalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,

    CONSTRAINT "ChoreSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfcBadge" (
    "id" TEXT NOT NULL,
    "badgeUid" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "label" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScannedAt" TIMESTAMP(3),

    CONSTRAINT "NfcBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PiggyBankTransaction" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "choreSessionId" TEXT,
    "paymentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PiggyBankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPeriod" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "paymentPeriodId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidById" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingRequest" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "choreId" TEXT,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "pictureUrl" TEXT,
    "priority" "ChorePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ShoppingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(10,2) NOT NULL,
    "pictureUrl" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "badgeIcon" TEXT NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "choreSessionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "bossNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "linkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Team_bossId_key" ON "Team"("bossId");

-- CreateIndex
CREATE INDEX "Team_bossId_idx" ON "Team"("bossId");

-- CreateIndex
CREATE INDEX "TeamMember_workerId_idx" ON "TeamMember"("workerId");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_workerId_key" ON "TeamMember"("teamId", "workerId");

-- CreateIndex
CREATE INDEX "TeamInvitation_teamId_workerId_status_idx" ON "TeamInvitation"("teamId", "workerId", "status");

-- CreateIndex
CREATE INDEX "SalaryBracket_teamId_idx" ON "SalaryBracket"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryBracket_teamId_minAge_maxAge_key" ON "SalaryBracket"("teamId", "minAge", "maxAge");

-- CreateIndex
CREATE INDEX "Chore_teamId_weekNumber_year_idx" ON "Chore"("teamId", "weekNumber", "year");

-- CreateIndex
CREATE INDEX "Chore_teamId_status_idx" ON "Chore"("teamId", "status");

-- CreateIndex
CREATE INDEX "RecurringChoreRule_teamId_isActive_idx" ON "RecurringChoreRule"("teamId", "isActive");

-- CreateIndex
CREATE INDEX "ChoreAssignment_workerId_idx" ON "ChoreAssignment"("workerId");

-- CreateIndex
CREATE INDEX "ChoreAssignment_choreId_idx" ON "ChoreAssignment"("choreId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreAssignment_choreId_workerId_key" ON "ChoreAssignment"("choreId", "workerId");

-- CreateIndex
CREATE INDEX "ChoreSession_workerId_status_idx" ON "ChoreSession"("workerId", "status");

-- CreateIndex
CREATE INDEX "ChoreSession_teamId_status_idx" ON "ChoreSession"("teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NfcBadge_badgeUid_key" ON "NfcBadge"("badgeUid");

-- CreateIndex
CREATE UNIQUE INDEX "NfcBadge_workerId_key" ON "NfcBadge"("workerId");

-- CreateIndex
CREATE INDEX "NfcBadge_badgeUid_idx" ON "NfcBadge"("badgeUid");

-- CreateIndex
CREATE UNIQUE INDEX "PiggyBankTransaction_choreSessionId_key" ON "PiggyBankTransaction"("choreSessionId");

-- CreateIndex
CREATE INDEX "PiggyBankTransaction_workerId_teamId_idx" ON "PiggyBankTransaction"("workerId", "teamId");

-- CreateIndex
CREATE INDEX "PiggyBankTransaction_teamId_idx" ON "PiggyBankTransaction"("teamId");

-- CreateIndex
CREATE INDEX "PiggyBankTransaction_createdAt_idx" ON "PiggyBankTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentPeriod_teamId_status_idx" ON "PaymentPeriod"("teamId", "status");

-- CreateIndex
CREATE INDEX "Payment_teamId_workerId_idx" ON "Payment"("teamId", "workerId");

-- CreateIndex
CREATE INDEX "Payment_paymentPeriodId_idx" ON "Payment"("paymentPeriodId");

-- CreateIndex
CREATE INDEX "ShoppingRequest_teamId_status_idx" ON "ShoppingRequest"("teamId", "status");

-- CreateIndex
CREATE INDEX "SavingsGoal_workerId_idx" ON "SavingsGoal"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_code_key" ON "Achievement"("code");

-- CreateIndex
CREATE INDEX "UserAchievement_workerId_idx" ON "UserAchievement"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_workerId_achievementId_key" ON "UserAchievement"("workerId", "achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_choreSessionId_key" ON "Dispute"("choreSessionId");

-- CreateIndex
CREATE INDEX "Dispute_teamId_status_idx" ON "Dispute"("teamId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_bossId_fkey" FOREIGN KEY ("bossId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryBracket" ADD CONSTRAINT "SalaryBracket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_recurringChoreId_fkey" FOREIGN KEY ("recurringChoreId") REFERENCES "RecurringChoreRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringChoreRule" ADD CONSTRAINT "RecurringChoreRule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreAssignment" ADD CONSTRAINT "ChoreAssignment_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreAssignment" ADD CONSTRAINT "ChoreAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSession" ADD CONSTRAINT "ChoreSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ChoreAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSession" ADD CONSTRAINT "ChoreSession_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSession" ADD CONSTRAINT "ChoreSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfcBadge" ADD CONSTRAINT "NfcBadge_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiggyBankTransaction" ADD CONSTRAINT "PiggyBankTransaction_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiggyBankTransaction" ADD CONSTRAINT "PiggyBankTransaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiggyBankTransaction" ADD CONSTRAINT "PiggyBankTransaction_choreSessionId_fkey" FOREIGN KEY ("choreSessionId") REFERENCES "ChoreSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiggyBankTransaction" ADD CONSTRAINT "PiggyBankTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPeriod" ADD CONSTRAINT "PaymentPeriod_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentPeriodId_fkey" FOREIGN KEY ("paymentPeriodId") REFERENCES "PaymentPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingRequest" ADD CONSTRAINT "ShoppingRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingRequest" ADD CONSTRAINT "ShoppingRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingRequest" ADD CONSTRAINT "ShoppingRequest_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_choreSessionId_fkey" FOREIGN KEY ("choreSessionId") REFERENCES "ChoreSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
