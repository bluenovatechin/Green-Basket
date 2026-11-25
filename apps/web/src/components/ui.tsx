import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { STATUS_COLOR, STATUS_LABEL } from "../lib/format";
import type { OrderStatus } from "../lib/types";
import Icon, { type IconName } from "./Icon";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-brand">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "dark";
  size?: "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className = "", children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark active:bg-brand-dark",
    dark: "bg-ink text-white hover:bg-black",
    secondary: "bg-paper text-ink ring-1 ring-inset ring-line hover:ring-ink/40 hover:bg-surface",
    danger: "bg-red-700 text-white hover:bg-red-800",
    ghost: "text-brand hover:bg-brand-light",
  }[variant];
  const sizes = size === "lg" ? "h-12 px-6 text-[15px]" : "h-11 px-4 text-sm";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${styles} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold ${STATUS_COLOR[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Empty({ title, children, icon = "bag", heading = "h2" }: { title: string; children?: ReactNode; icon?: IconName; heading?: "h1" | "h2" }) {
  const H = heading;
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-brand-light text-brand">
        <Icon name={icon} size={28} />
      </div>
      <H className="display text-xl">{title}</H>
      {children && <div className="mt-2 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <Icon name="alert" size={16} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-paper p-5 shadow-soft ring-1 ring-line/70 ${className}`}>{children}</div>;
}

export function SectionTitle({ title, action, sub }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="display text-2xl">{title}</h2>
        {sub && <p className="text-sm text-ink-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Label + control + hint/error. With `error`, the control gets aria-invalid and aria-describedby so screen readers
 * announce the problem, and the message is shown in red right under the field.
 */
export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string | null }) {
  const id = useId();
  const msgId = `${id}-msg`;
  const control =
    isValidElement(children) && (hint || error)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-invalid": error ? true : undefined,
          "aria-describedby": msgId,
        })
      : children;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      {control}
      {error ? (
        <span id={msgId} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700"><Icon name="alert" size={13} />{error}</span>
      ) : hint ? (
        <span id={msgId} className="mt-1 block text-xs text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "w-full min-w-0 rounded-md border-0 bg-paper px-3.5 py-3 text-base text-ink ring-1 ring-inset ring-line placeholder:text-ink-muted outline-none transition hover:ring-ink/30 focus:ring-2 focus:ring-brand aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-600";
