import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox } from "@heroui/react";
import { Send } from "lucide-react";
import { useAction, type Dashboard, type Project } from "./data";
import { ErrorNotice, Field, Notice } from "./ui";
export function ProjectSettings({
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
    <>
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
    </>
  );
}
