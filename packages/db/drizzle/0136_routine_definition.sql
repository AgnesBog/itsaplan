CREATE TABLE "routine_definition" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"slug" text,
	"cadence_type" text NOT NULL,
	"cadence_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"execution_policy" text DEFAULT 'human_triggered' NOT NULL,
	"capability_id" text,
	"default_input_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issue_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_initiative_id" integer,
	"target_column_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"active_issue_id" integer,
	"next_due_date" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"last_evaluated_at" timestamp with time zone,
	"brand_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_definition_cadence_type_check" CHECK ("cadence_type" IN ('calendar', 'completion_relative', 'cycle', 'manual')),
	CONSTRAINT "routine_definition_execution_policy_check" CHECK ("execution_policy" IN ('human_task', 'human_triggered', 'automated_capability')),
	CONSTRAINT "routine_definition_status_check" CHECK ("status" IN ('active', 'paused', 'archived')),
	CONSTRAINT "routine_definition_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "routine_definition_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "routine_definition_capability_id_capability_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capability"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "routine_definition_target_initiative_id_initiative_id_fk" FOREIGN KEY ("target_initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "routine_definition_target_column_id_project_column_id_fk" FOREIGN KEY ("target_column_id") REFERENCES "public"."project_column"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "routine_definition_active_issue_id_issue_id_fk" FOREIGN KEY ("active_issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "routine_id" integer;
--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "routine_override_payload" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_routine_id_routine_definition_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routine_definition"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "routine_def_team_idx" ON "routine_definition" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "routine_def_project_idx" ON "routine_definition" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "routine_def_due_idx" ON "routine_definition" USING btree ("status","next_due_date");
--> statement-breakpoint
CREATE INDEX "routine_def_active_issue_idx" ON "routine_definition" USING btree ("active_issue_id");
--> statement-breakpoint
CREATE INDEX "issue_routine_idx" ON "issue" USING btree ("routine_id") WHERE ("routine_id" IS NOT NULL);
