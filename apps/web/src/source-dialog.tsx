import { isMonitorKind } from "../../../packages/core/src/monitoring";
import {
  providers,
  providerDefinition,
} from "../../../packages/core/src/provider-registry";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { useAction, type Dashboard } from "./data";
import { Dialog, ErrorNotice, Field, Notice, SelectField } from "./ui";
import { catalogQuery } from "./catalog";
export function SourceDialog({
  projectId,
  initialConnectionId = "",
  data,
  open,
  onClose,
}: {
  projectId: string;
  initialConnectionId?: string;
  data: Dashboard;
  open: boolean;
  onClose: () => void;
}) {
  const connections = data.connections.filter(
    (connection) => connection.active && connection.projectId === projectId,
  );
  const [provider, setProvider] = useState(
    connections.find((c) => c.id === initialConnectionId)?.kind ||
      connections[0]?.kind ||
      "supabase",
  );
  const [connectionId, setConnectionId] = useState(initialConnectionId),
    [externalId, setExternalId] = useState("");
  const action = useAction();
  const connection = connections.find(
    (connection) => connection.id === connectionId,
  );
  const catalog = useQuery({
    ...catalogQuery(connectionId),
    enabled: open && !!connectionId,
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
      description="Choose a provider, connection, and the resource you want to monitor."
      open={open}
      onClose={onClose}
    >
      {!connections.length ? (
        <Notice>
          Connect a provider in this project’s Sources view first.
        </Notice>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <SelectField
            name="provider"
            label="Provider"
            value={provider}
            onChange={(v) => {
              setProvider(v as typeof provider);
              setConnectionId("");
              setExternalId("");
            }}
          >
            {[
              { id: "supabase", name: "Supabase" },
              { id: "apple", name: "App Store Connect" },
              ...providers,
            ]
              .filter((p) => connections.some((c) => c.kind === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </SelectField>
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
            {connections
              .filter((c) => c.kind === provider)
              .map((connection) => (
                <ConnectionOption
                  connection={connection}
                  open={open}
                  key={connection.id}
                />
              ))}
          </SelectField>
          {catalog.isFetching && (
            <p className="muted text-sm" role="status">
              Finding accessible resources…
            </p>
          )}
          <ErrorNotice error={catalog.error} />
          {catalog.data?.items.length ? (
            <SelectField
              name="externalId"
              label={
                connection && isMonitorKind(connection.kind)
                  ? providerDefinition(connection.kind).resource
                  : connection?.kind === "apple"
                    ? "App"
                    : "Supabase project"
              }
              value={externalId}
              onChange={setExternalId}
            >
              <option value="">Choose a source</option>
              {catalog.data.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.environment ? ` · ${item.environment}` : ""}
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
              No accessible resources were found for this connection.
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

function ConnectionOption({
  connection,
  open,
}: {
  connection: Dashboard["connections"][number];
  open: boolean;
}) {
  const catalog = useQuery({
    ...catalogQuery(connection.id),
    enabled: open && connection.kind === "supabase",
  });
  const label =
    connection.kind === "supabase"
      ? [
          ...new Set(
            catalog.data?.items
              .map((item) => item.organizationName)
              .filter(Boolean),
          ),
        ].join(", ")
      : undefined;
  return <option value={connection.id}>{label || connection.name}</option>;
}
