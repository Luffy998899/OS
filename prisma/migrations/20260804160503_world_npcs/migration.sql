-- CreateTable
CREATE TABLE "WorldNpc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'staff',
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "z" REAL NOT NULL,
    "yaw" REAL NOT NULL DEFAULT 0,
    "seated" BOOLEAN NOT NULL DEFAULT false,
    "hue" INTEGER NOT NULL DEFAULT 200,
    "poiRef" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldNpc_key_key" ON "WorldNpc"("key");
