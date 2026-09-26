CREATE TABLE "signs_of_life"."monitor_series" (
	"source_id" uuid NOT NULL,
	"key" text NOT NULL,
	"date" text NOT NULL,
	"series" text DEFAULT '' NOT NULL,
	"value" text,
	"metadata" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "monitor_series_source_id_key_date_series_pk" PRIMARY KEY("source_id","key","date","series")
);
--> statement-breakpoint
ALTER TABLE "signs_of_life"."monitor_series" ADD CONSTRAINT "monitor_series_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "signs_of_life"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitor_series_retention" ON "signs_of_life"."monitor_series" USING btree ("date");