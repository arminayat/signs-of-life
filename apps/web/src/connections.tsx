import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button, Card } from "@heroui/react";
import { Apple, ArrowUpRight, Cable, Plus, Zap } from "lucide-react";
import { useAction, useConfig, when, type Dashboard } from "./data";
import { Dialog, EmptyState, ErrorNotice, Field, Status } from "./ui";
import { catalogQuery } from "./catalog";
export function ProjectConnections({
  projectId,
  data,
  onConnected,
}: {
  projectId: string;
  data: Dashboard;
  onConnected: (id: string) => void;
}) {
  const connections = data.connections.filter(
    (connection) =>
      connection.projectId === projectId ||
      (!connection.projectId &&
        data.sources.some(
          (source) =>
            source.projectId === projectId &&
            source.connectionId === connection.id,
        )),
  );
  const config = useConfig(),
    action = useAction();
  const [appleOpen, setAppleOpen] = useState(false),
    [reconnectId, setReconnectId] = useState<string>();
  function connectSupabase(connectionId?: string) {
    action.mutate(
      {
        path: "/connections/supabase/start",
        body: { connectionId, projectId },
      },
      { onSuccess: (result) => location.assign(String(result.url)) },
    );
  }
  return (
    <>
      <ErrorNotice error={action.error} />
      <div className="integration-grid mt-5">
        <Card className="integration-card">
          <div className="flex justify-between">
            <span className="integration-logo text-[#43a775]">
              <Zap size={27} />
            </span>
            <span className="status">Account alerts</span>
          </div>
          <h2>Supabase</h2>
          <p className="muted text-sm">
            A heads-up when a new account joins your product. Sign in, choose a
            project, and you’re connected.
          </p>
          <p className="muted text-xs">
            Read-only · About every minute · No database changes
          </p>
          <Button
            className="mt-auto"
            variant="secondary"
            isDisabled={!config.data?.sources.supabase}
            isPending={action.isPending}
            onPress={() => connectSupabase()}
          >
            {config.data?.sources.supabase
              ? "Connect Supabase"
              : "Awaiting operator setup"}
            <ArrowUpRight size={15} />
          </Button>
        </Card>
        <Card className="integration-card">
          <div className="flex justify-between">
            <span className="integration-logo">
              <Apple size={27} />
            </span>
            <span className="status">Download reports</span>
          </div>
          <h2>App Store Connect</h2>
          <p className="muted text-sm">
            Keep up with your app’s growth. Get a daily breakdown of initial
            downloads and redownloads.
          </p>
          <p className="muted text-xs">
            Sales and Trends · Reporting key required
          </p>
          <Button
            className="mt-auto"
            variant="secondary"
            onPress={() => {
              setReconnectId(undefined);
              setAppleOpen(true);
            }}
          >
            Connect App Store
            <Plus size={15} />
          </Button>
        </Card>
      </div>
      <div className="section-heading">
        <h2>Project connections</h2>
        <span className="muted text-xs">
          {connections.length} connected accounts
        </span>
      </div>
      {connections.length ? (
        <Card className="overflow-hidden">
          {connections.map((connection) => (
            <div className="activity-row connection-row" key={connection.id}>
              <span className="activity-icon">
                {connection.kind === "supabase" ? (
                  <Zap size={18} />
                ) : (
                  <Apple size={18} />
                )}
              </span>
              <div className="connection-details">
                <ConnectionName connection={connection} />
                {!connection.projectId && (
                  <p className="muted text-xs">
                    Legacy shared connection. Reconnecting or disconnecting
                    affects its other projects. Create a new connection here to
                    replace it.
                  </p>
                )}
                <p className="muted text-xs">
                  Last collection: {when(connection.lastSuccessAt)}
                </p>
                {connection.lastError && (
                  <p className="text-xs text-red-600 mt-1">
                    {connection.lastError.replaceAll("_", " ")}
                  </p>
                )}
              </div>
              <div className="connection-actions">
                <Status value={connection.status} />
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    if (connection.kind === "supabase")
                      connectSupabase(connection.id);
                    else {
                      setReconnectId(connection.id);
                      setAppleOpen(true);
                    }
                  }}
                >
                  Reconnect
                </Button>
                {connection.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      if (
                        confirm(
                          "Disconnect this account? Its credentials will be removed and collection will stop.",
                        )
                      )
                        action.mutate({
                          path: `/connections/${connection.id}`,
                          method: "DELETE",
                        });
                    }}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<Cable />}
          title="Your first connection is one step away."
          description="Choose a provider above, then add a source to this project."
        />
      )}
      <AppleDialog
        key={reconnectId ?? "new"}
        projectId={projectId}
        open={appleOpen}
        connectionId={reconnectId}
        onClose={() => setAppleOpen(false)}
        onConnected={(id) => {
          setAppleOpen(false);
          if (!reconnectId) onConnected(id);
        }}
      />
    </>
  );
}
function ConnectionName({
  connection,
}: {
  connection: Dashboard["connections"][number];
}) {
  const catalog = useQuery({
    ...catalogQuery(connection.id),
    enabled: connection.kind === "supabase" && connection.active,
  });
  if (connection.kind === "supabase" && catalog.data?.items.length) {
    return (
      <div className="grid gap-1">
        {catalog.data.items.map((project) => (
          <p className="font-medium" key={project.id}>
            {project.organizationName && (
              <span className="muted font-normal">
                {project.organizationName} /{" "}
              </span>
            )}
            {project.name}
          </p>
        ))}
      </div>
    );
  }
  return <p className="font-medium">{connection.name}</p>;
}

function AppleDialog({
  onConnected,
  projectId,
  open,
  onClose,
  connectionId,
}: {
  projectId: string;
  onConnected: (id: string) => void;
  open: boolean;
  onClose: () => void;
  connectionId?: string;
}) {
  const action = useAction();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    action.mutate(
      {
        path: "/connections/apple",
        body: {
          connectionId,
          projectId,
          name: data.get("name"),
          issuerId: data.get("issuerId"),
          keyId: data.get("keyId"),
          vendorNumber: data.get("vendorNumber"),
          privateKey: data.get("privateKey"),
        },
      },
      { onSuccess: (result) => onConnected(String(result.id)) },
    );
  }
  return (
    <Dialog
      title={
        connectionId
          ? "Reconnect App Store Connect"
          : "Connect App Store Connect"
      }
      description="Use a team API key with Sales and Reports access. Your private key is encrypted on the server."
      open={open}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field
          name="name"
          label="Connection name"
          defaultValue="App Store Connect"
          required
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            name="issuerId"
            label="Issuer ID"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            required
          />
          <Field
            name="keyId"
            label="Key ID"
            placeholder="ABCDEFGHIJ"
            required
          />
        </div>
        <Field
          name="vendorNumber"
          label="Vendor number"
          placeholder="12345678"
          required
          description="Find this in App Store Connect → Payments and Financial Reports."
        />
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="apple-private-key">
            Private key (.p8)
          </label>
          <textarea
            id="apple-private-key"
            name="privateKey"
            required
            rows={5}
            className="native-select !h-auto py-3 font-mono text-xs"
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
        </div>
        <ErrorNotice error={action.error} />
        <div className="form-actions">
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button type="submit" isPending={action.isPending}>
            Verify and connect
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
