# 23 — Design System (Premium SaaS Minimalism)

The visual language for every VED frontend surface (web, desktop, mobile). Also called
**Semi-Flat Design**: clean and spacious, soft depth, modern rounded geometry, muted
neutrals with strategic vibrant accents, and crisp type + thin-line icons. It is
implemented as design tokens + a small class-based kit in
[`web/src/shared/ui`](../web/src/shared/ui); pages consume the kit, never raw styling.

## Principles

| Principle | How it shows up |
|---|---|
| **Clean & spacious** | Heavy negative space; borders stripped wherever a shadow or spacing can separate elements instead. Uncluttered, scannable. |
| **Soft depth** | Cards/widgets float on **soft, diffused drop shadows** — no harsh 1px outlines around everything. |
| **Modern geometry** | Highly **rounded corners** (12–16px on cards, 10–12px on controls; pills for badges). Friendly, Apple-esque. |
| **Strategic color** | **Muted neutral** backgrounds (off-white `#f6f7f9`, white surfaces) to prevent eye strain; **vibrant accent** (indigo) reserved strictly for key data points and primary actions. |
| **Crisp type & icons** | Clean sans-serif system stack; uniform **thin-line outline icons** (1.75 stroke, `currentColor`). |

## Tokens (CSS variables — `shared/ui/GlobalStyles.tsx`)

```
Surfaces   --bg #f6f7f9 · --surface #fff · --surface-2 #fbfcfd · --border #eceef1
Text       --text #101828 · --text-muted #667085 · --text-subtle #98a2b3
Accent     --primary #6366f1 · --primary-hover #4f46e5 · --primary-weak #eef2ff
Semantic   --success #16a34a · --warning #d97706 · --danger #dc2626 (+ *-weak tints)
Radius     --radius-sm 8 · --radius 12 · --radius-lg 16 · --radius-pill 999
Shadow     --shadow-xs / -sm / (default, diffused) / -lg     ← soft, never harsh
Type       --font: system sans-serif (Inter / -apple-system / Segoe UI…)
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
