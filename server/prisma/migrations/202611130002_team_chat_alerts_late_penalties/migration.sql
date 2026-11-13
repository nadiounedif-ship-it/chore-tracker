ALTER TYPE "NotificationType" ADD VALUE 'TEAM_CHAT';
ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_PENALTY';
ALTER TABLE "ChoreAssignment" ADD COLUMN "deadlinePenaltyAppliedAt" TIMESTAMP(3);
