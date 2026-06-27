// SetupGate — the skip-warning banner (docs/26). Drop it at the top of a page whose action
// has prerequisites; if any are still missing it renders a soft warning naming exactly what
// to do first (with links). It WARNS, it does not block — the admin may proceed if they have
// a reason. Prerequisites come from the single source of truth, useSetupProgress.
import { Link } from 'react-router-dom';
import { useSetupProgress, type SetupStepKey } from './useSetupProgress';

export function SetupGate({ step }: { step: SetupStepKey }) {
  const { byKey, loading } = useSetupProgress();
  const s = byKey[step];
  if (loading || !s || s.blockedBy.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex gap-12"
      style={{
        alignItems: 'flex-start',
        border: '1px solid var(--warning)',
        borderLeft: '4px solid var(--warning)',
        borderRadius: 10,
        padding: '12px 14px',
        background: 'var(--surface)',
        marginBottom: 16,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠️</span>
      <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        <strong>Finish a few things first.</strong> To set up <b>{s.label.toLowerCase()}</b>, you need{' '}
        {s.blockedBy.map((p, i) => (
          <span key={p.to}>
            {i > 0 && (i === s.blockedBy.length - 1 ? ' and ' : ', ')}
            <Link to={p.to}>{p.label}</Link>
          </span>
        ))}{' '}
        first.
      </div>
    </div>
  );
}
