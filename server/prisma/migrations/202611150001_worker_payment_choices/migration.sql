ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_PERIOD_DUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_REQUESTED';

CREATE TYPE "PaymentPromptStatus" AS ENUM ('PENDING', 'REQUESTED', 'DEFERRED', 'PAID');

CREATE TABLE "PaymentPrompt" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "paymentPeriodId" TEXT NOT NULL,
    "status" "PaymentPromptStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "respondedAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentPrompt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentPrompt_paymentId_key" ON "PaymentPrompt"("paymentId");
CREATE UNIQUE INDEX "PaymentPrompt_paymentPeriodId_workerId_key" ON "PaymentPrompt"("paymentPeriodId", "workerId");
CREATE INDEX "PaymentPrompt_teamId_status_idx" ON "PaymentPrompt"("teamId", "status");
CREATE INDEX "PaymentPrompt_workerId_status_idx" ON "PaymentPrompt"("workerId", "status");

ALTER TABLE "PaymentPrompt" ADD CONSTRAINT "PaymentPrompt_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentPrompt" ADD CONSTRAINT "PaymentPrompt_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentPrompt" ADD CONSTRAINT "PaymentPrompt_paymentPeriodId_fkey" FOREIGN KEY ("paymentPeriodId") REFERENCES "PaymentPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentPrompt" ADD CONSTRAINT "PaymentPrompt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
