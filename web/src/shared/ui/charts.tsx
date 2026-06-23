// Chart kit (M9) — thin Recharts wrappers styled with the design-system tokens
// (docs/23). Features import these from @/shared/ui. Every chart takes the same simple
// `Point[]` series the control-plane analytics endpoints return ({ label, value }).
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart as ReFunnelChart,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Card } from './index';

export interface Point {
  label: string;
  value: number;
}

// Design-token palette for categorical series (emerald / cyan / coral / amber / violet).
export const CHART_COLORS = ['#00a76f', '#00b8d9', '#ff5630', '#ffab00', '#7c4dff', '#8a92a3'];
const AXIS = '#919eab';
const GRID = 'rgba(145,158,171,.16)';

function ChartFrame({ title, children, height = 240 }: { title?: string; children: ReactNode; height?: number }) {
  return (
    <Card flat>
      {title && <div className="stat-label" style={{ marginBottom: 12 }}>{title}</div>}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as any}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

const tooltipStyle = {
  background: '#212b36',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 12,
} as const;

// TrendChart — smooth area/line for revenue, registration & subscription trends.
export function TrendChart({
  title,
  data,
  tone = CHART_COLORS[0],
  height,
}: {
  title?: string;
  data: Point[];
  tone?: string;
  height?: number;
}) {
  return (
    <ChartFrame title={title} height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${title ?? 'trend'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity={0.35} />
            <stop offset="100%" stopColor={tone} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: GRID }} />
        <Area type="monotone" dataKey="value" stroke={tone} strokeWidth={2} fill={`url(#grad-${title ?? 'trend'})`} />
      </AreaChart>
    </ChartFrame>
  );
}

// BarSeries — categorical comparison (plan popularity / subscription growth).
export function BarSeries({ title, data, tone = CHART_COLORS[1], height }: { title?: string; data: Point[]; tone?: string; height?: number }) {
  return (
    <ChartFrame title={title} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: GRID }} />
        <Bar dataKey="value" fill={tone} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ChartFrame>
  );
}

// DonutChart — distribution (license-by-plan, plan popularity). Renders a legend.
export function DonutChart({ title, data, height = 240 }: { title?: string; data: Point[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card flat>
      {title && <div className="stat-label" style={{ marginBottom: 12 }}>{title}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 160, height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={72} paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {data.map((d, i) => (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span style={{ color: 'var(--text)' }}>{d.label}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                {d.value}
                {total > 0 && ` · ${Math.round((d.value / total) * 100)}%`}
              </span>
            </div>
          ))}
          {data.length === 0 && <span style={{ color: 'var(--text-subtle)', fontSize: 13 }}>No data yet</span>}
        </div>
      </div>
    </Card>
  );
}

// FunnelChart — conversion funnel (registration: submitted → reviewed → approved → activated).
export function FunnelChart({ title, data, height = 240 }: { title?: string; data: Point[]; height?: number }) {
  const rows = data.map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  return (
    <ChartFrame title={title} height={height}>
      <ReFunnelChart>
        <Tooltip contentStyle={tooltipStyle} />
        <Funnel dataKey="value" data={rows} isAnimationActive>
          <LabelList position="right" fill="#637381" stroke="none" dataKey="label" style={{ fontSize: 12 }} />
          <LabelList position="left" fill="#212b36" stroke="none" dataKey="value" style={{ fontSize: 12, fontWeight: 600 }} />
        </Funnel>
      </ReFunnelChart>
    </ChartFrame>
  );
}

// DotChart — volume-per-day scatter (registration request volume, peak dates).
export function DotChart({ title, data, tone = CHART_COLORS[0], height }: { title?: string; data: Point[]; tone?: string; height?: number }) {
  const rows = data.map((d, i) => ({ x: i, y: d.value, label: d.label }));
  return (
    <ChartFrame title={title} height={height}>
      <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis
          type="number"
          dataKey="x"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={[-0.5, Math.max(rows.length - 0.5, 0.5)]}
          tickFormatter={(i: number) => rows[i]?.label?.slice(5) ?? ''}
        />
        <YAxis type="number" dataKey="y" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ZAxis range={[60, 60]} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={rows} fill={tone} />
      </ScatterChart>
    </ChartFrame>
  );
}
