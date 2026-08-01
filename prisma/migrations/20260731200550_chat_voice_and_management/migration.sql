-- CreateTable
CREATE TABLE "ChatVoicePresence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "deafened" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatVoicePresence_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatVoicePresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatVoiceSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatVoiceSignal_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChatVoicePresence_channelId_updatedAt_idx" ON "ChatVoicePresence"("channelId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatVoicePresence_channelId_userId_key" ON "ChatVoicePresence"("channelId", "userId");

-- CreateIndex
CREATE INDEX "ChatVoiceSignal_toUserId_channelId_createdAt_idx" ON "ChatVoiceSignal"("toUserId", "channelId", "createdAt");
