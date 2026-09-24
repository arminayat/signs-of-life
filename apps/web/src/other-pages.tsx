import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import { Activity, Check, ExternalLink, Send, ShieldCheck } from "lucide-react";
import {
  useAction,
  useConfig,
  useDashboard,
  when,
  type Dashboard,
} from "./data";
import {
  Dialog,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Logo,
  Notice,
  PageHeader,
  Status,
} from "./ui";
export function ActivityList({
  deliveries,
}: {
  deliveries: Dashboard["deliveries"];
}) {
  return deliveries.length ? (
    <Card className="overflow-hidden">
      {deliveries.map((delivery) => (
        <div className="activity-row" key={delivery.id}>
          <span className="activity-icon">
            <Send size={15} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">{delivery.notification.title}</p>
            <p className="muted text-[11px] mt-1 whitespace-pre-line break-words">
              {delivery.notification.text}
            </p>
            <p className="muted text-[10px] mt-2">
              {when(delivery.createdAt)} · {delivery.attempts} attempts
            </p>
            {delivery.lastError && (
              <p className="text-xs text-red-600 mt-1">
                {delivery.lastError.replaceAll("_", " ")}
              </p>
            )}
          </div>
          <Status value={delivery.status} />
        </div>
      ))}
    </Card>
  ) : (
    <Card className="p-7 flex flex-row gap-4 items-center">
      <span className="empty-icon !w-10 !h-10 !rounded-xl !mb-0">
        <Activity size={18} />
      </span>
      <div>
        <p className="font-medium text-sm">Quiet for now.</p>
        <p className="muted text-xs mt-1">
          Your notification history will appear here as updates come in.
        </p>
      </div>
    </Card>
  );
}
export function ActivityPage() {
  const query = useDashboard();
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  return (
    <>
      <PageHeader
        eyebrow="A LITTLE HISTORY"
        title="Every signal, accounted for."
        description="Follow notifications from collection to delivery. History is kept for 30 days."
      />
      <div className="mb-6">
        <Notice>
          “Provider accepted” confirms the provider accepted a message.
          “Uncertain” means delivery could not be confirmed; these messages
          aren’t blindly resent.
        </Notice>
      </div>
      <ActivityList deliveries={query.data.deliveries} />
    </>
  );
}
export function SettingsPage({ logout }: { logout: () => Promise<void> }) {
  const config = useConfig(),
    action = useAction();
  const [open, setOpen] = useState(false);
  function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    action.mutate(
      {
        path: "/workspace",
        method: "DELETE",
        body: { confirmation: fields.get("confirmation") },
      },
      { onSuccess: () => location.assign("/") },
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your workspace."
        description="A few details about your Signs of Life installation."
      />
      <Card className="p-6 max-w-3xl">
        <h2 className="mb-5">Installation</h2>
        <dl className="grid grid-cols-2 gap-y-5 text-sm">
          <dt className="muted">Authentication</dt>
          <dd>
            {config.data?.authProvider === "better-auth"
              ? "Better Auth · GitHub"
              : "Supabase Auth · GitHub"}
          </dd>
          <dt className="muted">Workspace capacity</dt>
          <dd>
            {config.data?.limits.projects} projects ·{" "}
            {config.data?.limits.sources} sources ·{" "}
            {config.data?.limits.destinations} destinations
          </dd>
          <dt className="muted">Event and delivery history</dt>
          <dd>30 days</dd>
          <dt className="muted">Download history</dt>
          <dd>90 days</dd>
          <dt className="muted">License</dt>
          <dd>AGPL-3.0-only</dd>
          <dt className="muted">Source</dt>
          <dd>
            <a
              className="text-link"
              href={config.data?.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {config.data?.revision?.slice(0, 12) || "View repository"}
              <ExternalLink size={13} />
            </a>
          </dd>
        </dl>
        <div className="mt-6">
          <Notice>
            <ShieldCheck size={18} />
            Monitored account email addresses are never collected. Integration
            credentials are encrypted on the server.
          </Notice>
        </div>
      </Card>
      <Card className="p-6 max-w-3xl mt-6">
        <h2>Account controls</h2>
        <p className="muted text-sm mt-2 mb-5">
          Deleting your workspace removes its projects, connections, credentials
          and monitoring history.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onPress={() => void logout()}>
            Sign out
          </Button>
          <Button variant="danger" onPress={() => setOpen(true)}>
            Delete workspace
          </Button>
        </div>
      </Card>
      <Dialog
        title="Delete your workspace?"
        description="This permanently removes your monitoring data and disconnects all sources. Type DELETE to confirm."
        open={open}
        onClose={() => setOpen(false)}
      >
        <form className="form-stack" onSubmit={remove}>
          <Field
            label="Confirmation"
            name="confirmation"
            placeholder="DELETE"
            required
          />
          <ErrorNotice error={action.error} />
          <Button type="submit" variant="danger" isPending={action.isPending}>
            Permanently delete workspace
          </Button>
        </form>
      </Dialog>
    </>
  );
}
export function VerifyPage() {
  const action = useAction();
  const token = new URLSearchParams(location.search).get("token");
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-md">
        <Logo />
        <Card className="mt-10 p-8 gap-5">
          <span className="empty-icon">
            <Check size={25} />
          </span>
          <h1 className="!text-2xl">
            {action.isSuccess
              ? "You’re connected."
              : "Confirm your email address."}
          </h1>
          <p className="muted">
            {action.isSuccess
              ? "This email destination is ready. Select it in your project preferences to start receiving updates."
              : "Confirm that you want to receive Signs of Life notifications at this address."}
          </p>
          <ErrorNotice error={action.error} />
          {action.isSuccess ? (
            <Link className="button button--primary" to="/destinations">
              Go to destinations
            </Link>
          ) : (
            <Button
              isDisabled={!token}
              isPending={action.isPending}
              onPress={() =>
                action.mutate({ path: "/verify-email", body: { token } })
              }
            >
              Confirm email address
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
