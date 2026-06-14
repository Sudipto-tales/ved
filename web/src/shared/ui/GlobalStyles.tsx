// The VED design system — "Premium SaaS Minimalism": spacious, soft diffused
// shadows, rounded geometry (12–16px), muted neutral surfaces with vibrant accents
// reserved for key data + actions, crisp sans-serif type. Documented in
// docs/23-design-system.md. Injected once at the app root (no .css import needed).
const css = `
:root{
  /* Neutral surfaces (off-white / soft gray) */
  --bg:#f6f7f9;
  --surface:#ffffff;
  --surface-2:#fbfcfd;
  --border:#eceef1;
  --border-strong:#e3e6ea;

  /* Text */
  --text:#101828;
  --text-muted:#667085;
  --text-subtle:#98a2b3;

  /* Vibrant accent — reserved for key data + primary actions */
  --primary:#6366f1;
  --primary-hover:#4f46e5;
  --primary-weak:#eef2ff;
  --success:#16a34a; --success-weak:#ecfdf3;
  --warning:#d97706; --warning-weak:#fffaeb;
  --danger:#dc2626;  --danger-weak:#fef3f2;

  /* Rounded geometry */
  --radius-sm:8px; --radius:12px; --radius-lg:16px; --radius-pill:999px;

  /* Soft, diffused shadows (gentle float) */
  --shadow-xs:0 1px 2px rgba(16,24,40,.05);
  --shadow-sm:0 1px 3px rgba(16,24,40,.06),0 1px 2px rgba(16,24,40,.04);
  --shadow:0 6px 20px -6px rgba(16,24,40,.10),0 2px 6px -2px rgba(16,24,40,.05);
  --shadow-lg:0 18px 44px -12px rgba(16,24,40,.16);

  --font:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}

*{box-sizing:border-box;}
html,body,#root{height:100%;}
body{
  margin:0;font-family:var(--font);color:var(--text);background:var(--bg);
  font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;
}
h1,h2,h3,h4{margin:0;font-weight:650;letter-spacing:-.012em;color:var(--text);}
a{color:inherit;text-decoration:none;}
input,button,textarea,select{font:inherit;}
code{font-family:var(--mono);font-size:.92em;}

/* Card — soft floating surface, generous radius, no harsh border */
.card{background:var(--surface);border-radius:var(--radius-lg);box-shadow:var(--shadow);padding:24px;}
.card--flat{box-shadow:var(--shadow-sm);}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;
  padding:0 16px;border-radius:var(--radius);border:1px solid transparent;font-weight:600;
  font-size:14px;cursor:pointer;transition:background .15s,box-shadow .15s,opacity .15s,color .15s;}
.btn:disabled{opacity:.5;cursor:not-allowed;}
.btn-primary{background:var(--primary);color:#fff;box-shadow:var(--shadow-xs);}
.btn-primary:hover:not(:disabled){background:var(--primary-hover);}
.btn-secondary{background:var(--surface);color:var(--text);border-color:var(--border-strong);}
.btn-secondary:hover:not(:disabled){background:var(--surface-2);}
.btn-ghost{background:transparent;color:var(--text-muted);}
.btn-ghost:hover:not(:disabled){background:var(--primary-weak);color:var(--primary-hover);}

/* Inputs */
.input{height:40px;width:100%;padding:0 12px;border-radius:var(--radius);
  border:1px solid var(--border-strong);background:var(--surface);color:var(--text);
  transition:border-color .15s,box-shadow .15s;}
.input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-weak);}
.input::placeholder{color:var(--text-subtle);}

/* Text helpers */
.muted{color:var(--text-muted);} .subtle{color:var(--text-subtle);}
.label{font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;}

/* Page header */
.page-header{margin-bottom:24px;}
.page-header h1{font-size:24px;}
.page-header p{margin:6px 0 0;color:var(--text-muted);font-size:14px;max-width:60ch;}

/* Stat — vibrant pop reserved for key data */
.stat{display:flex;flex-direction:column;gap:6px;}
.stat-label{font-size:13px;color:var(--text-muted);}
.stat-value{font-size:30px;font-weight:700;letter-spacing:-.02em;}
.stat-accent{color:var(--primary);}

/* Badge / pill */
.badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;
  border-radius:var(--radius-pill);font-size:12px;font-weight:600;}
.badge-neutral{background:var(--surface-2);color:var(--text-muted);border:1px solid var(--border);}
.badge-primary{background:var(--primary-weak);color:var(--primary-hover);}
.badge-success{background:var(--success-weak);color:var(--success);}
.badge-warning{background:var(--warning-weak);color:var(--warning);}

/* App shell */
.shell{display:flex;min-height:100vh;}
.sidebar{width:264px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);
  padding:20px 16px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto;}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;padding:4px 8px;}
.brand-badge{width:30px;height:30px;border-radius:9px;background:var(--primary);color:#fff;
  display:grid;place-items:center;box-shadow:var(--shadow-xs);}
.nav-group{margin-top:18px;}
.nav-group-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--text-subtle);padding:0 8px 6px;}
.nav-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;
  color:var(--text-muted);font-size:14px;font-weight:500;cursor:pointer;transition:background .12s,color .12s;}
.nav-item:hover{background:var(--surface-2);color:var(--text);}
.nav-item.active{background:var(--primary-weak);color:var(--primary-hover);font-weight:600;}
.nav-item .tier{margin-left:auto;font-size:10px;font-weight:600;color:var(--text-subtle);}
.nav-icon{width:18px;height:18px;flex-shrink:0;color:currentColor;}
.main{flex:1;padding:32px 36px;max-width:1180px;}
.spacer{flex:1;}

/* Auth */
.auth-wrap{min-height:100vh;display:grid;place-items:center;padding:24px;
  background:radial-gradient(1100px 560px at 50% -12%, #eef2ff 0%, var(--bg) 58%);}
.auth-card{width:404px;max-width:92vw;}

/* Empty / planned state */
.empty{border:1px dashed var(--border-strong);border-radius:var(--radius-lg);
  padding:28px;background:var(--surface-2);color:var(--text-muted);}
.empty ul{margin:14px 0 0;padding-left:18px;line-height:2;}
.kbd{font-family:var(--mono);font-size:12px;background:var(--surface);
  border:1px solid var(--border-strong);border-radius:6px;padding:1px 6px;}

/* List rows */
.row{display:flex;align-items:center;justify-content:space-between;padding:14px 2px;border-bottom:1px solid var(--border);}
.row:last-child{border-bottom:none;}

/* Layout utilities */
.flex{display:flex;align-items:center;}
.between{justify-content:space-between;}
.col{display:flex;flex-direction:column;}
.gap-8{gap:8px;} .gap-12{gap:12px;} .gap-16{gap:16px;} .gap-24{gap:24px;}
.mt-8{margin-top:8px;} .mt-16{margin-top:16px;} .mt-24{margin-top:24px;}
.grid-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;}

/* Spinner */
.spinner{width:16px;height:16px;border:2px solid var(--border-strong);border-top-color:var(--primary);
  border-radius:50%;display:inline-block;animation:ved-spin .7s linear infinite;}
@keyframes ved-spin{to{transform:rotate(360deg);}}

/* Tenant picker options */
.tenant-option{display:flex;align-items:center;justify-content:space-between;width:100%;
  padding:14px 16px;border-radius:var(--radius);border:1px solid var(--border-strong);
  background:var(--surface);color:var(--text);cursor:pointer;text-align:left;
  transition:border-color .15s,box-shadow .15s,background .15s;}
.tenant-option:hover{border-color:var(--primary);background:var(--primary-weak);box-shadow:var(--shadow-xs);}

/* Help: the small ? affordance next to a title or section */
.page-title-row{display:flex;align-items:center;gap:8px;}
.help-dot{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
  border-radius:var(--radius-pill);border:1px solid var(--border-strong);background:var(--surface);
  color:var(--text-subtle);cursor:help;flex-shrink:0;transition:background .15s,color .15s,border-color .15s;}
.help-dot:hover{background:var(--primary-weak);color:var(--primary-hover);border-color:var(--primary);}
.help-dot svg{width:14px;height:14px;}

/* Help pages */
.help-toc{display:grid;gap:10px;}
.help-toc-item{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border-radius:var(--radius);
  border:1px solid var(--border);background:var(--surface);transition:border-color .15s,box-shadow .15s;}
.help-toc-item:hover{border-color:var(--primary);box-shadow:var(--shadow-xs);}
.help-toc-item .t{font-weight:650;color:var(--text);}
.help-toc-item .d{font-size:13px;color:var(--text-muted);}
.help-back{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);
  margin-bottom:14px;cursor:pointer;}
.help-back:hover{color:var(--primary-hover);}
.help-prose{color:var(--text);max-width:68ch;}
.help-prose h3{font-size:16px;margin:22px 0 8px;}
.help-prose h3:first-child{margin-top:0;}
.help-prose p{margin:0 0 12px;color:var(--text);}
.help-prose ul,.help-prose ol{margin:0 0 14px;padding-left:20px;line-height:1.9;color:var(--text);}
.help-prose li::marker{color:var(--text-subtle);}
.help-prose strong{font-weight:650;}
.help-prose .tip{border-left:3px solid var(--primary);background:var(--primary-weak);
  padding:12px 14px;border-radius:0 var(--radius) var(--radius) 0;margin:0 0 14px;color:var(--text);}
`;

export function GlobalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
