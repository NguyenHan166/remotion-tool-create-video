-- Render jobs are updated frequently by workers. Keep invalid progress and frame
-- counters out of the database even when a writer bypasses the application guard.
ALTER TABLE "RenderJob"
ADD CONSTRAINT "RenderJob_progress_check" CHECK ("progress" >= 0 AND "progress" <= 1),
ADD CONSTRAINT "RenderJob_attempt_check" CHECK ("attempt" >= 0 AND "maxAttempts" > 0 AND "attempt" <= "maxAttempts"),
ADD CONSTRAINT "RenderJob_renderedFrames_check" CHECK ("renderedFrames" IS NULL OR "renderedFrames" >= 0),
ADD CONSTRAINT "RenderJob_encodedFrames_check" CHECK ("encodedFrames" IS NULL OR "encodedFrames" >= 0),
ADD CONSTRAINT "RenderJob_totalFrames_check" CHECK ("totalFrames" IS NULL OR "totalFrames" > 0),
ADD CONSTRAINT "RenderJob_renderedFrames_total_check" CHECK ("renderedFrames" IS NULL OR "totalFrames" IS NULL OR "renderedFrames" <= "totalFrames"),
ADD CONSTRAINT "RenderJob_encodedFrames_total_check" CHECK ("encodedFrames" IS NULL OR "totalFrames" IS NULL OR "encodedFrames" <= "totalFrames");

ALTER TABLE "RenderOutput"
ADD CONSTRAINT "RenderOutput_sizeBytes_check" CHECK ("sizeBytes" >= 0),
ADD CONSTRAINT "RenderOutput_width_check" CHECK ("width" IS NULL OR "width" > 0),
ADD CONSTRAINT "RenderOutput_height_check" CHECK ("height" IS NULL OR "height" > 0),
ADD CONSTRAINT "RenderOutput_durationMs_check" CHECK ("durationMs" IS NULL OR "durationMs" >= 0);

-- Supports stale-worker recovery without scanning all active jobs.
CREATE INDEX "RenderJob_status_heartbeatAt_idx" ON "RenderJob"("status", "heartbeatAt");
