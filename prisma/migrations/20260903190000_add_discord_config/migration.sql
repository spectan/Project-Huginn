-- CreateTable
CREATE TABLE "discord_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "alertSeverityHigh" BOOLEAN NOT NULL DEFAULT true,
    "alertSeverityMedium" BOOLEAN NOT NULL DEFAULT false,
    "alertSeverityLow" BOOLEAN NOT NULL DEFAULT false,
    "notifyRegistrations" BOOLEAN NOT NULL DEFAULT false,
    "notifyApprovals" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_config_pkey" PRIMARY KEY ("id")
);

