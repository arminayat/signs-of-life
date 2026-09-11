import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@heroui/react";
import { api, useAction, type Dashboard } from "./data";
import { Dialog, ErrorNotice, Field, Notice, SelectField } from "./ui";
export function SourceDialog({
  projectId,
  data,
  open,
  onClose,
}: {
  projectId: string;
  data: Dashboard;
  open: boolean;
  onClose: () => void;
}) {
  const connections = data.connections.filter(
    (connection) => connection.active,
  );
  const [connectionId, setConnectionId] = useState(""),
    [externalId, setExternalId] = useState("");
  const action = useAction();
  const connection = connections.find(
    (connection) => connection.id === connectionId,
  );
  const catalog = useQuery({
    queryKey: ["catalog", connectionId],
    queryFn: () =>
      api<{ items: { id: string; name: string }[]; manualAppId?: boolean }>(
        `/connections/${connectionId}/catalog`,
      ),
    enabled: open && !!connectionId,
    staleTime: 60_000,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const id = String(fields.get("externalId"));
    const selected = catalog.data?.items.find((item) => item.id === id);
    action.mutate(
      {
        path: "/sources",
        body: {
          projectId,
          connectionId,
          externalId: id,
          name: selected?.name ?? fields.get("name"),
        },
      },
      { onSuccess: onClose },
    );
  }
  return (
    <Dialog
      title="Add a source"
      description="Choose the app or database project you want to monitor."
      open={open}
      onClose={onClose}
    >
      {!connections.length ? (
        <Notice>
          Add a connection first.{" "}
          <Link className="underline" to="/connections">
            Go to Connections →
          </Link>
        </Notice>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <SelectField
            name="connectionId"
            label="Connection"
            value={connectionId}
            onChange={(value) => {
              setConnectionId(value);
              setExternalId("");
            }}
          >
            <option value="">Choose a connection</option>
            {connections.map((connection) => (
              <option value={connection.id} key={connection.id}>
                {connection.name} · {connection.kind}
              </option>
            ))}
          </SelectField>
          {catalog.isFetching && (
            <p className="muted text-sm" role="status">
              Finding available apps and projects…
            </p>
          )}
          <ErrorNotice error={catalog.error} />
          {catalog.data?.items.length ? (
            <SelectField
              name="externalId"
              label={connection?.kind === "apple" ? "App" : "Supabase project"}
              value={externalId}
              onChange={setExternalId}
            >
              <option value="">Choose a source</option>
              {catalog.data.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          ) : connection?.kind === "apple" &&
            !catalog.isFetching &&
            !catalog.error ? (
            <>
              <Notice>
                No apps appeared in recent reports. You can enter the numeric
                Apple app ID instead.
              </Notice>
              <Field
                name="externalId"
                label="Apple app ID"
                required
                placeholder="1234567890"
              />
              <Field name="name" label="App name" required />
            </>
          ) : catalog.data ? (
            <Notice>
              No accessible projects were found for this connection.
            </Notice>
          ) : null}
          {connection?.kind === "supabase" && (
            <Notice>
              Monitoring starts now, with no historical alerts. Anonymous
              accounts are excluded. Accounts deleted between polls can be
              missed.
            </Notice>
          )}
          <ErrorNotice error={action.error} />
          <div className="form-actions">
            <Button variant="secondary" onPress={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              isPending={action.isPending}
              isDisabled={
                !connectionId || catalog.isFetching || !!catalog.error
              }
            >
              Add source
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
