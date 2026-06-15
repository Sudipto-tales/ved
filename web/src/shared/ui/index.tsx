// Design-system primitives. Features import ONLY from @/shared/ui. Styling comes
// from the class names defined in GlobalStyles (docs/23-design-system.md).
import type { ButtonHTMLAttributes, CSSProperties, ReactNode, SelectHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

export { Icon } from './Icon';
export type { IconName } from './Icon';
export { GlobalStyles } from './GlobalStyles';

// HelpDot — a small "?" affordance that links to a contextual help topic. Place it
// next to a page title or section heading. `topic` matches a key in the help content
// registry (features/help/content.ts).
export function HelpDot({ topic, label }: { topic: string; label?: string }) {
  return (
    <Link
      to={`/help/${topic}`}
      className="help-dot"
      aria-label={label ?? 'Help for this page'}
      title={label ?? 'Help'}
    >
      <Icon name="help" />
    </Link>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn btn-${variant}${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </button>
  );
}

export function Card({
  children,
  flat,
  style,
  className,
}: {
  children: ReactNode;
  flat?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`card${flat ? ' card--flat' : ''}${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  help,
}: {
  title: string;
  subtitle?: string;
  /** Help topic key — renders a "?" next to the title linking to /help/<topic>. */
  help?: string;
}) {
  return (
    <header className="page-header">
      <div className="page-title-row">
        <h1>{title}</h1>
        {help && <HelpDot topic={help} label={`Help: ${title}`} />}
      </div>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

type SparkTone = 'primary' | 'info' | 'danger';
const SPARK_COLOR: Record<SparkTone, string> = {
  primary: 'var(--primary)',
  info: 'var(--info)',
  danger: 'var(--danger)',
};

// Sparkline — a tiny axis-less bar chart of pure color blocks (Minimal micro-chart).
export function Sparkline({ data, tone = 'primary' }: { data: number[]; tone?: SparkTone }) {
  const max = Math.max(...data, 1);
  return (
    <span className="spark" style={{ color: SPARK_COLOR[tone] }} aria-hidden>
      {data.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(6, Math.round((v / max) * 40))}px` }} />
      ))}
    </span>
  );
}

// GrowthDelta — colored arrow + percentage + muted context ("+2.6% last 7 days").
export function GrowthDelta({ value, dir, ctx }: { value: string; dir: 'up' | 'down'; ctx?: string }) {
  return (
    <span className={`delta delta-${dir}`}>
      <span className="arrow" style={{ fontSize: 11 }}>{dir === 'up' ? '↑' : '↓'}</span>
      {value}
      {ctx && <span className="ctx">{ctx}</span>}
    </span>
  );
}

// StatCard — big bold metric, optional right-aligned sparkline + a growth delta below.
export function StatCard({
  label,
  value,
  accent,
  spark,
  delta,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  spark?: { data: number[]; tone?: SparkTone };
  delta?: { value: string; dir: 'up' | 'down'; ctx?: string };
}) {
  return (
    <Card flat>
      <div className="stat">
        <div className="stat-top">
          <span className="stat-label">{label}</span>
          {spark && <Sparkline data={spark.data} tone={spark.tone} />}
        </div>
        <span className={`stat-value${accent ? ' stat-accent' : ''}`}>{value}</span>
        {delta && <GrowthDelta value={delta.value} dir={delta.dir} ctx={delta.ctx} />}
      </div>
    </Card>
  );
}

// HeroBanner — deep-gradient welcome/featured card with white type + optional CTA.
export function HeroBanner({
  tag,
  title,
  subtitle,
  action,
  children,
}: {
  tag?: string;
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="hero">
      {tag && <span className="hero-tag">{tag}</span>}
      <h2 style={{ marginTop: tag ? 14 : 0 }}>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
      {action}
      {children}
    </div>
  );
}

// Select — native select styled to the system with a chevron affordance.
export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select className="input" {...props}>
        {children}
      </select>
      <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
    </span>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'info';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="loading" />;
}

// DataTable — a borderless, hoverable table. columns declare a header + a cell renderer.
export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  width?: number | string;
}
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'No records yet.',
  loading,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  empty?: ReactNode;
  loading?: boolean;
  onRowClick?: (row: T) => void;
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} style={{ textAlign: c.align ?? 'left', width: c.width }}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr><td className="table-empty" colSpan={columns.length}><Spinner /></td></tr>
        )}
        {!loading && rows.length === 0 && (
          <tr><td className="table-empty" colSpan={columns.length}>{empty}</td></tr>
        )}
        {!loading && rows.map((row, i) => (
          <tr key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}>
            {columns.map((c, j) => (
              <td key={j} style={{ textAlign: c.align ?? 'left' }}>{c.cell(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// EmptyState — a centered icon + title + description for empty/zero views.
export function EmptyState({ icon, title, desc, action }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="emptystate">
      {icon && <div className="es-icon">{icon}</div>}
      <div className="es-title">{title}</div>
      {desc && <div className="es-desc">{desc}</div>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

// Field — a labelled form control wrapper.
export function Field({ label, hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// Tabs — simple underline tab bar.
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div key={t.id} className={`tab${t.id === active ? ' active' : ''}`} onClick={() => onChange(t.id)}>{t.label}</div>
      ))}
    </div>
  );
}

// Toolbar — a page actions / filters row (use .grow on a spacer child to push items right).
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
