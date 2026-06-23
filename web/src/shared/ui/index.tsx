// Design-system primitives. Features import ONLY from @/shared/ui. Styling comes
// from the class names defined in GlobalStyles (docs/23-design-system.md).
import type { ButtonHTMLAttributes, CSSProperties, ReactNode, SelectHTMLAttributes } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

export { Icon } from './Icon';
export type { IconName } from './Icon';

// VedLogo — the brand "V" mark (same artwork as the boot preloader). Use beside the title.
export function VedLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="vedLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00A76F" />
          <stop offset="100%" stopColor="#00B894" />
        </linearGradient>
      </defs>
      <path d="M64 96 C64 75 85 64 105 72 L256 380 L130 430 C100 440 75 410 70 380 Z" fill="url(#vedLogoGrad)" />
      <path d="M448 96 C448 75 427 64 407 72 L256 380 L382 430 C412 440 437 410 442 380 Z" fill="url(#vedLogoGrad)" />
    </svg>
  );
}
export { GlobalStyles } from './GlobalStyles';
export { TrendChart, BarSeries, DonutChart, FunnelChart, DotChart, CHART_COLORS } from './charts';
export type { Point } from './charts';

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

// Tone palette shared by StatCard chips, SectionCard heads, and colored borders.
export type CardTone = 'primary' | 'info' | 'warning' | 'danger' | 'success' | 'violet';
export const TONE_COLOR: Record<CardTone, { c: string; weak: string }> = {
  primary: { c: '#00a76f', weak: 'rgba(0,167,111,.12)' },
  info: { c: '#00b8d9', weak: 'rgba(0,184,217,.12)' },
  warning: { c: '#ffab00', weak: 'rgba(255,171,0,.16)' },
  danger: { c: '#ff5630', weak: 'rgba(255,86,48,.14)' },
  success: { c: '#22c55e', weak: 'rgba(34,197,94,.14)' },
  violet: { c: '#7c4dff', weak: 'rgba(124,77,255,.14)' },
};

// StatCard — big bold metric. Pass `tone`+`icon` for a colored rail + tinted icon chip
// (the colorful console look); `spark`/`delta` still work for trend cards.
export function StatCard({
  label,
  value,
  tone,
  icon,
  spark,
  delta,
}: {
  label: string;
  value: ReactNode;
  /** @deprecated colored stat values were removed per the no-colored-text rule. */
  accent?: boolean;
  tone?: CardTone;
  icon?: IconName;
  spark?: { data: number[]; tone?: SparkTone };
  delta?: { value: string; dir: 'up' | 'down'; ctx?: string };
}) {
  const t = tone ? TONE_COLOR[tone] : undefined;
  return (
    <Card flat className="statcard">
      <div className="stat">
        <div className="stat-top">
          <span className="stat-label">{label}</span>
          {icon && t ? (
            <span className="stat-chip" style={{ background: t.weak, color: t.c }}>
              <Icon name={icon} />
            </span>
          ) : (
            spark && <Sparkline data={spark.data} tone={spark.tone} />
          )}
        </div>
        <span className="stat-value">{value}</span>
        {delta && <GrowthDelta value={delta.value} dir={delta.dir} ctx={delta.ctx} />}
      </div>
    </Card>
  );
}

