ALTER TABLE "advertisements"
  ADD COLUMN IF NOT EXISTS "playback_order" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "video_volume" integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "video_muted" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "advertisements_playback_order_idx"
  ON "advertisements" ("display_mode", "playback_order");
