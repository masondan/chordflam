# Flam Family - Design Quick Reference for Developers

**Use this while building.** Copy-paste ready. No deep dives needed.

---

## CSS Variables (Copy-Paste)

```css
:root {
  /* Brand & Interactive */
  --accent-brand: #5422b0;              /* Primary purple */
  --bg-toggle-active: #555555;          /* Secondary toggle active */
  --color-highlight: #f0e6f7;           /* Lavender highlight */
  
  /* Text */
  --text-primary: #1f1f1f;              /* Body text */
  --text-secondary: #777777;            /* Helper text, disabled */
  
  /* Background */
  --bg-main: #efefef;                   /* App background (subtle grey) */
  --bg-white: #ffffff;                  /* Cards, panels, inputs */
  
  /* Borders */
  --color-border: #e0e0e0;              /* Inactive borders */
  --color-border-active: #999999;       /* Focus/active borders */
  
  /* Icons */
  --color-icon-default: #1f1f1f;        /* Default icon color */
  --color-icon-active-bg: #5422b0;      /* Active icon background */
  --color-icon-active-text: #ffffff;    /* Active icon text */
  --color-icon-border: #5422b0;         /* Icon button border */
}
```

---

## Typography (Use These Sizes)

| Use | CSS Variable | Size | Weight |
|-----|------|------|--------|
| Page Title | `--font-size-xl` | 1.5rem (24px) | 700 |
| Section Title | `--font-size-larger` | 1.25rem (20px) | 700 |
| Subtitle | `--font-size-lg` | 1.125rem (18px) | 700 |
| Body Text | `--font-size-base` | 1rem (16px) | 400 |
| Small Label | `--font-size-sm` | 0.875rem (14px) | 400 |
| Caption | `--font-size-xs` | 0.75rem (12px) | 400 |

**Font**: `--font-family-base` (Inter, system fallback)
**Line Height**: `--line-height-normal` (1.5) for body, `--line-height-tight` (1.2) for headings

---

## Spacing (Always Use Variables)

```css
--spacing-xs: 0.375rem   /* 6px - tight */
--spacing-sm: 0.625rem   /* 10px - small gaps */
--spacing-md: 1rem       /* 16px - default padding */
--spacing-lg: 1.25rem    /* 20px - section spacing */
--spacing-xl: 1.75rem    /* 28px - large gaps */
```

**Rule**: Never hardcode `8px`, `12px`, `18px`, etc. Use the scale above.

---

## Border Radius (Use These Only)

```css
--radius-sm: 6px         /* Inputs, small buttons */
--radius-md: 8px         /* Most buttons, containers */
--radius-lg: 12px        /* Cards, panels */
--radius-xl: 16px        /* Modals, large containers */
--radius-round: 9999px   /* Circles & pills */
```

**All borders**: `1px solid` (never 2px, 3px, or custom values)

---

## Button Patterns

### Primary Button
```css
background: var(--accent-brand);      /* #5422b0 */
color: #ffffff;
padding: var(--spacing-sm) var(--spacing-md);
border-radius: var(--radius-md);
border: none;
```

### Secondary Button
```css
background: var(--bg-white);
color: var(--text-primary);
padding: var(--spacing-sm) var(--spacing-md);
border-radius: var(--radius-md);
border: 1px solid var(--color-border);
```

### Secondary Button (Active)
```css
background: var(--bg-toggle-active);  /* #555555 */
color: #ffffff;
border: 1px solid var(--bg-toggle-active);
```

### Icon Button (Header Nav)
```css
width: 36px;
height: 36px;
border-radius: 50%;
border: 1px solid var(--color-icon-border);
background: transparent;
color: var(--text-secondary);
```

### Icon Button (Active)
```css
background: var(--color-icon-active-bg);
border: 1px solid var(--color-icon-active-bg);
color: var(--color-icon-active-text);
```

---

## Form Inputs

```css
border: 1px solid var(--color-border);
border-radius: var(--radius-md);
padding: var(--spacing-sm);
background: var(--bg-white);
font-family: inherit;
min-height: 48px;  /* Touch-friendly */

/* Focus state */
&:focus {
  border-color: var(--color-border-active);
  outline: none;
}
```

---

## Header

- **Height**: 56px
- **Padding**: `var(--spacing-md)` (16px)
- **Background**: `var(--bg-white)`
- **Border Bottom**: `1px solid var(--color-border-active)`
- **Layout**: Flex, space-between
- **Logo Height**: 32px

---

## Shadows (Optional)

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
```

Use sparingly. Rely on borders & background color first.

---

## Transitions

```css
--transition-fast: 150ms ease;    /* Button hover, toggles */
--transition-normal: 200ms ease;  /* Panel open/close */
```

---

## Z-Index Layers

```css
auto              /* Normal content */
50                /* Dropdowns */
100               /* Header */
200               /* Modal overlay */
210               /* Modal/drawer */
220               /* Tooltip */
```

---

## Mobile-First Approach

- **Default**: Mobile styles (< 480px)
- **Desktop**: 768px+ breakpoint
- **Max width**: 480px on desktop (centered)
- **Touch targets**: Minimum 44–48px

---

## Accessibility Essentials

- ✓ Semantic HTML (`<button>`, `<nav>`, `<form>`)
- ✓ Keyboard navigation (Tab, Enter, Escape)
- ✓ Focus visible (border color change + thickness increase)
- ✓ ARIA labels on icon buttons
- ✓ Text contrast ≥ 4.5:1
- ✓ Touch targets ≥ 44px

---

## Common Mistakes (Don't Do These)

| ❌ | ✓ |
|---|---|
| `color: #5422b0` | `color: var(--accent-brand)` |
| `padding: 12px` | `padding: var(--spacing-sm)` |
| `border-radius: 10px` | `border-radius: var(--radius-md)` |
| `font-size: 13px` | `font-size: var(--font-size-sm)` |
| `border: 2px solid` | `border: 1px solid` |
| No focus state | Always show focus (border change) |
| `box-shadow: 0 2px 4px` | Use `var(--shadow-sm)` |
| `transition: 300ms` | Use `var(--transition-normal)` |

---

## Exception: ChartFlam Only

- Primary CTA button: `#FFD700` (yellow) instead of purple
- All other styling: Follow core system

---

## Quick Checklist Before Shipping

- [ ] All colors use CSS variables (no hardcoded hex)
- [ ] All spacing uses `--spacing-*` tokens
- [ ] All border-radius uses `--radius-*` tokens
- [ ] All font sizes use `--font-size-*` tokens
- [ ] All transitions use `--transition-*` tokens
- [ ] Buttons have focus states (border color change)
- [ ] Touch targets are ≥ 44px
- [ ] Semantic HTML used (`<button>`, not `<div>`)
- [ ] ARIA labels on icon buttons
- [ ] Mobile-first (default mobile, then 768px+ breakpoint)

---

## Need More Detail?

See **FLAM_DESIGN_SYSTEM.md** for:
- Rationale behind each token
- Component patterns (dropdowns, modals, etc.)
- Accessibility deep-dive
- Implementation examples

