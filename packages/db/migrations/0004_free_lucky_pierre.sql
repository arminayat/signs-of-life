DROP INDEX "signs_of_life"."connections_external";--> statement-breakpoint
ALTER TABLE "signs_of_life"."connections" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "signs_of_life"."connections" ADD CONSTRAINT "connections_workspace_id_project_id_projects_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "signs_of_life"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_external" ON "signs_of_life"."connections" USING btree ("workspace_id","project_id","kind","external_id");--> statement-breakpoint
-- Existing single-project connections keep their credentials and IDs.
UPDATE signs_of_life.connections c
SET project_id = linked.project_id
FROM (
  SELECT connection_id, min(project_id::text)::uuid AS project_id
  FROM signs_of_life.sources GROUP BY connection_id
  HAVING count(DISTINCT project_id) = 1
) linked WHERE c.id = linked.connection_id;
--> statement-breakpoint
-- Preserve unattached credentials in a visible project instead of hiding them.
DO $$
DECLARE item record; target uuid;
BEGIN
  FOR item IN SELECT c.id, c.workspace_id, c.name FROM signs_of_life.connections c
    WHERE c.project_id IS NULL AND NOT EXISTS
      (SELECT 1 FROM signs_of_life.sources s WHERE s.connection_id = c.id)
  LOOP
    target := gen_random_uuid();
    INSERT INTO signs_of_life.projects (id, workspace_id, name, description)
      VALUES (target, item.workspace_id, item.name, 'Imported connection. Add a source to start monitoring.');
    UPDATE signs_of_life.connections SET project_id = target WHERE id = item.id;
  END LOOP;
END $$;
