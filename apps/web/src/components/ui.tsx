import type { ButtonHTMLAttributes, ReactNode } from "react";
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
    primary: "bg-brand text-white hover:bg-brand-dark shadow-sm",
    dark: "bg-ink text-white hover:bg-black",
    secondary: "bg-white text-ink ring-1 ring-inset ring-line hover:bg-surface",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-brand hover:bg-brand-light",
  }[variant];
  const sizes = size === "lg" ? "h-12 px-6 text-base" : "h-11 px-4 text-sm";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${styles} ${className}`}
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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_COLOR[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Empty({ title, children, icon = "bag" }: { title: string; children?: ReactNode; icon?: IconName }) {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-light text-brand">
        <Icon name={icon} size={28} />
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
      {children && <div className="mt-2 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <Icon name="alert" size={16} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line/60 ${className}`}>{children}</div>;
}

export function SectionTitle({ title, action, sub }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {sub && <p className="text-sm text-ink-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border-0 bg-surface px-4 py-3 text-base text-ink ring-1 ring-inset ring-line placeholder:text-ink-muted/70 outline-none transition focus:bg-white focus:ring-2 focus:ring-brand";
