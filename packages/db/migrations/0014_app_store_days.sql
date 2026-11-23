CREATE TABLE "signs_of_life"."app_store_days" (
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"date" text NOT NULL,
	"sales" jsonb,
	"subscriptions" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_store_days_source_id_date_pk" PRIMARY KEY("source_id","date")
);
--> statement-breakpoint
ALTER TABLE "signs_of_life"."app_store_days" ADD CONSTRAINT "app_store_days_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "signs_of_life"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signs_of_life"."app_store_days" ADD CONSTRAINT "app_store_days_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "signs_of_life"."sources"("id") ON DELETE cascade ON UPDATE no action;