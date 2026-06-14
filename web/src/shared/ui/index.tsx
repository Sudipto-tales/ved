// Design-system primitives. Features import ONLY from @/shared/ui. Styling comes
// from the class names defined in GlobalStyles (docs/23-design-system.md).
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
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

export function StatCard({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <Card flat>
      <div className="stat">
        <span className="stat-label">{label}</span>
        <span className={`stat-value${accent ? ' stat-accent' : ''}`}>{value}</span>
      </div>
    </Card>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="loading" />;
}
