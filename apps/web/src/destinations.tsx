import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import { Mail, Plus, Send, ArrowUpRight, Check } from "lucide-react";
import { useAction, useConfig, useDashboard } from "./data";
import {
  Dialog,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeader,
  SelectField,
  Status,
} from "./ui";
export function DestinationsPage() {
  const query = useDashboard(),
    action = useAction();
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState(""),
    [telegramUrl, setTelegramUrl] = useState("");
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  return (
    <>
      <PageHeader
        eyebrow="THE UPDATES COME TO YOU"
        title="Your signals. Your space."
        description="Choose where you want to hear about the little wins."
        action={
          <Button onPress={() => setOpen(true)}>
            <Plus size={16} />
            Add destination
          </Button>
        }
      />
      <ErrorNotice error={action.error} />
      {message && (
        <div role="status" className="notice mb-5">
          <Check size={16} />
          {message}
        </div>
      )}
      {telegramUrl && (
        <div className="notice mb-5">
          <a
            className="underline"
            href={telegramUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Telegram to complete the connection ↗
          </a>
        </div>
      )}
      {query.data.destinations.length ? (
        <div className="integration-grid">
          {query.data.destinations.map((destination) => (
            <Card className="integration-card" key={destination.id}>
              <div className="flex justify-between items-start">
                <span className="integration-logo">
                  {destination.kind === "email" ? (
                    <Mail size={23} />
                  ) : (
                    <Send size={23} />
                  )}
                </span>
                <Status
                  value={
                    !destination.enabled
                      ? "paused"
                      : destination.verified
                        ? "verified"
                        : "verification pending"
                  }
                />
              </div>
              <div>
                <h2>{destination.name}</h2>
                <p className="muted text-xs mt-1">
                  {destination.kind === "email"
                    ? destination.address
                    : "Private Telegram chat"}
                </p>
              </div>
              <p className="muted text-xs">
                Used by{" "}
                {
                  query.data!.projectDestinations.filter(
                    (link) => link.destinationId === destination.id,
                  ).length
                }{" "}
                projects
              </p>
              <div className="flex gap-2 flex-wrap">
                {destination.verified ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      isDisabled={!destination.enabled}
                      onPress={() =>
                        action.mutate(
                          { path: `/destinations/${destination.id}/test` },
                          {
                            onSuccess: () =>
                              setMessage(
                                "Test notification queued. Check Activity for its delivery status.",
                              ),
                          },
                        )
                      }
                    >
                      Send test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        action.mutate({
                          path: `/destinations/${destination.id}`,
                          method: "PATCH",
                          body: { enabled: !destination.enabled },
                        })
                      }
                    >
                      {destination.enabled ? "Pause" : "Resume"}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      action.mutate(
                        { path: `/destinations/${destination.id}/verify` },
                        {
                          onSuccess: (result) => {
                            if (result.url) setTelegramUrl(String(result.url));
                            else
                              setMessage(
                                "A new verification email has been queued.",
                              );
                          },
                        },
                      )
                    }
                  >
                    {destination.kind === "telegram"
                      ? "Connect Telegram"
                      : "Resend verification"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    if (
                      confirm(
                        "Remove this destination and its delivery history?",
                      )
                    )
                      action.mutate({
                        path: `/destinations/${destination.id}`,
                        method: "DELETE",
                      });
                  }}
                >
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Send size={25} />}
          title="A good update deserves a good home."
          description="Add your Telegram chat or email address. Then select it in your project’s notification preferences."
          action={
            <Button onPress={() => setOpen(true)}>
              Add your first destination
              <ArrowUpRight size={15} />
            </Button>
          }
        />
      )}
      <div className="mt-6">
        <Notice>
          Choose destinations separately for each{" "}
          <Link className="underline" to="/">
            project
          </Link>
          . Only verified, enabled destinations receive notifications.
        </Notice>
      </div>
      <DestinationDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
function DestinationDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const action = useAction(),
    config = useConfig();
  const [kind, setKind] = useState("telegram"),
    [result, setResult] = useState<Record<string, unknown>>();
  function close() {
    setResult(undefined);
    action.reset();
    onClose();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    action.mutate(
      {
        path: "/destinations",
        body: {
          name: fields.get("name"),
          kind,
          address: fields.get("address") ?? undefined,
        },
      },
      { onSuccess: setResult },
    );
  }
  return (
    <Dialog
      title={result ? "One last step." : "Add a destination"}
      description="Keep your notifications close, wherever you work."
      open={open}
      onClose={close}
    >
      {result ? (
        <div className="form-stack">
          <Notice>
            {result.url
              ? "Open your private chat with the bot and press Start. This connection link expires in 10 minutes."
              : "Check your inbox and confirm your email address. The verification link expires in 24 hours."}
          </Notice>
          {!!result.url && (
            <a
              href={String(result.url)}
              target="_blank"
              rel="noreferrer"
              className="button button--primary"
            >
              Open Telegram
              <ArrowUpRight size={15} />
            </a>
          )}
          <Button variant="secondary" onPress={close}>
            Done
          </Button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <SelectField
            name="kind"
            label="Channel"
            value={kind}
            onChange={setKind}
          >
            <option value="telegram">Telegram</option>
            <option value="email">Email</option>
          </SelectField>
          <Field
            name="name"
            label="Destination name"
            placeholder={kind === "telegram" ? "My Telegram" : "My inbox"}
            required
          />
          {kind === "email" && (
            <Field
              name="address"
              label="Email address"
              type="email"
              placeholder="you@example.com"
              required
            />
          )}
          {config.data &&
            !config.data.channels[kind as "email" | "telegram"] && (
              <Notice>
                This channel is waiting for operator setup. It will be available
                once the installation is configured.
              </Notice>
            )}
          <ErrorNotice error={action.error} />
          <div className="form-actions">
            <Button variant="secondary" onPress={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              isPending={action.isPending}
              isDisabled={!config.data?.channels[kind as "email" | "telegram"]}
            >
              {kind === "telegram" ? "Connect Telegram" : "Send verification"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
