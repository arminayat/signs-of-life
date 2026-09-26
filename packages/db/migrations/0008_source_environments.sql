DROP INDEX "signs_of_life"."source_per_project";--> statement-breakpoint
ALTER TABLE "signs_of_life"."sources" ADD COLUMN "environment" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
UPDATE "signs_of_life"."sources" AS s SET "environment" = m."environment" FROM "signs_of_life"."monitor_states" AS m WHERE s."id" = m."source_id";
--> statement-breakpoint
CREATE UNIQUE INDEX "source_per_project" ON "signs_of_life"."sources" USING btree ("project_id","kind","external_id","environment");