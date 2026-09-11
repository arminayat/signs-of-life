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
        <span>
          product<span className="font-normal">monitor</span>
          <span className="beta">BETA</span>
        </span>
      )}
    </span>
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
