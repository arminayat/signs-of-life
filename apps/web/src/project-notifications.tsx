import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import { Settings2 } from "lucide-react";
import { useAction, type Dashboard, type Project } from "./data";
import { ConfirmDelete, Dialog, ErrorNotice, PageHeader, Status } from "./ui";
import { ActivityList } from "./other-pages";
import { ProjectSettings } from "./project-settings";
export function ProjectNotifications({
  project,
  data,
}: {
  project: Project;
  data: Dashboard;
}) {
  const [open, setOpen] = useState(false);
  const action = useAction();
  const navigate = useNavigate();
  const destinationIds = data.projectDestinations
    .filter((link) => link.projectId === project.id)
    .map((link) => link.destinationId);
  const destinations = data.destinations.filter((destination) =>
    destinationIds.includes(destination.id),
  );
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Choose where updates go and keep an eye on recent deliveries."
        action={
          <Button variant="secondary" onPress={() => setOpen(true)}>
            <Settings2 size={16} />
            Notification preferences
          </Button>
        }
      />
      <ErrorNotice error={action.error} />
      <Card className="notification-summary">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2>Your updates</h2>
            <Status value={project.enabled ? "active" : "paused"} />
          </div>
          <p className="muted text-sm">
            Daily reports at {project.dailyTime} · {project.timezone}
          </p>
          <p className="muted text-xs mt-2">
            {destinations.length
              ? destinations
                  .map(
                    (destination) =>
                      `${destination.name}${!destination.verified ? " (verification pending)" : !destination.enabled ? " (disabled)" : ""}`,
                  )
                  .join(" · ")
              : "No destinations selected. Set your preferences to receive updates."}
          </p>
        </div>
        <Button
          variant="secondary"
          isPending={action.isPending}
          onPress={() =>
            action.mutate({
              path: `/projects/${project.id}`,
              method: "PATCH",
              body: { enabled: !project.enabled },
            })
          }
        >
          {project.enabled ? "Pause notifications" : "Resume notifications"}
        </Button>
      </Card>
      <div className="section-heading">
        <h2>Recent deliveries</h2>
        <span className="muted text-xs">Latest 100 · up to 30 days</span>
      </div>
      <ActivityList
        deliveries={data.deliveries.filter(
          (delivery) => delivery.projectId === project.id,
        )}
      />
      <div className="mt-10 flex justify-end">
        <ConfirmDelete
          label="Delete project"
          description="Delete this project, its sources, collected history and pending deliveries? This cannot be undone."
          pending={action.isPending}
          onConfirm={() =>
            action.mutate(
              { path: `/projects/${project.id}`, method: "DELETE" },
              { onSuccess: () => navigate("/") },
            )
          }
        />
      </div>
      <Dialog
        title="Notification preferences"
        open={open}
        onClose={() => setOpen(false)}
      >
        {open && <ProjectSettings project={project} data={data} />}
      </Dialog>
    </>
  );
}
