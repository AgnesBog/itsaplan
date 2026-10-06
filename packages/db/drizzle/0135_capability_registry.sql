CREATE TABLE "capability" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"execution_type" text NOT NULL,
	"brand_restriction_id" text,
	"execution_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timeout_seconds" integer DEFAULT 3600 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "capability_team_slug_idx" ON "capability" USING btree ("team_id","slug");
--> statement-breakpoint
CREATE INDEX "capability_team_type_idx" ON "capability" USING btree ("team_id","execution_type");
--> statement-breakpoint
CREATE TABLE "capability_invocation" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"team_id" integer NOT NULL,
	"issue_id" integer,
	"brand_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"exit_code" integer,
	"message" text,
	"review_url" text,
	"input_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"lease_expires_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_invocation_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "capability_invocation_capability_id_capability_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capability"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "capability_invocation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "capability_invocation_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "capability_inv_team_status_idx" ON "capability_invocation" USING btree ("team_id","status");
--> statement-breakpoint
CREATE INDEX "capability_inv_issue_idx" ON "capability_invocation" USING btree ("issue_id");
--> statement-breakpoint
CREATE INDEX "capability_inv_lease_idx" ON "capability_invocation" USING btree ("status","lease_expires_at");
