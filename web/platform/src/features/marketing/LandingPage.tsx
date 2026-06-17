// VED marketing landing — the public front door served on the apex host (ved.test /
// www.ved.com). Built on the shared design system (Premium SaaS Minimalism): the emerald
// primary, thin-line icons, rounded surfaces. CTAs route into the public signup flow
// (/signup) and the platform sign-in (/login). Authed superadmins are redirected to the
// dashboard by HomeRoute before this ever renders.
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Icon, Spinner, type IconName } from '@/shared/ui';
import { usePlans, type Plan } from '../signup/api';

// The VED "V" brandmark — same gradient as the boot preloader, for a consistent identity.
function VMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="lpVGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00A76F" />
          <stop offset="100%" stopColor="#00B894" />
        </linearGradient>
      </defs>
      <path d="M64 96 C64 75 85 64 105 72 L256 380 L130 430 C100 440 75 410 70 380 Z" fill="url(#lpVGrad)" />
      <path d="M448 96 C448 75 427 64 407 72 L256 380 L382 430 C412 440 437 410 442 380 Z" fill="url(#lpVGrad)" />
    </svg>
  );
}

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'user-plus', title: 'Admissions & Students', desc: 'Enrol students, capture guardians, manage the full student lifecycle.' },
  { icon: 'graduation', title: 'Teachers & Staff', desc: 'Onboard teachers and staff with role-based access from day one.' },
  { icon: 'layers', title: 'Academics', desc: 'Classes, sections, timetables, attendance, exams and marks.' },
  { icon: 'wallet', title: 'Finance', desc: 'Fee structures, invoices, collection, concessions and ledgers.' },
  { icon: 'book', title: 'Learning (LMS)', desc: 'Assignments, materials, submissions and grading — tied to academics.' },
  { icon: 'bell', title: 'Communication', desc: 'Notices and announcements that reach the right people.' },
  { icon: 'shield', title: 'Security & RBAC', desc: 'Per-school isolation (RLS), granular permissions, full audit trail.' },
  { icon: 'chart', title: 'Reports & Analytics', desc: 'Live dashboards across admissions, academics and finance.' },
];

const STEPS: { n: string; title: string; desc: string }[] = [
  { n: '1', title: 'Register your school', desc: 'Pick a plan and submit your details — takes a couple of minutes.' },
  { n: '2', title: 'We verify & provision', desc: 'We confirm your payment and provision your private school node + license.' },
  { n: '3', title: 'Sign in & run', desc: 'Your admin signs in at {slug}.ved.com and onboards everyone.' },
];

const TIER_TONE: Record<string, 'neutral' | 'primary' | 'warning'> = { T1: 'primary', T2: 'neutral', T3: 'warning' };

