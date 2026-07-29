-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AvatarState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roomId" TEXT,
    "x" REAL NOT NULL DEFAULT 0,
    "y" REAL NOT NULL DEFAULT 0,
    "alt" REAL NOT NULL DEFAULT 0,
    "facing" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'online',
    "characterId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AvatarState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AvatarState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AvatarState" ("characterId", "facing", "id", "roomId", "status", "updatedAt", "userId", "x", "y") SELECT "characterId", "facing", "id", "roomId", "status", "updatedAt", "userId", "x", "y" FROM "AvatarState";
DROP TABLE "AvatarState";
ALTER TABLE "new_AvatarState" RENAME TO "AvatarState";
CREATE UNIQUE INDEX "AvatarState_userId_key" ON "AvatarState"("userId");
CREATE UNIQUE INDEX "AvatarState_characterId_key" ON "AvatarState"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
