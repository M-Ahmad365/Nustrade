# DESIGN.md — NusTrade Frontend Design System

Authoritative design specification. Every frontend decision follows this file. If it's not here, ask before inventing.

---

## 1. Design Principles

1. **Trust first** — every visual choice reinforces "this is safe, verified, premium"
2. **Content over chrome** — listings are the star; UI recedes
3. **Motion with meaning** — every animation serves feedback, never decoration
4. **Warm, not cold** — cream backgrounds over stark white, rounded over sharp
5. **Mobile first** — 70% of students browse on phones; design there first
6. **Fast perceived** — skeletons everywhere, optimistic UI, no spinners in 2026

---

## 2. Color System

### Core Palette

```css
:root {
  /* Brand */
  --color-primary: #0F6E56;          /* Deep Teal - logo, primary actions, prices */
  --color-primary-hover: #085041;    /* darker teal for hover states */
  --color-primary-light: #E1F5EE;    /* teal tint - category chips, subtle bg */
  --color-primary-text: #04342C;     /* text on light teal bg */

  --color-accent: #EF9F27;           /* Warm Amber - highlights, boosted badges, CTAs */
  --color-accent-hover: #BA7517;     /* darker amber */
  --color-accent-light: #FAEEDA;     /* amber tint */
  --color-accent-text: #854F0B;      /* text on light amber */

  /* Surfaces */
  --color-bg: #FEFDF9;               /* Warm off-white - page background */
  --color-surface: #FFFFFF;          /* Pure white - cards */
  --color-surface-alt: #F6F5EE;      /* Subtle surface - inputs, section bg */
  --color-surface-muted: #F1EFE8;    /* Cream - skeleton, chips, hover fill */

  /* Text */
  --color-text: #2C2C2A;             /* Charcoal - primary text */
  --color-text-muted: #5F5E5A;       /* Muted - meta, captions */
  --color-text-subtle: #888780;      /* Subtle - placeholders, hints */
  --color-text-inverse: #FEFDF9;     /* On dark bg */

  /* Semantic */
  --color-success: #3B6D11;
  --color-success-light: #EAF3DE;
  --color-success-text: #173404;

  --color-danger: #A32D2D;
  --color-danger-light: #FCEBEB;
  --color-danger-text: #501313;

  --color-warning: #854F0B;
  --color-warning-light: #FAEEDA;

  --color-info: #185FA5;
  --color-info-light: #E6F1FB;

  /* Borders */
  --border-subtle: rgba(15, 42, 35, 0.06);   /* card outlines */
  --border-default: rgba(15, 42, 35, 0.1);   /* input borders */
  --border-strong: rgba(15, 42, 35, 0.18);   /* emphasis */
  --border-primary: rgba(15, 110, 86, 0.2);  /* branded borders */
  --border-primary-hover: rgba(15, 110, 86, 0.35);
}
```

### Color Usage Rules

| Element | Color | Never Use |
|---|---|---|
| Primary button | `--color-primary` | red for CTAs |
| Prices | `--color-primary` | black for prices |
| Destructive action | `--color-danger` | as primary CTA |
| Boosted badge | `--color-accent` on light amber bg | primary color |
| Category chips | primary-light bg, primary-text fg | gray chips |
| Success toast | success bg + text | primary color |
| Page background | `--color-bg` (cream) | pure white |