export default function LandingPage() {
  const navigate = useNavigate();
  const { data, isLoading } = usePlans();
  const plans = data?.plans ?? [];

  return (
    <div className="lp">
      <style>{LP_CSS}</style>

      {/* ---- Nav ---- */}
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <Link to="/" className="lp-brand">
            <VMark size={26} />
            <span>VED</span>
          </Link>
          <nav className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login" className="lp-signin">Sign in</Link>
            <Button onClick={() => navigate('/signup')}>Register your school</Button>
          </nav>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="lp-hero">
        <div className="lp-container">
          <span className="lp-tag"><span className="lp-dot" /> Local-first school & college management</span>
          <h1 className="lp-h1">Run your entire school on <span className="lp-grad">one platform</span></h1>
          <p className="lp-sub">
            VED replaces the patchwork of Excel, Word and Access. Admissions, academics, finance and
            learning — working <strong>offline at your school</strong> and synced to the cloud.
          </p>
          <div className="lp-cta-row">
            <Button onClick={() => navigate('/signup')}>Register your school</Button>
            <Button variant="secondary" onClick={() => navigate('/login')}>Platform sign in</Button>
          </div>
          <div className="lp-trust">
            {['Offline-ready', 'Per-school isolation', 'One login per school', 'Cloud-synced'].map((t) => (
              <span key={t} className="lp-trust-item"><Icon name="shield" size={14} /> {t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <h2 className="lp-h2">Everything a school runs on</h2>
          <p className="lp-lead">One system for every department — no more scattered spreadsheets.</p>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <span className="lp-ficon"><Icon name={f.icon} size={20} /></span>
                <h3 className="lp-ftitle">{f.title}</h3>
                <p className="lp-fdesc">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Local-first band ---- */}
      <section className="lp-band">
        <div className="lp-container lp-band-inner">
          <div>
            <h2 className="lp-h2" style={{ marginTop: 0 }}>Built local-first — offline is the default</h2>
            <p className="lp-lead" style={{ marginBottom: 0 }}>
              Each school runs its own node on the school LAN, so the office keeps working when the
              internet doesn't. Every change is durably synced to the cloud the moment you're back online.
            </p>
          </div>
          <ul className="lp-checklist">
            {['Works fully offline on the school network', 'Durable, replayable cloud sync', 'Per-tenant backups & recovery', 'Signed license validated offline'].map((c) => (
              <li key={c}><span className="lp-check"><Icon name="shield" size={13} /></span>{c}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section id="how" className="lp-section">
        <div className="lp-container">
          <h2 className="lp-h2">Up and running in three steps</h2>
          <div className="lp-grid lp-grid-3">
            {STEPS.map((s) => (
              <Card key={s.n}>
                <span className="lp-step-n">{s.n}</span>
                <h3 className="lp-ftitle">{s.title}</h3>
                <p className="lp-fdesc">{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Pricing ---- */}
      <section id="pricing" className="lp-section">
        <div className="lp-container">
          <h2 className="lp-h2">Simple, transparent pricing</h2>
          <p className="lp-lead">Pick the tier that fits your institution. You can change it later.</p>
          {isLoading && <div className="mt-16"><Spinner /></div>}
          <div className="lp-grid lp-grid-3">
            {plans.map((p: Plan) => (
              <Card key={p.id}>
                <div className="flex gap-8" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</span>
                  <Badge tone={TIER_TONE[p.tier] ?? 'neutral'}>{p.tier}</Badge>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>
                  {p.currency} {p.price.toLocaleString()}
                  <span className="subtle" style={{ fontSize: 13, fontWeight: 400 }}> / {p.billing_cycle.toLowerCase()}</span>
                </div>
                <ul className="lp-plan-list">
                  <li><Icon name="users" size={14} /> {p.seats} seats</li>
                  <li><Icon name="layers" size={14} /> {(p.enabled_modules ?? []).length} modules</li>
                </ul>
                <div className="mt-16">
                  <Button style={{ width: '100%' }} onClick={() => navigate(`/signup/register?plan=${p.id}`)}>Choose {p.name}</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Final CTA ---- */}
      <section className="lp-final">
        <div className="lp-container lp-final-inner">
          <h2 className="lp-h2" style={{ marginTop: 0 }}>Ready to retire the spreadsheets?</h2>
          <p className="lp-lead">Bring your whole school onto VED today.</p>
          <Button onClick={() => navigate('/signup')}>Register your school</Button>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <Link to="/" className="lp-brand"><VMark size={22} /><span>VED</span></Link>
          <span className="subtle">Local-first school & college management.</span>
          <div className="lp-footer-links">
            <Link to="/signup">Register</Link>
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

const LP_CSS = `
.lp { background: var(--surface); color: var(--text); }
.lp a { color: inherit; text-decoration: none; }
.lp-container { max-width: 1080px; margin: 0 auto; padding: 0 24px; }

.lp-nav { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,.82); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
.lp-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
.lp-brand { display: inline-flex; align-items: center; gap: 9px; font-weight: 800; font-size: 19px; }
.lp-nav-links { display: flex; align-items: center; gap: 22px; font-size: 14px; }
.lp-nav-links a { color: var(--text-muted); }
.lp-nav-links a:hover { color: var(--text); }
.lp-signin { font-weight: 600; }
@media (max-width: 720px) { .lp-nav-links a:not(.lp-signin) { display: none; } }

.lp-hero { padding: 84px 0 64px; text-align: center; background:
  radial-gradient(60% 120% at 50% -10%, var(--primary-weak), transparent 60%); }
.lp-tag { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600;
  color: var(--primary-hover); background: var(--primary-weak); padding: 6px 14px; border-radius: var(--radius-pill); }
.lp-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
.lp-h1 { font-size: 52px; line-height: 1.05; font-weight: 800; letter-spacing: -.02em; margin: 22px auto 0; max-width: 760px; }
.lp-grad { background: linear-gradient(120deg, #00A76F, #00B894); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lp-sub { font-size: 18px; line-height: 1.6; color: var(--text-muted); max-width: 620px; margin: 20px auto 0; }
.lp-cta-row { display: flex; gap: 12px; justify-content: center; margin-top: 30px; flex-wrap: wrap; }
.lp-trust { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-top: 30px; color: var(--text-subtle); font-size: 13px; }
.lp-trust-item { display: inline-flex; align-items: center; gap: 6px; }
.lp-trust-item svg { color: var(--primary); }
@media (max-width: 600px) { .lp-h1 { font-size: 36px; } .lp-sub { font-size: 16px; } }

.lp-section { padding: 64px 0; }
.lp-h2 { font-size: 30px; font-weight: 800; letter-spacing: -.02em; text-align: center; margin: 0 0 8px; }
.lp-lead { text-align: center; color: var(--text-muted); font-size: 16px; margin: 0 auto 32px; max-width: 560px; }
.lp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
.lp-grid-3 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.lp-ficon { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px;
  border-radius: var(--radius); background: var(--primary-weak); color: var(--primary); }
.lp-ftitle { font-size: 16px; font-weight: 700; margin: 14px 0 6px; }
.lp-fdesc { font-size: 14px; line-height: 1.55; color: var(--text-muted); margin: 0; }
.lp-step-n { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px;
  border-radius: 50%; background: var(--primary); color: #fff; font-weight: 800; }

.lp-band { background: var(--bg); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 64px 0; }
.lp-band-inner { display: grid; grid-template-columns: 1.1fr .9fr; gap: 40px; align-items: center; }
.lp-band-inner .lp-h2, .lp-band-inner .lp-lead { text-align: left; margin-left: 0; }
.lp-checklist { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.lp-checklist li { display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 500; }
.lp-check { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
  border-radius: 50%; background: var(--primary); color: #fff; flex-shrink: 0; }
@media (max-width: 760px) { .lp-band-inner { grid-template-columns: 1fr; } }

.lp-plan-list { margin: 14px 0 0; font-size: 14px; list-style: none; padding: 0; display: grid; gap: 8px; }
.lp-plan-list li { display: flex; align-items: center; gap: 8px; color: var(--text-muted); }

.lp-final { padding: 80px 0; text-align: center; background:
  radial-gradient(60% 140% at 50% 120%, var(--primary-weak), transparent 60%); }
.lp-final-inner { display: flex; flex-direction: column; align-items: center; gap: 4px; }

.lp-footer { border-top: 1px solid var(--border); padding: 28px 0; }
.lp-footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: 14px; }
.lp-footer-links { display: flex; gap: 20px; color: var(--text-muted); }
`;
