import {
  Button,
  Card,
  Input,
  Label,
  Modal,
  TextField,
  Spinner,
} from "@heroui/react";
import { AlertCircle, ArrowUpRight, Radio } from "lucide-react";
import { useId, type ReactNode, type HTMLInputTypeAttribute } from "react";
import { errorMessage } from "./data";
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Radio size={21} strokeWidth={2.3} />
      </span>
      {!compact && (
        <span className="brand-name">
          Signs <span className="font-normal">of Life</span>
          <span className="beta">BETA</span>
        </span>
      )}
    </span>
  );
}
export function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}
export function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
  placeholder,
  description,
  ...props
}: {
  label: string;
  name: string;
  type?: HTMLInputTypeAttribute;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <TextField
      name={name}
      type={type}
      defaultValue={defaultValue}
      isRequired={required}
      className="w-full"
    >
      <Label>{label}</Label>
      <Input placeholder={placeholder} {...props} />
      {description && <span className="field-help">{description}</span>}
    </TextField>
  );
}
export function SelectField({
  label,
  name,
  value,
  onChange,
  children,
  required = true,
}: {
  label: string;
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  children: ReactNode;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <select
        className="native-select"
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        required={required}
      >
        {children}
      </select>
    </div>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="notice error">
      <AlertCircle size={17} />
      <span>{errorMessage(error)}</span>
    </div>
  ) : null;
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}
export function Status({ value }: { value: string }) {
  const good = [
    "connected",
    "accepted",
    "verified",
    "active",
    "available",
  ].includes(value);
  const bad = ["failed", "error", "uncertain", "disconnected"].includes(value);
  return (
    <span
      className={`status ${good ? "status-good" : bad ? "status-bad" : ""}`}
    >
      <span />
      {value === "accepted" ? "Provider accepted" : value.replaceAll("_", " ")}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted mt-2 max-w-xl">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p className="muted max-w-sm">{description}</p>
      {action}
    </Card>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <Spinner />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function Dialog({
  title,
  description,
  open,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger aria-label="Close dialog" />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
            {description && <p className="muted text-sm mt-2">{description}</p>}
          </Modal.Header>
          <Modal.Body className="pb-6">{children}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="text-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
export function ConfirmDelete({
  label,
  description,
  onConfirm,
  pending = false,
}: {
  label: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Button
      variant="danger"
      isPending={pending}
      onPress={() => {
        if (window.confirm(description)) onConfirm();
      }}
    >
      {label}
    </Button>
  );
}
