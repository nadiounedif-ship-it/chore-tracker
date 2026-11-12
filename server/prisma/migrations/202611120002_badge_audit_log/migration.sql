CREATE TABLE "BadgeAuditLog" (
  "id" TEXT NOT NULL,
  "badgeUid" TEXT NOT NULL,
  "fromWorkerId" TEXT NOT NULL,
  "toWorkerId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BadgeAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BadgeAuditLog_badgeUid_createdAt_idx" ON "BadgeAuditLog"("badgeUid", "createdAt");
CREATE INDEX "BadgeAuditLog_teamId_createdAt_idx" ON "BadgeAuditLog"("teamId", "createdAt");
