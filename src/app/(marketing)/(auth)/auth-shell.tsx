import type { ReactNode } from "react";

export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section>
      <h1 className="text-display-md">{title}</h1>
      {lead !== undefined && <p className="text-text-secondary text-body-md mt-3">{lead}</p>}
      <div className="mt-8">{children}</div>
      {footer !== undefined && (
        <div className="text-text-secondary text-body-md mt-8">{footer}</div>
      )}
    </section>
  );
}

/** A submit-level error. Field errors render inline against their input. */
export function FormError({ message }: { message: string }) {
  if (message === "") return null;
  return (
    <p
      role="alert"
      className="text-body-md border-danger-border bg-danger-fill text-danger-bright rounded-md border px-3 py-2"
    >
      {message}
    </p>
  );
}
