import { type FormEvent } from "react";
import { Button } from "@heroui/react";
import { useAction } from "./data";
import { ErrorNotice, Field } from "./ui";

export function DestinationVerification({
  id,
  onVerified,
}: {
  id: string;
  onVerified?: () => void;
}) {
  const action = useAction();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    action.mutate(
      {
        path: `/destinations/${id}/confirm`,
        body: { code: fields.get("code") },
      },
      { onSuccess: onVerified },
    );
  }
  return (
    <form className="form-stack mt-3" onSubmit={submit} autoComplete="off">
      <Field
        name="code"
        label="Verification code"
        required
        description="Copy the code from your channel. It expires after 10 minutes."
      />
      <ErrorNotice error={action.error} />
      <Button type="submit" size="sm" isPending={action.isPending}>
        Verify channel
      </Button>
    </form>
  );
}
