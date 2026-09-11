import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Checkbox } from "@heroui/react";
import {
  ArrowRight,
  ArrowUpRight,
  Cable,
  Check,
  Download,
  Plus,
  Users,
  Boxes,
  Send,
  Trash2,
} from "lucide-react";
import {
  useAction,
  useDashboard,
  when,
  type Dashboard,
  type Project,
} from "./data";
import {
  ConfirmDelete,
  Dialog,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeader,
  Status,
} from "./ui";
import { ActivityList } from "./other-pages";
import { SourceDialog } from "./source-dialog";
export function ProjectPage() {
  const { id } = useParams();
  const query = useDashboard();
  const action = useAction();
  const navigate = useNavigate();
  const [sourceOpen, setSourceOpen] = useState(false);
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  const data = query.data,
    project = data.projects.find((project) => project.id === id);
  if (!project)
    return (
      <EmptyState
        icon={<Boxes />}
        title="Project not found"
        description="This project may have been removed."
        action={<Link to="/">Back to projects</Link>}
      />
    );
  const sources = data.sources.filter((source) => source.projectId === id);
  return (
    <>
      <Link className="text-link mb-5" to="/">
        ← All projects
      </Link>
      <PageHeader
        title={project.name}
        description={
          project.description || "The latest signals from your product."
        }
        action={
          <Button
            variant="secondary"
            isPending={action.isPending}
            onPress={() =>
              action.mutate({
                path: `/projects/${id}`,
                method: "PATCH",
                body: { enabled: !project.enabled },
              })
            }
          >
            {project.enabled ? "Pause notifications" : "Resume notifications"}
          </Button>
        }
      />
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
      <div className="section-heading">
        <h2>Notification preferences</h2>
        <Status value={project.enabled ? "active" : "paused"} />
      </div>
      <ProjectSettings key={project.id} project={project} data={data} />
      <div className="section-heading">
        <h2>Recent deliveries</h2>
      </div>
      <ActivityList
        deliveries={data.deliveries
          .filter((delivery) => delivery.projectId === id)
          .slice(0, 10)}
      />
      <div className="mt-10 flex justify-end">
        <ConfirmDelete
          label="Delete project"
          description="Delete this project, its sources, collected history and pending deliveries? This cannot be undone."
          onConfirm={() =>
            action.mutate(
              { path: `/projects/${id}`, method: "DELETE" },
              { onSuccess: () => navigate("/") },
            )
          }
        />
      </div>
      <SourceDialog
        projectId={project.id}
        data={data}
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
      />
    </>
  );
}
function ProjectSettings({
  project,
  data,
}: {
  project: Project;
  data: Dashboard;
}) {
  const action = useAction();
  const [selected, setSelected] = useState(
    data.projectDestinations
      .filter((link) => link.projectId === project.id)
      .map((link) => link.destinationId),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    action.mutate({
      path: `/projects/${project.id}`,
      method: "PATCH",
      body: {
        name: fields.get("name"),
        description: fields.get("description"),
        timezone: fields.get("timezone"),
        dailyTime: fields.get("dailyTime"),
        destinationIds: selected,
      },
    });
  }
  return (
    <Card className="p-6">
      <form onSubmit={submit} className="form-stack">
        <div className="grid sm:grid-cols-2 gap-5">
          <Field
            name="name"
            label="Project name"
            defaultValue={project.name}
            required
          />
          <Field
            name="description"
            label="Description"
            defaultValue={project.description}
          />
          <Field
            name="dailyTime"
            label="Daily report time"
            type="time"
            defaultValue={project.dailyTime}
            required
          />
          <Field
            name="timezone"
            label="Timezone"
            defaultValue={project.timezone}
            required
            description="An IANA timezone, such as Europe/Berlin."
          />
        </div>
        <div>
          <p className="text-sm font-medium mb-3">Send notifications to</p>
          {data.destinations.length ? (
            <div className="flex flex-wrap gap-5">
              {data.destinations.map((destination) => (
                <Checkbox
                  key={destination.id}
                  isSelected={selected.includes(destination.id)}
                  onChange={(checked) =>
                    setSelected((ids) =>
                      checked
                        ? [...ids, destination.id]
                        : ids.filter((id) => id !== destination.id),
                    )
                  }
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Content>
                    {destination.name}
                    {!destination.verified && (
                      <span className="muted ml-1 text-xs">
                        (verification pending)
                      </span>
                    )}
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </div>
          ) : (
            <Notice>
              <Send size={15} />
              <Link to="/destinations" className="underline">
                Add a destination
              </Link>{" "}
              to start receiving notifications.
            </Notice>
          )}
        </div>
        <ErrorNotice error={action.error} />
        {action.isSuccess && (
          <p className="text-xs text-green-700" role="status">
            Preferences saved.
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" isPending={action.isPending}>
            Save preferences
          </Button>
        </div>
      </form>
    </Card>
  );
}
