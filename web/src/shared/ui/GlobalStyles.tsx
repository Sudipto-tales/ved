// The VED design system — "Minimal Tech" (adapted from the MUI Minimal aesthetic):
// flat utility on a soft-gray canvas, white cards with a near-invisible 1px border + a
// soft low-opacity shadow (elevated yet flat), 16px card / 8px control geometry, a
// geometric sans, and deeply-saturated accents (emerald / cyan / coral) reserved for
// key data, status, and graphic hero banners. Documented in docs/23-design-system.md.
// Injected once at the app root. Both the tenant app and the platform SPA consume this.
const css = `
:root{
  /* Canvas — soft gray background, white surfaces */
  --bg:#f4f6f8;
  --surface:#ffffff;
  --surface-2:#f9fafb;
  --border:rgba(145,158,171,.16);
  --border-strong:rgba(145,158,171,.32);

  /* Text — deep charcoal, steel-gray muted, light disabled */
  --text:#212b36;
  --text-muted:#637381;
  --text-subtle:#919eab;

  /* Accents — emerald primary; cyan info; amber warning; coral danger */
  --primary:#00a76f;        --primary-hover:#007867;
  --primary-weak:rgba(0,167,111,.08); --primary-tint:rgba(0,167,111,.16);
  --info:#00b8d9;           --info-weak:rgba(0,184,217,.12);
  --success:#00a76f;        --success-weak:rgba(0,167,111,.16);
  --warning:#ffab00;        --warning-weak:rgba(255,171,0,.16);
  --danger:#ff5630;         --danger-weak:rgba(255,86,48,.16);
  --accent:var(--primary);  --accent-tint:var(--primary-weak);

  /* Geometry — 16px cards, 8px controls */
  --radius-sm:8px; --radius:10px; --radius-lg:16px; --radius-pill:999px;

  /* Shadows — Minimal: a faint outline halo + a soft diffused drop */
  --shadow-xs:0 1px 2px rgba(145,158,171,.16);
  --shadow-sm:0 0 2px 0 rgba(145,158,171,.2),0 1px 4px -1px rgba(145,158,171,.12);
  --shadow:0 0 2px 0 rgba(145,158,171,.2),0 12px 24px -4px rgba(145,158,171,.12);
  --shadow-lg:0 0 2px 0 rgba(145,158,171,.2),0 20px 40px -4px rgba(145,158,171,.16);

  --font:"Public Sans","Plus Jakarta Sans","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}

*{box-sizing:border-box;}
html,body,#root{height:100%;}
body{
  margin:0;font-family:var(--font);color:var(--text);background:var(--bg);
  font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;
}
h1,h2,h3,h4{margin:0;font-weight:700;letter-spacing:-.01em;color:var(--text);}
a{color:inherit;text-decoration:none;}
input,button,textarea,select{font:inherit;}
code{font-family:var(--mono);font-size:.92em;}

/* Card — white, 16px radius, borderless, soft elevation only (no outlines per design rule) */
.card{background:var(--surface);border-radius:var(--radius-lg);
  box-shadow:var(--shadow);padding:24px;}
.card--flat{box-shadow:var(--shadow-sm);}

/* Buttons — 8px radius, emerald primary */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;
  padding:0 16px;border-radius:var(--radius-sm);border:1px solid transparent;font-weight:600;
  font-size:14px;cursor:pointer;transition:background .15s,box-shadow .15s,opacity .15s,color .15s;}
.btn:disabled{opacity:.5;cursor:not-allowed;}
.btn-primary{background:var(--primary);color:#fff;box-shadow:0 8px 16px -4px rgba(0,167,111,.24);}
.btn-primary:hover:not(:disabled){background:var(--primary-hover);}
.btn-secondary{background:var(--surface);color:var(--text);border-color:var(--border-strong);}
.btn-secondary:hover:not(:disabled){background:var(--surface-2);}
.btn-ghost{background:transparent;color:var(--text-muted);}
.btn-ghost:hover:not(:disabled){background:var(--primary-weak);color:var(--primary-hover);}

/* Inputs + select */
.input{height:40px;width:100%;padding:0 12px;border-radius:var(--radius-sm);
  border:1px solid var(--border-strong);background:var(--surface);color:var(--text);
  transition:border-color .15s,box-shadow .15s;}
.input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-weak);}
.input::placeholder{color:var(--text-subtle);}
.select-wrap{position:relative;display:inline-flex;align-items:center;}
.select-wrap select{appearance:none;-webkit-appearance:none;padding-right:34px;cursor:pointer;width:auto;}
.select-wrap .chev{position:absolute;right:10px;pointer-events:none;color:var(--text-subtle);width:16px;height:16px;}

/* Text helpers */
.muted{color:var(--text-muted);} .subtle{color:var(--text-subtle);}
.label{font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;}

/* Page header */
.page-header{margin-bottom:24px;}
.page-header h1{font-size:24px;}
.page-header p{margin:6px 0 0;color:var(--text-muted);font-size:14px;max-width:60ch;}

/* Stat — big bold numeral, light label */
.stat{display:flex;flex-direction:column;gap:6px;}
.stat-top{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.stat-label{font-size:14px;font-weight:600;color:var(--text);}
.stat-value{font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1.1;}
.stat-accent{color:var(--primary);}
/* Stat card — tinted icon chip carries the color identity (no borders/rails) */
.statcard{position:relative;overflow:hidden;}
.stat-chip{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;}
.stat-chip svg{width:20px;height:20px;}
/* Section card with a tinted header strip + leading icon */
.section-head{display:flex;align-items:center;gap:10px;margin-bottom:16px;}
.section-ico{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none;}
.section-ico svg{width:18px;height:18px;}
.section-head h3{font-size:15px;font-weight:700;}
.section-head .section-sub{font-size:12.5px;color:var(--text-muted);margin-top:1px;}
/* Collapsible card (Settings) */
.collapsible-head{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;
  cursor:pointer;padding:18px 22px;}
.collapsible-head h3{font-size:15px;font-weight:700;}
.collapsible-chevron{color:var(--text-subtle);transition:transform .18s ease;font-size:14px;}
.collapsible-chevron.open{transform:rotate(180deg);}
.collapsible-body{padding:4px 22px 22px;}
/* DataTable search box (borderless pill, shadow rule keeps it card-consistent) */
.table-search{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;margin-bottom:14px;
  max-width:340px;border-radius:var(--radius-pill);background:var(--surface-2);color:var(--text-subtle);}
.table-search input{flex:1;min-width:0;border:none;background:transparent;outline:none;color:var(--text);}

/* Growth delta — arrow + colored % + muted context (no pill, like Minimal) */
.delta{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;margin-top:10px;}
.delta .arrow{width:18px;height:18px;border-radius:var(--radius-pill);display:grid;place-items:center;}
.delta-up{color:var(--success);} .delta-up .arrow{background:var(--success-weak);}
.delta-down{color:var(--danger);} .delta-down .arrow{background:var(--danger-weak);}
.delta .ctx{color:var(--text-subtle);font-weight:400;}

/* Badge / pill — soft tint + status color */
.badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;
  border-radius:var(--radius-pill);font-size:12px;font-weight:700;}
.badge-neutral{background:var(--surface-2);color:var(--text-muted);border:1px solid var(--border);}
.badge-primary{background:var(--primary-weak);color:var(--primary-hover);}
.badge-success{background:var(--success-weak);color:var(--primary-hover);}
.badge-warning{background:var(--warning-weak);color:#b76e00;}
.badge-info{background:var(--info-weak);color:#006c9c;}
.badge-danger{background:var(--danger-weak);color:#b71d18;}

/* App shell */
.shell{display:flex;min-height:100vh;}
.sidebar{width:280px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);
  padding:20px 16px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto;
  transition:width .18s ease;}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;padding:4px 8px;white-space:nowrap;}
.brand-badge{width:32px;height:32px;border-radius:8px;background:var(--primary);color:#fff;flex-shrink:0;
  display:grid;place-items:center;box-shadow:0 8px 16px -4px rgba(0,167,111,.24);}
.nav-group{margin-top:18px;}
.nav-group-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--text-subtle);padding:0 8px 6px;white-space:nowrap;overflow:hidden;}
.nav-item{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:var(--radius-sm);
  color:var(--text-muted);font-size:14px;font-weight:600;cursor:pointer;transition:background .12s,color .12s;
  white-space:nowrap;overflow:hidden;}
.nav-item:hover{background:var(--surface-2);color:var(--text);}
.nav-item.active{background:var(--primary-weak);color:var(--primary-hover);}
.nav-item .tier{margin-left:auto;font-size:10px;font-weight:700;color:var(--text-subtle);}
.nav-icon{width:20px;height:20px;flex-shrink:0;color:currentColor;}

/* Content column (topbar stacked over the scrolling main) */
.content{flex:1;min-width:0;display:flex;flex-direction:column;}
.main{flex:1;min-width:0;padding:32px 36px;}
.spacer{flex:1;}

/* Collapsed sidebar — icon rail. The shell toggles .nav-collapsed; labels are hidden in
   JSX, here we just narrow the rail and center the glyphs. */
.shell.nav-collapsed .sidebar{width:76px;padding:20px 12px;align-items:center;}
.shell.nav-collapsed .sidebar .brand{justify-content:center;}
.shell.nav-collapsed .sidebar .nav-group{width:100%;}
.shell.nav-collapsed .sidebar .nav-item{justify-content:center;padding:10px 0;gap:0;width:100%;}
.shell.nav-collapsed .sidebar .nav-group-label{text-align:center;}

/* Topbar — sticky utility bar above the page (search + actions + avatar) */
.topbar{height:64px;flex-shrink:0;display:flex;align-items:center;gap:10px;padding:0 24px;
  background:transparent;position:sticky;top:0;z-index:20;}
.topbar-search{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;min-width:200px;
  border-radius:var(--radius-pill);background:var(--surface-2);border:1px solid var(--border);
  color:var(--text-subtle);}
.topbar-search input{border:none;background:transparent;outline:none;flex:1;color:var(--text);min-width:0;}
.topbar-search .kbd{margin-left:auto;}
.icon-btn{position:relative;display:grid;place-items:center;width:40px;height:40px;border-radius:var(--radius-pill);
  border:none;background:transparent;color:var(--text-muted);cursor:pointer;transition:background .12s,color .12s;}
.icon-btn:hover{background:var(--surface-2);color:var(--text);}
.icon-badge{position:absolute;top:6px;right:6px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;
  background:var(--danger);color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center;
  box-shadow:0 0 0 2px var(--surface);}
.avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800;
  color:#fff;background:linear-gradient(135deg,var(--primary),var(--info));border:none;
  box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--primary-tint);cursor:pointer;}

/* Dropdown menu (topbar profile / language) — borderless, shadow only */
.menu{position:absolute;top:calc(100% + 8px);right:0;min-width:208px;background:var(--surface);
  border-radius:var(--radius);box-shadow:var(--shadow-lg, var(--shadow));padding:6px;z-index:50;}
.menu-head{padding:9px 12px 11px;display:flex;flex-direction:column;gap:2px;}
.menu-head b{font-size:13.5px;}
.menu-head span{font-size:12px;color:var(--text-muted);}
.menu-sep{height:1px;background:var(--border);margin:4px 6px;}
.menu-item{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border-radius:var(--radius-sm);
  background:none;border:0;cursor:pointer;color:var(--text-muted);font-size:13.5px;font-weight:600;text-align:left;}
.menu-item:hover{background:var(--surface-2);color:var(--text);}
.menu-item.active{color:var(--text);}
.menu-item svg{width:16px;height:16px;}

/* topbar-search as a button (opens the command palette) — match the input look */
button.topbar-search{cursor:pointer;text-align:left;font:inherit;}
button.topbar-search:hover{border-color:var(--border-strong);color:var(--text);}
.topbar-search .ts-placeholder{flex:1;min-width:0;color:var(--text-subtle);}

/* Command palette (global search) — backdrop + centered panel, shadow only */
.cmdk-backdrop{position:fixed;inset:0;z-index:100;display:flex;align-items:flex-start;justify-content:center;
  padding:12vh 16px 16px;background:rgba(15,28,26,.34);backdrop-filter:blur(2px);}
.cmdk-panel{width:600px;max-width:96vw;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;
  background:var(--surface);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg, var(--shadow));}
.cmdk-input-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);
  color:var(--text-subtle);}
.cmdk-input{flex:1;min-width:0;border:none;background:transparent;outline:none;color:var(--text);font-size:15px;}
.cmdk-results{overflow-y:auto;padding:6px;}
.cmdk-empty{padding:28px 16px;text-align:center;color:var(--text-muted);font-size:13.5px;}
.cmdk-group{padding:4px 0;}
.cmdk-group-label{padding:6px 12px 4px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--text-subtle);}
.cmdk-item{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:0;border-radius:var(--radius-sm);
  background:none;cursor:pointer;color:var(--text);font-size:14px;text-align:left;}
.cmdk-item.active{background:var(--primary-weak);color:var(--primary-hover);}
.cmdk-item-icon{width:18px;height:18px;flex-shrink:0;color:var(--text-subtle);}
.cmdk-item.active .cmdk-item-icon{color:var(--primary-hover);}
.cmdk-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}
.cmdk-item-sub{flex-shrink:0;color:var(--text-muted);font-size:12.5px;max-width:45%;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.cmdk-footer{display:flex;gap:18px;padding:10px 16px;border-top:1px solid var(--border);
  color:var(--text-subtle);font-size:12px;}
.cmdk-footer .kbd{margin-right:6px;}

/* Hero banner — deep organic gradient, white type, optional CTA (Minimal welcome card) */
.hero{position:relative;overflow:hidden;border-radius:var(--radius-lg);padding:40px;color:#fff;
  background:linear-gradient(135deg,#0c4a3e 0%,#103b46 60%,#0a2e3a 100%);}
.hero h2{color:#fff;font-size:24px;font-weight:800;}
.hero p{color:rgba(255,255,255,.72);margin:10px 0 22px;max-width:46ch;}
.hero .btn-primary{box-shadow:none;}
.hero-tag{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:var(--radius-pill);
  background:rgba(0,167,111,.24);color:#5be49b;font-size:12px;font-weight:700;letter-spacing:.04em;}

/* Sparkline (bar) — pure color blocks, no axes */
.spark{display:inline-flex;align-items:flex-end;gap:3px;height:40px;}
.spark span{width:6px;border-radius:3px;background:currentColor;opacity:.9;}

/* Auth */
.auth-wrap{min-height:100vh;display:grid;place-items:center;padding:24px;
  background:radial-gradient(1100px 560px at 50% -12%, rgba(0,167,111,.10) 0%, var(--bg) 58%);}
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

/* Data table — clean, borderless rows, soft header */
.table{width:100%;border-collapse:collapse;font-size:14px;}
.table th{text-align:left;font-size:12px;font-weight:700;letter-spacing:.02em;color:var(--text-subtle);
  text-transform:uppercase;padding:0 14px 10px;border-bottom:1px solid var(--border);}
.table td{padding:14px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:middle;}
.table tr:last-child td{border-bottom:none;}
.table tbody tr{transition:background .12s;}
.table tbody tr:hover{background:var(--surface-2);}
.table .num{text-align:right;font-variant-numeric:tabular-nums;}
.table-empty{padding:40px 14px;text-align:center;color:var(--text-muted);}

/* Toolbar — page actions / filters row */
.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
.toolbar .grow{flex:1;}

/* Field — label + control */
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;}
.field > label{font-size:12px;font-weight:600;color:var(--text-muted);}
.field .hint{font-size:12px;color:var(--text-subtle);}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;}

/* Tabs */
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:20px;}
.tab{padding:10px 14px;font-size:14px;font-weight:600;color:var(--text-muted);cursor:pointer;
  border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .12s,border-color .12s;}
.tab:hover{color:var(--text);}
.tab.active{color:var(--primary-hover);border-bottom-color:var(--primary);}

/* Empty state (lighter than .empty dashed box) */
.emptystate{display:flex;flex-direction:column;align-items:center;gap:6px;padding:48px 16px;text-align:center;}
.emptystate .es-icon{width:44px;height:44px;border-radius:var(--radius);display:grid;place-items:center;
  background:var(--primary-weak);color:var(--primary);margin-bottom:6px;}
.emptystate .es-title{font-weight:700;color:var(--text);}
.emptystate .es-desc{font-size:13px;color:var(--text-muted);max-width:42ch;}

/* Layout utilities */
.flex{display:flex;align-items:center;}
.between{justify-content:space-between;}
.col{display:flex;flex-direction:column;}
.gap-8{gap:8px;} .gap-12{gap:12px;} .gap-16{gap:16px;} .gap-24{gap:24px;}
.mt-8{margin-top:8px;} .mt-16{margin-top:16px;} .mt-24{margin-top:24px;}
.grid-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;}

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
.help-toc-item .t{font-weight:700;color:var(--text);}
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
.help-prose strong{font-weight:700;}
.help-prose .tip{border-left:3px solid var(--primary);background:var(--primary-weak);
  padding:12px 14px;border-radius:0 var(--radius) var(--radius) 0;margin:0 0 14px;color:var(--text);}
`;

export function GlobalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
