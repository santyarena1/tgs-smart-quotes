"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

export type Tone = "neutral" | "warn" | "info" | "ok" | "bad" | "violet";

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "ok" | "info";
  children: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <p className="loading" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="stat-strip">{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="stat" style={accent ? ({ ["--accent" as string]: accent } as never) : undefined}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  onKeyDown,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
}) {
  return (
    <div className="search">
      <span className="ico" aria-hidden="true">
        ⌕
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-label={placeholder ?? "Buscar"}
        autoComplete="off"
      />
    </div>
  );
}

/** Navegación con ↑/↓ + Enter/Escape para listas de opciones en buscadores. */
export function useKeyboardNav({
  itemCount,
  enabled,
  resetKey,
  onSelect,
  onEscape,
}: {
  itemCount: number;
  enabled: boolean;
  resetKey?: string | number;
  onSelect: (index: number) => void;
  onEscape?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  const setActiveIndexSafe = useCallback((value: number | ((prev: number) => number)) => {
    setActiveIndex((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      activeRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const next = itemCount > 0 ? 0 : -1;
    setActiveIndex(next);
    activeRef.current = next;
  }, [itemCount, resetKey]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape") {
        if (!enabled) return;
        e.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (!enabled || itemCount <= 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndexSafe((i) => (i < 0 ? 0 : (i + 1) % itemCount));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndexSafe((i) => (i < 0 ? itemCount - 1 : (i - 1 + itemCount) % itemCount));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const idx = activeRef.current < 0 ? 0 : activeRef.current;
        if (idx >= 0 && idx < itemCount) onSelectRef.current(idx);
      }
    },
    [enabled, itemCount, setActiveIndexSafe],
  );

  return { activeIndex, setActiveIndex: setActiveIndexSafe, onKeyDown };
}

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

export function EmptyState({
  icon = "◍",
  title,
  children,
}: {
  icon?: string;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-lg">
      <span className="ico" aria-hidden="true">
        {icon}
      </span>
      {title ? <strong>{title}</strong> : null}
      {children ? <p className="muted">{children}</p> : null}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function FormGrid({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit?: (e: FormEvent) => void;
}) {
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      {children}
    </form>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={active === t.id ? "tab active" : "tab"}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function useEscClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEscClose(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className={wide ? "modal wide" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="x-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  badge,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: ReactNode;
  badge?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEscClose(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay right" onMouseDown={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div className="drawer-title">
            <h2>{title}</h2>
            {badge}
          </div>
          <button type="button" className="x-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Error desconocido";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
