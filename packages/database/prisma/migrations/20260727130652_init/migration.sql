-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'FONT', 'LOGO', 'SUBTITLE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('QUEUED', 'PREPARING', 'BUNDLING', 'RENDERING', 'ENCODING', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutputKind" AS ENUM ('VIDEO', 'THUMBNAIL', 'LOG');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('IDLE', 'BUSY', 'STOPPING', 'UNHEALTHY');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "draftDocument" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRevision" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "templateId" VARCHAR(100) NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PROCESSING',
    "originalName" VARCHAR(500) NOT NULL,
    "storedName" VARCHAR(200) NOT NULL,
    "relativePath" VARCHAR(1000) NOT NULL,
    "mimeType" VARCHAR(200) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" BIGINT,
    "hasAudio" BOOLEAN,
    "errorCode" VARCHAR(100),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAsset" (
    "projectId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAsset_pkey" PRIMARY KEY ("projectId","assetId")
);

-- CreateTable
CREATE TABLE "RevisionAsset" (
    "revisionId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionAsset_pkey" PRIMARY KEY ("revisionId","assetId")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "status" "RenderStatus" NOT NULL DEFAULT 'QUEUED',
    "preset" VARCHAR(100) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "renderedFrames" INTEGER,
    "encodedFrames" INTEGER,
    "totalFrames" INTEGER,
    "stageMessage" VARCHAR(500),
    "workerId" VARCHAR(200),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "errorCode" VARCHAR(100),
    "errorMessage" TEXT,
    "technicalError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderOutput" (
    "id" UUID NOT NULL,
    "renderJobId" UUID NOT NULL,
    "kind" "OutputKind" NOT NULL,
    "relativePath" VARCHAR(1000) NOT NULL,
    "fileName" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(200) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" BIGINT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "workerId" VARCHAR(200) NOT NULL,
    "appVersion" VARCHAR(100) NOT NULL,
    "remotionVersion" VARCHAR(100) NOT NULL,
    "status" "WorkerStatus" NOT NULL,
    "currentJobId" UUID,
    "ffmpegAvailable" BOOLEAN NOT NULL,
    "browserAvailable" BOOLEAN NOT NULL,
    "storageWritable" BOOLEAN NOT NULL,
    "details" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" VARCHAR(200) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "key" VARCHAR(200) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "responseCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Project_status_updatedAt_idx" ON "Project"("status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ProjectRevision_projectId_revisionNumber_idx" ON "ProjectRevision"("projectId", "revisionNumber" DESC);

-- CreateIndex
CREATE INDEX "ProjectRevision_contentHash_idx" ON "ProjectRevision"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRevision_projectId_revisionNumber_key" ON "ProjectRevision"("projectId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storedName_key" ON "Asset"("storedName");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_relativePath_key" ON "Asset"("relativePath");

-- CreateIndex
CREATE INDEX "Asset_status_createdAt_idx" ON "Asset"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Asset_kind_createdAt_idx" ON "Asset"("kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Asset_sha256_idx" ON "Asset"("sha256");

-- CreateIndex
CREATE INDEX "ProjectAsset_assetId_idx" ON "ProjectAsset"("assetId");

-- CreateIndex
CREATE INDEX "RevisionAsset_assetId_idx" ON "RevisionAsset"("assetId");

-- CreateIndex
CREATE INDEX "RenderJob_status_availableAt_priority_createdAt_idx" ON "RenderJob"("status", "availableAt", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "RenderJob_projectId_createdAt_idx" ON "RenderJob"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RenderJob_revisionId_idx" ON "RenderJob"("revisionId");

-- CreateIndex
CREATE INDEX "RenderJob_workerId_status_idx" ON "RenderJob"("workerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RenderOutput_relativePath_key" ON "RenderOutput"("relativePath");

-- CreateIndex
CREATE INDEX "RenderOutput_renderJobId_kind_idx" ON "RenderOutput"("renderJobId", "kind");

-- CreateIndex
CREATE INDEX "WorkerHeartbeat_lastSeenAt_idx" ON "WorkerHeartbeat"("lastSeenAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAsset" ADD CONSTRAINT "ProjectAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAsset" ADD CONSTRAINT "ProjectAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionAsset" ADD CONSTRAINT "RevisionAsset_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionAsset" ADD CONSTRAINT "RevisionAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderOutput" ADD CONSTRAINT "RenderOutput_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
