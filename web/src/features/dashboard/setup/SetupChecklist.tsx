// The guided setup checklist on the admin dashboard (docs/26). Shows the ordered setup
// steps with a live status — done ✓, available (with a CTA), or blocked (with what to do
// first) — plus overall progress. Hides itself once every step is complete.
import { Link } from 'react-router-dom';
import { Button, Card } from '@/shared/ui';
import { useSetupProgress, type SetupStep } from './useSetupProgress';

function Marker({ state, n }: { state: 'done' | 'blocked' | 'next'; n: number }) {
  const base: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
  };
  if (state === 'done') return <span style={{ ...base, background: 'var(--success)', color: '#fff' }}>✓</span>;
  if (state === 'blocked')
    return <span style={{ ...base, background: 'var(--surface-2)', color: 'var(--text-subtle)' }}>🔒</span>;
  return <span style={{ ...base, background: 'var(--primary)', color: '#fff' }}>{n}</span>;
}

function StepRow({ step, n, isNext }: { step: SetupStep; n: number; isNext: boolean }) {
  const blocked = step.blockedBy.length > 0;
  const state: 'done' | 'blocked' | 'next' = step.done ? 'done' : blocked ? 'blocked' : 'next';
  // Completed steps fade back so attention falls on what's left to do; blocked steps dim a
  // little less (they still need action, just not yet).
  const opacity = step.done ? 0.45 : blocked ? 0.7 : 1;
  return (
    <div
      className="flex gap-12"
      style={{
        alignItems: 'center',
        padding: '12px 0',
        borderTop: '1px solid var(--border)',
        opacity,
        transition: 'opacity .3s',
      }}
    >
      <Marker state={state} n={n} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, textDecoration: step.done ? 'line-through' : 'none' }}>
          {step.label}
          {isNext && !step.done && !blocked && (
            <span className="tier" style={{ marginLeft: 8, color: 'var(--primary)' }}>NEXT</span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          {blocked && !step.done ? (
            <>
              Requires{' '}
              {step.blockedBy.map((p, i) => (
                <span key={p.to}>
                  {i > 0 && ', '}
                  <Link to={p.to}>{p.label}</Link>
                </span>
              ))}{' '}
              first.
            </>
          ) : (
            step.hint
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {step.done ? (
          <Link to={step.to}><Button variant="ghost">Edit</Button></Link>
        ) : blocked ? (
          <Button variant="ghost" disabled>Locked</Button>
        ) : (
          <Link to={step.to}><Button variant={isNext ? 'primary' : 'secondary'}>Set up</Button></Link>
        )}
      </div>
    </div>
  );
}

export function SetupChecklist() {
  const { steps, doneCount, total, percent, complete, loading } = useSetupProgress();
  if (loading || complete) return null;

  const nextKey = steps.find((s) => !s.done && s.blockedBy.length === 0)?.key;

  return (
    <Card className="mt-24">
      <div className="between flex" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Finish setting up your school</h3>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            Complete these in order — each step unlocks the next.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{percent}%</div>
          <div className="subtle" style={{ fontSize: 12 }}>{doneCount} of {total} done</div>
        </div>
      </div>

      {/* progress bar */}
      <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', margin: '14px 0 4px' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: 'var(--primary)', transition: 'width .3s' }} />
      </div>

      <div>
        {steps.map((s, i) => (
          <StepRow key={s.key} step={s} n={i + 1} isNext={s.key === nextKey} />
        ))}
      </div>
    </Card>
  );
}
