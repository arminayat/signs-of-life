import { useState } from "react";
import { Button, Card } from "@heroui/react";
import { ArrowRight, Cable, Plus, Trash2 } from "lucide-react";
import { useAction, when, type Dashboard, type Project } from "./data";
import { EmptyState, ErrorNotice, Status } from "./ui";
import { SourceDialog } from "./source-dialog";
export function ProjectSources({
  project,
  data,
}: {
  project: Project;
  data: Dashboard;
}) {
  const action = useAction();
  const [sourceOpen, setSourceOpen] = useState(false);
  const sources = data.sources.filter(
    (source) => source.projectId === project.id,
  );
  return (
    <>
      <ErrorNotice error={action.error} />
      <div className="section-heading">
        <h2>Connected sources</h2>
        <Button size="sm" onPress={() => setSourceOpen(true)}>
          <Plus size={14} />
          Add source
        </Button>
      </div>
      {sources.length ? (
        <Card className="overflow-hidden">
          {sources.map((source) => (
            <div className="activity-row items-center" key={source.id}>
              <span className="activity-icon">
                <Cable size={16} />
              </span>
              <div className="flex-1">
                <p className="font-medium">{source.name}</p>
                <p className="muted text-xs">
                  {source.kind === "supabase"
                    ? "Supabase accounts"
                    : "App Store downloads"}{" "}
                  · {when(source.lastSuccessAt)}
                </p>
                {source.lastError && (
                  <p className="text-xs text-red-600 mt-1">
                    {source.lastError.replaceAll("_", " ")}
                  </p>
                )}
              </div>
              <Status
                value={
                  source.lastError
                    ? "error"
                    : source.lastSuccessAt
                      ? "connected"
                      : "waiting"
                }
              />
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={`Remove ${source.name}`}
                onPress={() => {
                  if (confirm("Remove this source and its collected history?"))
                    action.mutate({
                      path: `/sources/${source.id}`,
                      method: "DELETE",
                    });
                }}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<Cable />}
          title="Bring your first source."
          description="Connect Supabase for account alerts or App Store Connect for daily download reports."
          action={
            <Button onPress={() => setSourceOpen(true)}>
              Add a source
              <ArrowRight size={15} />
            </Button>
          }
        />
      )}
      <SourceDialog
        projectId={project.id}
        data={data}
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
      />
    </>
  );
}
