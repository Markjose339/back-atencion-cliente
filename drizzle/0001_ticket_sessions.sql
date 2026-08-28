CREATE TABLE IF NOT EXISTS "ticket_sessions" (
  "id" varchar(24) PRIMARY KEY NOT NULL,
  "branch_id" varchar(24) NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "business_date" date NOT NULL,
  "session_number" integer NOT NULL,
  "regular_counter" integer DEFAULT 0 NOT NULL,
  "preferential_counter" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  "closed_by_user_id" varchar(24) REFERENCES "users"("id") ON DELETE SET NULL,
  "close_reason" varchar(100)
);

CREATE INDEX IF NOT EXISTS "ticket_sessions_branch_active_idx"
  ON "ticket_sessions" ("branch_id", "is_active");
CREATE INDEX IF NOT EXISTS "ticket_sessions_branch_date_idx"
  ON "ticket_sessions" ("branch_id", "business_date");

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "sequence_number" integer;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "ticket_session_id" varchar(24)
  REFERENCES "ticket_sessions"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "tickets_session_sequence_idx"
  ON "tickets" ("ticket_session_id", "sequence_number");
