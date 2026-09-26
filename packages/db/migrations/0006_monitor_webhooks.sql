CREATE TABLE "signs_of_life"."monitor_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"observations" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_inbox" ADD CONSTRAINT "monitor_inbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "signs_of_life"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_inbox" ADD CONSTRAINT "monitor_inbox_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "signs_of_life"."connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Repair projects created by earlier data migrations without their recurring job.
INSERT INTO "signs_of_life"."jobs" ("workspace_id", "key", "payload")
SELECT "workspace_id", 'daily:' || "id", jsonb_build_object('kind', 'daily', 'projectId', "id")
FROM "signs_of_life"."projects"
ON CONFLICT ("key") DO NOTHING;
