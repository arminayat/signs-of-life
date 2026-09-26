import { useState, type FormEvent } from "react";
import { Button } from "@heroui/react";
import {
  providers,
  providerDefinition,
} from "../../../packages/core/src/provider-registry";
import type { MonitorKind } from "../../../packages/core/src/monitoring";
import { Dialog, ErrorNotice, Field, Notice, SelectField } from "./ui";
import { useAction, useConfig } from "./data";
export function ProviderPicker({
  onSelect,
}: {
  onSelect: (kind: MonitorKind) => void;
}) {
  const [provider, setProvider] = useState<MonitorKind>("stripe");
  return (
    <div className="monitor-provider-picker">
      <SelectField
        name="provider"
        label="Provider"
        value={provider}
        onChange={(v) => setProvider(v as MonitorKind)}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </SelectField>
      <Button variant="secondary" onPress={() => onSelect(provider)}>
        Connect {providerDefinition(provider).name}
      </Button>
    </div>
  );
}
export function MonitorConnectionDialog({
  kind,
  projectId,
  connectionId,
  open,
  onClose,
  onConnected,
}: {
  kind: MonitorKind;
  projectId: string;
  connectionId?: string;
  open: boolean;
  onClose: () => void;
  onConnected: (id: string) => void;
}) {
  const definition = providerDefinition(kind),
    action = useAction(),
    config = useConfig();
  const [method, setMethod] = useState<"oauth" | "credentials">(
    config.data?.monitoring?.[kind]?.oauth ? "oauth" : "credentials",
  );
  const [region, setRegion] = useState("us");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    action.mutate(
      {
        path: `/monitor/connections/${kind}/${method === "oauth" ? "start" : "credentials"}`,
        body:
          method === "oauth"
            ? { projectId, connectionId, region }
            : {
                projectId,
                connectionId,
                name: form.get("name"),
                credentials: Object.fromEntries(
                  definition.fields.map((f) => [
                    f.id,
                    String(form.get(f.id) || ""),
                  ]),
                ),
              },
      },
      {
        onSuccess: (r) => {
          if (method === "oauth") location.assign(String(r.url));
          else onConnected(String(r.id));
        },
      },
    );
  }
  return (
    <Dialog
      title={`${connectionId ? "Reconnect" : "Connect"} ${definition.name}`}
      open={open}
      onClose={onClose}
      description={`Connect an account first, then choose the ${definition.resource.toLowerCase()} to monitor.`}
    >
      <form className="form-stack" onSubmit={submit}>
        <Notice>
          {definition.guidance}{" "}
          <a
            className="underline"
            href={definition.docs}
            target="_blank"
            rel="noreferrer"
          >
            Provider instructions
          </a>
        </Notice>
        {definition.oauth && (
          <SelectField
            name="method"
            label="Connection method"
            value={method}
            onChange={(v) => setMethod(v as typeof method)}
          >
            <option value="credentials">Credentials</option>
            <option
              value="oauth"
              disabled={!config.data?.monitoring?.[kind]?.oauth}
            >
              Authorize with {definition.name}
              {!config.data?.monitoring?.[kind]?.oauth
                ? " (operator setup required)"
                : ""}
            </option>
          </SelectField>
        )}
        {method === "oauth" && kind === "posthog" && (
          <SelectField
            name="region"
            label="Region"
            value={region}
            onChange={setRegion}
          >
            <option value="us">Cloud US</option>
            <option value="eu">Cloud EU</option>
          </SelectField>
        )}
        {method === "credentials" && (
          <>
            <Field
              name="name"
              label="Connection name"
              defaultValue={definition.name}
              required
            />
            {definition.fields.map((field) =>
              field.multiline ? (
                <label className="grid gap-2 text-sm" key={field.id}>
                  {field.label}
                  <textarea
                    name={field.id}
                    rows={5}
                    className="native-select !h-auto font-mono"
                    required={!field.optional}
                  />
                </label>
              ) : (
                <Field
                  key={field.id}
                  name={field.id}
                  label={field.label}
                  type={field.secret ? "password" : "text"}
                  placeholder={field.placeholder}
                  required={!field.optional}
                />
              ),
            )}
          </>
        )}
        <p className="muted text-xs">
          Credentials are encrypted. History imports are silent. Available
          history and permissions vary by provider.
        </p>
        <ErrorNotice error={action.error} />
        <div className="form-actions">
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button type="submit" isPending={action.isPending}>
            {method === "oauth"
              ? "Continue to authorization"
              : "Verify and connect"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function WebhookDialog({
  id,
  open,
  onClose,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
}) {
  const action = useAction();
  return (
    <Dialog
      title="Billing webhook"
      description="Configure this endpoint in the provider dashboard and enter its verification secret."
      open={open}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          action.mutate(
            {
              path: `/monitor/connections/${id}/webhook`,
              method: "PATCH",
              body: { secret: form.get("secret") },
            },
            { onSuccess: onClose },
          );
        }}
      >
        <label className="grid gap-2 text-sm">
          Endpoint
          <input
            className="native-select"
            readOnly
            value={`${location.origin}/api/webhooks/monitor/${id}`}
          />
        </label>
        <Field
          name="secret"
          type="password"
          label="Signing secret (RevenueCat: full Authorization header)"
          required
        />
        <ErrorNotice error={action.error} />
        <Button type="submit" isPending={action.isPending}>
          Save secret
        </Button>
      </form>
    </Dialog>
  );
}
