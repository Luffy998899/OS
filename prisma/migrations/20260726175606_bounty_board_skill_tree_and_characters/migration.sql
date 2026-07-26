-- CreateTable
CREATE TABLE "SkillProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SkillProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AvatarState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roomId" TEXT,
    "x" REAL NOT NULL DEFAULT 0,
    "y" REAL NOT NULL DEFAULT 0,
    "facing" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'online',
    "characterId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AvatarState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AvatarState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AvatarState" ("id", "roomId", "status", "updatedAt", "userId", "x", "y") SELECT "id", "roomId", "status", "updatedAt", "userId", "x", "y" FROM "AvatarState";
DROP TABLE "AvatarState";
ALTER TABLE "new_AvatarState" RENAME TO "AvatarState";
CREATE UNIQUE INDEX "AvatarState_userId_key" ON "AvatarState"("userId");
CREATE UNIQUE INDEX "AvatarState_characterId_key" ON "AvatarState"("characterId");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vertical" TEXT NOT NULL DEFAULT 'roadmap',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "points" INTEGER NOT NULL DEFAULT 10,
    "estimateMinutes" INTEGER,
    "dueAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'approved',
    "aiRationale" TEXT,
    "isBounty" BOOLEAN NOT NULL DEFAULT false,
    "bountyBonus" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" DATETIME,
    "skill" TEXT NOT NULL DEFAULT 'ops',
    "minSkillLevel" INTEGER NOT NULL DEFAULT 0,
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "clientId" TEXT,
    "roomId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("aiGenerated", "aiRationale", "approvalStatus", "assigneeId", "clientId", "completedAt", "createdAt", "createdById", "description", "dueAt", "estimateMinutes", "id", "points", "priority", "roomId", "source", "startedAt", "status", "title", "updatedAt", "vertical") SELECT "aiGenerated", "aiRationale", "approvalStatus", "assigneeId", "clientId", "completedAt", "createdAt", "createdById", "description", "dueAt", "estimateMinutes", "id", "points", "priority", "roomId", "source", "startedAt", "status", "title", "updatedAt", "vertical" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SkillProgress_userId_skill_key" ON "SkillProgress"("userId", "skill");
