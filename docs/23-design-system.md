# 23 — Design System (Minimal Tech)

The visual language for every VED frontend surface (web, desktop, mobile). **Minimal
Tech** (adapted from the MUI *Minimal* aesthetic): a flat utility on a soft-gray canvas,
white cards with a near-invisible 1px border + a soft low-opacity shadow (elevated yet
flat), 16px card / 8px control geometry, a geometric sans, and deeply-saturated accents
(emerald / cyan / coral) reserved for key data, status, and graphic hero banners. It is
implemented as design tokens + a small class-based kit in
[`web/src/shared/ui`](../web/src/shared/ui); pages consume the kit, never raw styling.
Both the tenant app and the platform SPA share this one token/kit layer.

## Principles

| Principle | How it shows up |
|---|---|
| **Clean & spacious** | Heavy negative space; borders stripped wherever a shadow or spacing can separate elements instead. Uncluttered, scannable. |
| **Soft depth** | Cards/widgets float on **soft, diffused drop shadows** — no harsh 1px outlines around everything. |
| **Modern geometry** | **16px** on cards, **8px** on controls/nav; pills for badges. |
| **Flat yet elevated** | White cards on a soft-gray canvas, separated by a faint 1px border (`rgba(145,158,171,.16)`) + a soft halo+drop shadow — never harsh outlines. |
| **Strategic color** | Soft-gray background (`#f4f6f8`), white surfaces; deeply-saturated accents reserved for key data, status, and hero banners. |
| **Hero focal points** | Deep-gradient banners (midnight teal → forest) with white type + neon tags break the flat grid. |
| **Micro-data viz** | Axis-less **sparklines** (pure color blocks) inside metric cards; growth **deltas** (arrow + colored % + muted context). |
| **Crisp type & icons** | Geometric sans (Public Sans / Plus Jakarta / Inter); uniform **thin-line outline icons** (1.75 stroke, `currentColor`). |

## Tokens (CSS variables — `shared/ui/GlobalStyles.tsx`)

```
Surfaces   --bg #f4f6f8 · --surface #fff · --surface-2 #f9fafb · --border rgba(145,158,171,.16)
Text       --text #212b36 · --text-muted #637381 · --text-subtle #919eab
Accent     --primary #00a76f (emerald) · --primary-hover #007867 · --primary-weak/-tint (mint)
Semantic   --info #00b8d9 (cyan) · --warning #ffab00 (amber) · --danger #ff5630 (coral) (+ *-weak)
Radius     --radius-sm 8 · --radius 10 · --radius-lg 16 · --radius-pill 999
Shadow     --shadow-xs/-sm/(default)/-lg = faint outline halo + soft diffused drop
Type       --font: "Public Sans"/"Plus Jakarta Sans"/Inter/system
Kit        Button · Card · PageHeader · StatCard (spark+delta) · Sparkline · GrowthDelta ·
           HeroBanner · Select · Badge (neutral/primary/success/warning/info) · Spinner · Icon
```

Accent colors are **rationed**: primary buttons, the active nav item, focus rings, and
headline stat numbers. Everything else is neutral. This is what makes the vibrant
color read as "important data," not decoration.

## The kit (`shared/ui`)

| Export | Use |
|---|---|
| `Button` (`primary`/`secondary`/`ghost`) | actions; primary carries the accent |
| `Card` (`flat?`) | the floating surface — radius + soft shadow, no border |
| `PageHeader` | page title + subtitle, consistent spacing |
| `StatCard` | a **key data point** (large number, optional accent) |
| `Badge` (`neutral`/`primary`/`success`/`warning`) | status pills |
| `Spinner` | loading |
| `Icon` (`name`, `size`) | thin-line outline glyphs |
| `GlobalStyles` | injects the tokens + component classes once at app root |

Component styling lives in the class names (`.btn`, `.card`, `.nav-item`, `.stat`, …)
defined in `GlobalStyles`, so visuals are centralized and a token change restyles the
whole app.

## Why this scales to every page

Routing is **manifest-driven** ([22](./22-frontend.md)): pages render through the shared
`AppShell` + `PlannedPage`, and built pages use the kit. So adopting the design system
in the shell, the kit, and the placeholder makes **all ~100 planned pages** present in
the new style immediately — each real page just swaps `PlannedPage` for kit-built
content. No per-page restyle pass is ever needed.

## Rules for building a page

- Compose from `@/shared/ui` only — don't hand-roll buttons, cards, or colors.
- Reach for **spacing and soft shadow** before borders.
- Use accent color **only** for the primary action and the one or two key metrics.
- Icons come from `Icon`; add new glyphs to `Icon.tsx`, keep the 1.75 outline weight.
- New visual patterns become a kit component + a token/class — never a one-off inline style.
