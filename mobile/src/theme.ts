// Shared visual tokens — a lightweight echo of the web "Minimal Tech" system (docs/23)
// so the mobile app feels like the same product. Kept tiny on purpose.
export const theme = {
  color: {
    bg: '#F1F5F9',
    surface: '#FFFFFF',
    border: '#E2E8F0',
    text: '#0F172A',
    muted: '#64748B',
    primary: '#0EA5A4', // emerald/cyan
    primaryText: '#FFFFFF',
    danger: '#E11D48',
    success: '#059669',
    accentBg: '#ECFEFF',
  },
  radius: 16,
  space: (n: number) => n * 4,
};

export type Theme = typeof theme;
