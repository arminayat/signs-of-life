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
export function ProjectsPage() {
  const query = useDashboard();
  const [open, setOpen] = useState(false);
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  const data = query.data;
  const latestDate = data.metrics
    .map((metric) => metric.date)
    .sort()
    .at(-1);
  const downloads = latestDate
    ? data.metrics
        .filter((metric) => metric.date === latestDate)
        .reduce((sum, metric) => sum + metric.downloads, 0)
    : null;
  return (
    <>
      <PageHeader
        title="A little closer to your products."
        description="New faces, fresh downloads, and everything worth knowing."
        action={
          <Button onPress={() => setOpen(true)}>
            <Plus size={16} />
            New project
          </Button>
        }
      />
      <div className="stat-grid">
        {[
          {
            label: "Your projects",
            value: data.projects.length,
            foot: `${data.projects.filter((project) => project.enabled).length} with notifications enabled`,
            icon: Boxes,
          },
          {
            label: "Recent new accounts",
            value: data.events.length || "—",
            foot: "Most recent 100 · up to 30 days",
            icon: Users,
          },
          {
            label: "Initial downloads",
            value: downloads ?? "—",
            foot: latestDate
              ? `Apple reporting date · ${latestDate}`
              : "Connect App Store to get started",
            icon: Download,
          },
        ].map(({ label, value, foot, icon: Icon }) => (
          <Card className="stat" key={label}>
            <div className="stat-label">
              {label}
              <Icon size={15} />
            </div>
            <span className="stat-value">{value}</span>
            <p className="stat-foot">{foot}</p>
          </Card>
        ))}
      </div>
      {data.projects.length > 0 &&
        (!data.sources.length || !data.projectDestinations.length) && (
          <SetupSteps data={data} />
        )}
      <div className="section-heading">
        <h2>
          Your projects{" "}
          <span className="muted ml-1 font-normal">{data.projects.length}</span>
        </h2>
        <span className="muted text-xs">A home for every product</span>
      </div>
      {data.projects.length ? (
        <div className="project-grid">
          {data.projects.map((project, index) => (
            <Link to={`/projects/${project.id}`} key={project.id}>
              <Card className="project-card">
                <div className="flex justify-between items-start">
                  <span
                    className={`product-icon ${["", "blue", "sand"][index % 3]}`}
                  >
                    {project.name.slice(0, 1).toUpperCase()}
                  </span>
                  <Status
                    value={
                      !project.enabled
                        ? "paused"
                        : data.sources.some(
                              (source) => source.projectId === project.id,
                            )
                          ? "active"
                          : "setup needed"
                    }
                  />
                </div>
                <h2 className="mt-5">{project.name}</h2>
                <p className="muted text-xs mt-1 min-h-5">
                  {project.description || "Your next bit of product clarity."}
                </p>
                <div className="project-meta">
                  <span>
                    {
                      data.sources.filter(
                        (source) => source.projectId === project.id,
                      ).length
                    }{" "}
                    sources ·{" "}
                    {
                      data.projectDestinations.filter(
                        (link) => link.projectId === project.id,
                      ).length
                    }{" "}
                    destinations
                  </span>
                  <ArrowUpRight size={15} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Boxes size={25} />}
          title="Every product starts somewhere."
          description="Create a project, connect your sources, and let the useful updates come to you."
          action={
            <Button onPress={() => setOpen(true)}>
              Create your first project
              <ArrowRight size={15} />
            </Button>
          }
        />
      )}
      <div className="section-heading">
        <h2>Latest updates</h2>
        <Link className="text-link" to="/activity">
          View activity
          <ArrowUpRight size={14} />
        </Link>
      </div>
      <ActivityList deliveries={data.deliveries.slice(0, 4)} />
      <ProjectDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
function SetupSteps({ data }: { data: Dashboard }) {
  return (
    <div className="setup-steps">
      {[
        { label: "Create a project", done: !!data.projects.length, href: "/" },
        {
          label: "Connect a source",
          done: !!data.sources.length,
          href: data.projects[0]
            ? `/projects/${data.projects[0].id}/sources`
            : "/",
        },
        {
          label: "Choose a destination",
          done: !!data.projectDestinations.length,
          href: "/destinations",
        },
      ].map((step, index) => (
        <Link
          to={step.href}
          key={step.label}
          className={`setup-step ${step.done ? "step-done" : ""}`}
        >
          <span className="step-dot">
            {step.done ? <Check size={12} /> : index + 1}
          </span>
          {step.label}
        </Link>
      ))}
    </div>
  );
}
function ProjectDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const action = useAction(),
    navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    action.mutate(
      {
        path: "/projects",
        body: {
          name: data.get("name"),
          description: data.get("description"),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
      {
        onSuccess: (result) => {
          onClose();
          navigate(`/projects/${result.id}/sources`);
        },
      },
    );
  }
  return (
    <Dialog
      title="Make room for your product."
      description="Give your project a name. You can connect sources and destinations next."
      open={open}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field
          label="Project name"
          name="name"
          placeholder="My next big thing"
          required
          maxLength={80}
        />
        <Field
          label="Description"
          name="description"
          placeholder="A little context for this product"
          maxLength={240}
        />
        <ErrorNotice error={action.error} />
        <div className="form-actions">
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button type="submit" isPending={action.isPending}>
            Create project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
