import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import {
  Mail,
  MessageSquare,
  Plus,
  Send,
  ArrowUpRight,
  Check,
} from "lucide-react";
import type { ChannelKind } from "../../../packages/core/src/model";
import { DestinationVerification } from "./destination-verification";
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
                  ) : destination.kind === "slack" ||
                    destination.kind === "discord" ? (
                    <MessageSquare size={23} />
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
                    : destination.kind === "telegram"
                      ? "Private Telegram chat"
                      : destination.address}
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
                            else if (result.codeRequired)
                              setMessage(
                                "A verification code has been queued for your channel. Check Activity for delivery status.",
                              );
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
                      : destination.kind === "email"
                        ? "Resend verification"
                        : "Resend code"}
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
              {!destination.verified &&
                (destination.kind === "slack" ||
                  destination.kind === "discord") && (
                  <DestinationVerification
                    id={destination.id}
                    onVerified={() =>
                      setMessage(
                        "Channel verified. Select it in your project’s notification preferences.",
                      )
                    }
                  />
                )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Send size={25} />}
          title="A good update deserves a good home."
          description="Add Telegram, email, Slack or Discord. Then select it in your project’s notification preferences."
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
  const [kind, setKind] = useState<ChannelKind>("telegram"),
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
          webhookUrl: fields.get("webhookUrl") ?? undefined,
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
              : result.codeRequired
                ? "A verification code has been queued for your channel. Enter it below to enable notifications. Check Activity if it has not arrived."
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
          {!!result.codeRequired && (
            <DestinationVerification
              id={String(result.id)}
              onVerified={close}
            />
          )}
          <Button variant="secondary" onPress={close}>
            Done
          </Button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit} autoComplete="off">
          <SelectField
            name="kind"
            label="Channel"
            value={kind}
            onChange={(value) => setKind(value as ChannelKind)}
          >
            <option value="telegram">Telegram</option>
            <option value="email">Email</option>
            <option value="slack">Slack</option>
            <option value="discord">Discord</option>
          </SelectField>
          <Field
            name="name"
            label="Destination name"
            placeholder={
              kind === "telegram"
                ? "My Telegram"
                : kind === "email"
                  ? "My inbox"
                  : "Product updates"
            }
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
          {(kind === "slack" || kind === "discord") && (
            <>
              <Notice>
                {kind === "slack" ? (
                  <>
                    Create a Slack app, enable{" "}
                    <a
                      className="underline"
                      href="https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      incoming webhooks
                    </a>
                    , and choose the channel.
                  </>
                ) : (
                  <>
                    In your Discord text channel, open Edit Channel →
                    Integrations → Webhooks and copy its webhook URL. Forum and
                    media channels are not supported.
                  </>
                )}{" "}
                We will send a verification code there. Your webhook URL is
                stored encrypted.
              </Notice>
              <Field
                name="webhookUrl"
                label="Webhook URL"
                type="password"
                required
                placeholder={
                  kind === "slack"
                    ? "https://hooks.slack.com/services/…"
                    : "https://discord.com/api/webhooks/…"
                }
              />
            </>
          )}
          {config.data && !config.data.channels[kind] && (
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
              isDisabled={!config.data?.channels[kind]}
            >
              {kind === "telegram"
                ? "Connect Telegram"
                : kind === "email"
                  ? "Send verification"
                  : "Send verification code"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
