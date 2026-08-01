-- CreateTable
CREATE TABLE "WorldBlock" (
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "z" INTEGER NOT NULL,
    "blockId" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,

    PRIMARY KEY ("x", "y", "z")
);

-- CreateTable
CREATE TABLE "WorldSign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "z" REAL NOT NULL,
    "face" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "size" REAL NOT NULL DEFAULT 0.9,
    "color" TEXT,
    "bg" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorldPoi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "z" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sublabel" TEXT,
    "panel" TEXT NOT NULL,
    "refId" TEXT,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorldRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roomId" TEXT,
    "minX" INTEGER NOT NULL,
    "minY" INTEGER NOT NULL,
    "minZ" INTEGER NOT NULL,
    "maxX" INTEGER NOT NULL,
    "maxY" INTEGER NOT NULL,
    "maxZ" INTEGER NOT NULL,
    "lair" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "WorldMeta" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'world',
    "spawnX" REAL NOT NULL DEFAULT 38,
    "spawnY" REAL NOT NULL DEFAULT 1,
    "spawnZ" REAL NOT NULL DEFAULT 36,
    "spawnYaw" REAL NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WorldBlock_updatedAt_idx" ON "WorldBlock"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldPoi_x_y_z_key" ON "WorldPoi"("x", "y", "z");

-- CreateIndex
CREATE UNIQUE INDEX "WorldRegion_key_key" ON "WorldRegion"("key");
