import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import {
  Bell,
  Boxes,
  Cable,
  ChartNoAxesCombined,
  ChevronLeft,
} from "lucide-react";
import { useDashboard } from "./data";
import { EmptyState, ErrorNotice, Loading, Status } from "./ui";
import { ProjectSources } from "./project-sources";
import { ProjectNotifications } from "./project-notifications";
import { ProjectOverview } from "./monitor-overview";
const views = [
  { path: "overview", label: "Overview", icon: ChartNoAxesCombined },
  { path: "sources", label: "Sources", icon: Cable },
  { path: "notifications", label: "Notifications", icon: Bell },
];
export function ProjectPage() {
  const { id } = useParams();
  const query = useDashboard(id);
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  const data = query.data;
  const project = data.projects.find((project) => project.id === id);
  if (!project)
    return (
      <EmptyState
        icon={<Boxes />}
        title="Project not found"
        description="This project may have been removed."
        action={<Link to="/">Back to projects</Link>}
      />
    );
  return (
    <>
      <aside className="project-sidebar">
        <Link className="text-link" to="/">
          <ChevronLeft size={14} />
          All projects
        </Link>
        <div className="project-sidebar-heading">
          <span className="product-icon">
            {project.name.slice(0, 1).toUpperCase()}
          </span>
          <h1>{project.name}</h1>
          {project.description && (
            <p className="muted text-xs">{project.description}</p>
          )}
          <Status value={project.enabled ? "active" : "paused"} />
        </div>
        <nav aria-label="Project navigation">
          {views.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/projects/${id}/${path}`}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <ErrorNotice error={query.error} />
      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route
          path="overview"
          element={<ProjectOverview key={id} project={project} data={data} />}
        />
        <Route
          path="sources"
          element={<ProjectSources key={id} project={project} data={data} />}
        />
        <Route
          path="notifications"
          element={
            <ProjectNotifications key={id} project={project} data={data} />
          }
        />
        <Route
          path="*"
          element={
            <EmptyState
              icon={<Boxes />}
              title="View not found"
              description="Choose a project view from the sidebar."
            />
          }
        />
      </Routes>
    </>
  );
}