// SectionCard — a Card with a colored icon header strip. Use to give each content block a
// distinct identity (color + thin-line icon) on the console pages.
export function SectionCard({
  icon,
  title,
  subtitle,
  tone = 'primary',
  right,
  children,
  className,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  tone?: CardTone;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE_COLOR[tone];
  return (
    <Card flat className={className}>
      <div className="section-head">
        <span className="section-ico" style={{ background: t.weak, color: t.c }}>
          <Icon name={icon} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{title}</h3>
          {subtitle && <div className="section-sub">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

// Collapsible — an expandable card with a colored icon header (for the Settings page:
// each card holds a group of credentials/config and toggles open/closed).
export function Collapsible({
  icon,
  title,
  subtitle,
  tone = 'primary',
  defaultOpen = false,
  right,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  tone?: CardTone;
  defaultOpen?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const t = TONE_COLOR[tone];
  return (
    <Card flat style={{ padding: 0 }}>
      <button
        type="button"
        className="collapsible-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="section-ico" style={{ background: t.weak, color: t.c }}>
          <Icon name={icon} />
        </span>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <h3>{title}</h3>
          {subtitle && <div className="section-sub">{subtitle}</div>}
        </div>
        {right}
        <span className={`collapsible-chevron${open ? ' open' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </Card>
  );
}

// PixelField — a dark panel with a living grid of subtle lighter blocks that fade in/out
// and re-position over time (canvas, requestAnimationFrame). Use as an animated card
// background; overlay content via `children`. Cheap + DPR-aware + auto-resizing.
export function PixelField({
  children,
  style,
  className,
  density = 0.12,
  unit = 26,
  bg = '#1e2d2c',
  blockRGB = '120,165,150',
}: {
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  density?: number; // fraction of grid cells lit at once
  unit?: number; // grid cell size in px
  bg?: string;
  blockRGB?: string; // "r,g,b" of the lighter block tint
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cols = 0;
    let rows = 0;
    let blocks: { x: number; y: number; w: number; h: number; life: number; ttl: number; max: number }[] = [];
    let raf = 0;
    let last = 0;
    const rnd = (n: number) => Math.floor(Math.random() * n);
    const mk = () => ({
      x: rnd(cols),
      y: rnd(rows),
      w: 1 + rnd(2),
      h: 1 + rnd(2),
      life: Math.random() * 3000,
      ttl: 2600 + Math.random() * 4200,
      max: 0.05 + Math.random() * 0.08,
    });

    const seed = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.ceil(r.width / unit));
      rows = Math.max(1, Math.ceil(r.height / unit));
      blocks = Array.from({ length: Math.round(cols * rows * density) }, mk);
    };

    const frame = (t: number) => {
      const dt = last ? t - last : 16;
      last = t;
      const r = canvas.getBoundingClientRect();
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, r.width, r.height);
      for (const b of blocks) {
        b.life += dt;
        const p = b.life / b.ttl;
        const env = p < 0.5 ? p * 2 : (1 - p) * 2; // triangle fade in→out
        const a = b.max * Math.max(0, env);
        if (a > 0.002) {
          ctx.fillStyle = `rgba(${blockRGB},${a})`;
          ctx.fillRect(b.x * unit, b.y * unit, b.w * unit - 3, b.h * unit - 3);
        }
        if (b.life >= b.ttl) Object.assign(b, mk()); // expire → re-spawn elsewhere
      }
      raf = requestAnimationFrame(frame);
    };

    seed();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(seed);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, unit, bg, blockRGB]);

  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-lg)', background: bg, ...style }}>
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} aria-hidden />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
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

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'info' | 'danger';
// Badges are neutral by design (no colored text per the design rule). `tone` is accepted
// for API compatibility but no longer changes the color.
export function Badge({ children, tone: _tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className="badge badge-neutral">{children}</span>;
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
  searchable,
  searchText,
  searchPlaceholder = 'Search…',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  empty?: ReactNode;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  /** Show a search box that filters rows live. Requires `searchText`. */
  searchable?: boolean;
  /** Builds the haystack string for a row (the fields search should match). */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState('');
  const showSearch = !!searchable && !!searchText;
  const query = q.trim().toLowerCase();
  const data = showSearch && query ? rows.filter((r) => searchText!(r).toLowerCase().includes(query)) : rows;
  return (
    <div>
      {showSearch && (
        <div className="table-search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label="Search table" />
          {query && (
            <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {data.length} / {rows.length}
            </span>
          )}
        </div>
      )}
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
          {!loading && data.length === 0 && (
            <tr><td className="table-empty" colSpan={columns.length}>{query ? `No matches for “${q.trim()}”.` : empty}</td></tr>
          )}
          {!loading && data.map((row, i) => (
            <tr key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}>
              {columns.map((c, j) => (
                <td key={j} style={{ textAlign: c.align ?? 'left' }}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