**Critical:** Never use pure black (`#000`) anywhere. Text max darkness = `--color-text` (#2C2C2A). Never use hex colors directly in components — always CSS variables.

---

## 3. Typography

### Font Stack

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

Load Inter from Google Fonts in `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

### Type Scale

```css
:root {
  --text-xs: 11px;    /* labels, timestamps, tiny meta */
  --text-sm: 13px;    /* captions, meta, secondary info */
  --text-base: 15px;  /* body, card titles */
  --text-md: 16px;    /* inputs, main content */
  --text-lg: 18px;    /* subheadings, prices in detail */
  --text-xl: 22px;    /* card prices, section headers */
  --text-2xl: 28px;   /* page titles */
  --text-3xl: 36px;   /* hero titles */
}
```

### Weights & Line Heights

- `font-weight: 400` — body, paragraphs
- `font-weight: 500` — UI labels, card titles, prices, buttons
- `font-weight: 600` — page headings, hero text
- Never use 700+ (too heavy against warm background)

- `line-height: 1.5` — body text
- `line-height: 1.35` — card titles, headings
- `line-height: 1.2` — large display text

### Letter Spacing

- Large headings: `letter-spacing: -0.3px` (tighter, premium feel)
- Uppercase labels: `letter-spacing: 0.5px`
- Everything else: default

---

## 4. Spacing System

8px grid. Every spacing value is a multiple of 4 (minimum) or 8 (preferred).

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
}
```

**Rhythm:**
- Inside cards: 10-16px gaps
- Between cards: 16-24px
- Between sections: 48-64px
- Page padding mobile: 16px
- Page padding desktop: 24-32px

---

## 5. Border Radius

```css
:root {
  --radius-sm: 6px;    /* chips, small badges */
  --radius-md: 10px;   /* inputs, buttons */
  --radius-lg: 16px;   /* cards (primary choice) */
  --radius-xl: 20px;   /* modals, large surfaces */
  --radius-full: 9999px; /* pills, avatars */
}
```

**Rule:** never use sharp corners (`border-radius: 0`) except on full-width banners.

---

## 6. Shadow System

Shadows convey elevation. Use consistently.

```css
:root {
  /* Flat — no elevation (default state for cards) */
  --shadow-flat: 0 1px 2px rgba(15, 42, 35, 0.04), 0 0 0 1px rgba(15, 42, 35, 0.02);

  /* Raised — small hover or focused */
  --shadow-raised: 0 4px 12px rgba(15, 42, 35, 0.06), 0 2px 4px rgba(15, 42, 35, 0.04);

  /* Hover — card hover, important CTAs */
  --shadow-hover: 0 12px 28px rgba(15, 110, 86, 0.12), 0 4px 8px rgba(15, 42, 35, 0.04);

  /* Modal — dialogs, dropdowns */
  --shadow-modal: 0 24px 48px rgba(15, 42, 35, 0.16), 0 8px 16px rgba(15, 42, 35, 0.08);

  /* Focus ring (functional, not decorative) */
  --shadow-focus: 0 0 0 3px rgba(15, 110, 86, 0.2);
}
```

---

## 7. Motion System

### Timing Functions

```css
:root {
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);     /* entrances, hovers */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);           /* exits */
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);     /* transitions both ways */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* playful, use sparingly */
}
```

### Durations

```css
:root {
  --duration-instant: 100ms;  /* button press */
  --duration-fast: 150ms;     /* hover state */
  --duration-base: 220ms;     /* card hover, toast */
  --duration-slow: 360ms;     /* page transitions */
  --duration-slower: 500ms;   /* elaborate entrances */
}
```

### Animation Catalogue (only these — do not invent more)

**1. Page fade-in** — on route change
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.page { animation: fadeInUp var(--duration-base) var(--ease-out); }
```

**2. Card hover lift**
```css
.card {
  transition: transform var(--duration-base) var(--ease-out),
              box-shadow var(--duration-base) var(--ease-out),
              border-color var(--duration-base) var(--ease-out);
}
.card:hover { transform: translateY(-4px); box-shadow: var(--shadow-hover); }
```

**3. Image zoom on card hover** (0-2% zoom, very subtle)
```css
.card-image { transition: transform 420ms var(--ease-out); }
.card:hover .card-image { transform: scale(1.04); }
```

**4. Button press** — tactile feedback
```css
button { transition: transform var(--duration-instant) var(--ease-out); }
button:active { transform: scale(0.97); }
```

**5. Primary button hover fill** — subtle color deepening
```css
.btn-primary { transition: background var(--duration-fast), box-shadow var(--duration-fast); }
.btn-primary:hover { background: var(--color-primary-hover); box-shadow: var(--shadow-raised); }
```

**6. Chat arrow slide** — CTA affordance
```css
.chat-arrow { display: inline-block; transition: transform var(--duration-base) var(--ease-out); }
.card:hover .chat-arrow { transform: translateX(3px); }
```

**7. Skeleton shimmer** — loading state
```css
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--color-surface-muted) 0%, #EAE7DD 50%, var(--color-surface-muted) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s var(--ease-in-out) infinite;
  border-radius: var(--radius-md);
}
```

**8. Toast slide-in** — notifications
```css
@keyframes slideInRight {
  from { transform: translateX(calc(100% + 24px)); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.toast { animation: slideInRight var(--duration-base) var(--ease-out); }
```

**9. Modal backdrop fade + dialog pop**
```css
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes popIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-backdrop { animation: fadeIn var(--duration-fast) var(--ease-out); }
.modal-dialog { animation: popIn var(--duration-base) var(--ease-out); }
```

**10. Heart/save bounce** — wishlist toggle
```css
@keyframes heartBounce {
  0% { transform: scale(1); }
  35% { transform: scale(1.3); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
.saved { animation: heartBounce 400ms var(--ease-spring); }
```

### Motion Rules

- Respect `prefers-reduced-motion` — wrap all animations in media query, reduce to simple fades or remove entirely
- Never animate `width`, `height`, `top`, `left` — only `transform` and `opacity` (GPU-accelerated)
- Max 3 elements animating at once on any screen
- No auto-playing animations longer than 500ms except shimmer

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Component Specifications

### 8.1 Listing Card (The Money Maker)

**Structure:**
- Image container (4:3 aspect ratio, `overflow: hidden`)
- Boosted badge (top-left, if applicable)
- Save button (top-right, always present)
- Body:
  - Title (2 lines max, `-webkit-line-clamp`)
  - Price row (price + negotiable tag)
  - Chips row (category + condition)
  - Meta bar (location · posted time)
  - CTA row (Chat button + View button)

**Visual:**
- Background: `--color-surface` (pure white)
- Border: `1px solid var(--border-subtle)`
- Radius: `--radius-lg` (16px)
- Default shadow: `--shadow-flat`
- Hover: lift 4px, `--shadow-hover`, border `--border-primary-hover`, image zooms 4%, Chat button fills teal, arrow slides right

**Price:** 22px, weight 500, color `--color-primary`, letter-spacing `-0.3px`

**Boosted badge:** Pill shape, translucent cream bg with backdrop-blur, amber text, 6px pulsing amber dot on left

**Save button:** 32px circle, translucent bg, heart icon, bounces on toggle

**Chips:**
- Category chip: `--color-primary-light` bg, `--color-primary-text` fg, `--radius-full`, 4px 10px padding, 11px/500
- Condition chip: `--color-surface-muted` bg, `--color-text-muted` fg, same shape

**Chat CTA:** Full-width in CTA row, outlined teal border, teal text, fills on card hover. Arrow character slides right on hover.

**View button:** Secondary, ghost style, muted text, fills cream on hover.

### 8.2 Buttons

| Variant | Use | Spec |
|---|---|---|
| Primary | Main CTA | Teal bg, white text, 10px radius, 12px 20px padding, 15px/500 |
| Secondary | Alt action | White bg, teal border, teal text |
| Ghost | Tertiary | Transparent bg, muted text, fills on hover |
| Danger | Destructive | Red bg, white text |
| Icon only | Save, close, menu | 36px square, `--radius-md` or circle |

**States:** All have `:hover` (bg shift), `:active` (scale 0.97), `:focus-visible` (focus ring), `:disabled` (60% opacity, cursor not-allowed).

### 8.3 Forms

**Input:**
- Height: 44px (mobile-friendly tap target)
- Padding: 0 14px
- Border: 1px solid `--border-default`
- Radius: `--radius-md`
- Font: 15px/400
- Background: `--color-surface-alt`
- Focus: border `--color-primary`, bg `--color-surface`, `--shadow-focus`

**Label:**
- Above input, 13px/500, `--color-text-muted`, margin-bottom 6px

**Error state:**
- Border `--color-danger`
- Error message below in danger color, 12px/400

**Select:** Same as input, with chevron icon on right.

**Textarea:** Same as input, min-height 100px, `resize: vertical`.

### 8.4 Navigation (Top Bar)

**Desktop:**
- Height: 64px
- Background: `--color-surface`, border-bottom `--border-subtle`
- Logo left, search center (expandable), profile + post button right
- Sticky, shadow only when scrolled

**Mobile:**
- Height: 56px
- Logo + search icon + menu icon
- Full menu in slide-out drawer

**Post button (primary CTA in nav):**
- Prominent, amber or teal solid
- "+" icon + "Post" text (desktop), just "+" (mobile)

### 8.5 Filters Panel

- Desktop: left sidebar, sticky, 240px wide
- Mobile: slide-up sheet from bottom
- Accordion sections: Category, Price, Condition, Hostel, Department
- Apply button pinned to bottom on mobile

### 8.6 Chat Interface

**Thread list:** Left column, avatar + name + last message preview + timestamp + unread badge (teal circle with count)

**Chat window:** Right column
- Header: listing thumbnail + title + price + seller name
- Messages: chat bubbles, sender = teal bg right-aligned, receiver = cream bg left-aligned, timestamps in muted below
- Image messages: rounded 10px, max 240px wide
- Input bar: image upload icon + text input + send button

### 8.7 Skeleton Loaders

Every list that fetches data shows skeletons for 400ms minimum (prevents flash). Skeletons match the exact shape of the real component.

---

## 9. Layout & Responsive Grid

### Breakpoints

```css
--bp-sm: 640px;   /* tablet portrait */
--bp-md: 768px;   /* tablet landscape */
--bp-lg: 1024px;  /* desktop */
--bp-xl: 1280px;  /* large desktop */
--bp-2xl: 1536px; /* ultra-wide */
```

### Listings Grid

```css
.listings-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) { .listings-grid { grid-template-columns: repeat(2, 1fr); gap: 20px; } }
@media (min-width: 1024px) { .listings-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1280px) { .listings-grid { grid-template-columns: repeat(4, 1fr); gap: 24px; } }
```

### Page Container

```css
.container { max-width: 1400px; margin: 0 auto; padding: 0 16px; }
@media (min-width: 768px) { .container { padding: 0 24px; } }
@media (min-width: 1024px) { .container { padding: 0 32px; } }
```

---

## 10. Iconography

- Use Lucide icons (via `<img>` or inline SVG from lucide.dev)
- Default size: 16px in text, 20px in buttons, 24px standalone
- Stroke width: 1.8px (never 2px — too heavy)
- Color: inherits `currentColor`

**Required icons:**
- search, filter, map-pin, heart, heart-filled, message-circle, image, x, chevron-down, chevron-right, plus, user, bell, shopping-bag, trash, edit, check, alert-circle, loader

---

## 11. Iconography & Imagery Rules

- Never use emoji in UI (inconsistent rendering across devices)
- Product images: 4:3 on cards, 1:1 on thumbnails, originals on detail pages
- Lazy load all images below the fold
- Use `loading="lazy"` attribute
- Placeholder while loading: subtle cream gradient
- Broken image fallback: cream background with image icon centered
- Always `object-fit: cover` on listing thumbnails

---

## 12. Empty States

Every list that can be empty has a designed empty state:
- Illustration (simple line art or icon at 64px, muted color)
- Heading (18px/500) — warm, conversational
- Description (14px/400, muted) — what to do next
- CTA button where applicable

Example for empty wishlist:
> "Nothing saved yet"
> "Tap the heart on any listing to save it for later."
> [Browse listings] button

---

## 13. Toast Notifications

Top-right on desktop, bottom on mobile.
- Success: green left border, check icon, success text color
- Error: red left border, alert icon, danger text
- Info: teal left border, info icon, primary text
- Auto-dismiss: 4s (longer for errors: 6s)
- Click to dismiss
- Max 3 stacked

---

## 14. Dark Mode

**Defer to phase 2.** For MVP, light mode only. Design so variables can be swapped later — never hardcode colors.

---

## 15. Accessibility Baseline

- Color contrast: all body text meets WCAG AA (4.5:1)
- Focus rings on all interactive elements (`:focus-visible`)
- Minimum tap target: 44x44px on mobile
- Form labels always visible, never placeholder-only
- Semantic HTML: `<nav>`, `<main>`, `<section>`, `<button>`, `<a>` — no `<div onclick>`
- Alt text on all images
- `aria-label` on icon-only buttons
- Focus trap in modals

---

## 16. Performance Targets

- Largest Contentful Paint < 2s on 4G
- Initial bundle (app shell) < 100KB gzipped
- Images served as WebP with JPEG fallback
- Critical CSS inlined, rest deferred
- JS code-split by route

---

## 17. What "Done" Looks Like

A page is design-complete when:
1. It matches this spec exactly — colors, spacing, typography, radius
2. All interactive states exist (hover, active, focus, disabled, loading)
3. It works at 320px width without horizontal scroll
4. Empty, loading, and error states are designed
5. Animations respect `prefers-reduced-motion`
6. Passes keyboard navigation test
7. Real content (not Lorem Ipsum) placed in realistic scenarios

---

End of DESIGN.md. If you want to change a token, change it here first — never in component code.
