CREATE TABLE "signs_of_life"."monitor_dashboards" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"views" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signs_of_life"."monitor_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"environment" text NOT NULL,
	"amount" text,
	"currency" text,
	"anonymous" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signs_of_life"."monitor_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"key" text NOT NULL,
	"query" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signs_of_life"."monitor_observations" (
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "monitor_observations_source_id_external_id_pk" PRIMARY KEY("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "signs_of_life"."monitor_states" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"notify_after" timestamp with time zone NOT NULL,
	"history_from" timestamp with time zone NOT NULL,
	"history_until" timestamp with time zone NOT NULL,
	"history_cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"history_done" boolean DEFAULT false NOT NULL,
	"live_from" timestamp with time zone NOT NULL,
	"live_until" timestamp with time zone,
	"live_cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"coverage" text,
	"notifications" jsonb DEFAULT '["signup","payment"]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signs_of_life"."provider_budgets" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"available_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_dashboards" ADD CONSTRAINT "monitor_dashboards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "signs_of_life"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_events" ADD CONSTRAINT "monitor_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "signs_of_life"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_events" ADD CONSTRAINT "monitor_events_workspace_id_project_id_projects_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "signs_of_life"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_metrics" ADD CONSTRAINT "monitor_metrics_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "signs_of_life"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_observations" ADD CONSTRAINT "monitor_observations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "signs_of_life"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_observations" ADD CONSTRAINT "monitor_observations_event_id_monitor_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "signs_of_life"."monitor_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_states" ADD CONSTRAINT "monitor_states_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "signs_of_life"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."provider_budgets" ADD CONSTRAINT "provider_budgets_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "signs_of_life"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_event_identity" ON "signs_of_life"."monitor_events" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "monitor_event_retention" ON "signs_of_life"."monitor_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_metric_query" ON "signs_of_life"."monitor_metrics" USING btree ("source_id","key");