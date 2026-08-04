-- DropIndex
DROP INDEX "AnnouncementAck_announcementId_userId_key";

-- DropIndex
DROP INDEX "CreativeSpace_key_key";

-- DropIndex
DROP INDEX "Project_shareToken_key";

-- DropIndex
DROP INDEX "TimetableLog_userId_date_type_key";

-- DropIndex
DROP INDEX "TimetableSlot_userId_date_idx";

-- DropIndex
DROP INDEX "WorldBlock_updatedAt_idx";

-- DropIndex
DROP INDEX "WorldNpc_key_key";

-- DropIndex
DROP INDEX "WorldPoi_x_y_z_key";

-- DropIndex
DROP INDEX "WorldRegion_key_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Announcement";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AnnouncementAck";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ApprovalRequest";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ClientRequest";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CreativeItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CreativeSpace";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Project";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Shoot";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TimetableLog";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TimetableSlot";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "VideoJob";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WorldBlock";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WorldMeta";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WorldNpc";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WorldPoi";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WorldRegion";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WorldSign";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
INSERT INTO "new_Task" ("aiGenerated", "aiRationale", "approvalStatus", "assigneeId", "bountyBonus", "claimedAt", "clientId", "completedAt", "createdAt", "createdById", "description", "dueAt", "estimateMinutes", "id", "isBounty", "minSkillLevel", "points", "priority", "roomId", "skill", "source", "startedAt", "status", "title", "updatedAt", "vertical") SELECT "aiGenerated", "aiRationale", "approvalStatus", "assigneeId", "bountyBonus", "claimedAt", "clientId", "completedAt", "createdAt", "createdById", "description", "dueAt", "estimateMinutes", "id", "isBounty", "minSkillLevel", "points", "priority", "roomId", "skill", "source", "startedAt", "status", "title", "updatedAt", "vertical" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

