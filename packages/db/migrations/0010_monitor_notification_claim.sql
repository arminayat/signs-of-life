ALTER TABLE "signs_of_life"."monitor_events" ADD COLUMN "notified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE signs_of_life.monitor_events e SET notified = true
WHERE EXISTS (SELECT 1 FROM signs_of_life.deliveries d WHERE d.key LIKE 'monitor:%:' || e.id::text);
