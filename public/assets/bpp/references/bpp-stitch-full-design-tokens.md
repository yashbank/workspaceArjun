---
name: BPP Workspace
colors:
  surface: '#faf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#faf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e8'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#2f3031'
  inverse-on-surface: '#f2f0f0'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#181919'
  on-primary: '#ffffff'
  primary-container: '#2d2d2d'
  on-primary-container: '#959494'
  inverse-primary: '#c8c6c6'
  secondary: '#5e5e5b'
  on-secondary: '#ffffff'
  secondary-container: '#e1dfdb'
  on-secondary-container: '#63635f'
  tertiary: '#221700'
  on-tertiary: '#ffffff'
  tertiary-container: '#3c2a00'
  on-tertiary-container: '#bd8d00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4e2e1'
  primary-fixed-dim: '#c8c6c6'
  on-primary-fixed: '#1b1c1c'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e4e2dd'
  secondary-fixed-dim: '#c8c6c2'
  on-secondary-fixed: '#1b1c19'
  on-secondary-fixed-variant: '#474744'
  tertiary-fixed: '#ffdfa0'
  tertiary-fixed-dim: '#fbbc00'
  on-tertiary-fixed: '#261a00'
  on-tertiary-fixed-variant: '#5c4300'
  background: '#faf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  display:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: -0.01em
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is a high-end, tactile environment tailored for a premium paper products workspace. It merges the physical heritage of stationery with a modern, digital-first "workspace" ethos. 

The aesthetic is **Tactile Minimalism**. It prioritizes high-quality materials (represented via subtle paper textures and ivory hues) and professional clarity. The target audience includes executives, designers, and production managers who value precision and craftsmanship. The UI should feel like a physical desk: organized, airy, and grounded.

**Key visual principles:**
- **Materiality:** Use subtle, non-distracting grain overlays on primary surfaces.
- **Precision:** Tight typography tracking and thin, intentional borders.
- **Restraint:** Color is a tool for status and categorization, never for decoration.

## Colors
The palette is rooted in the "Ivory & Graphite" theme. The primary background mimics premium heavy-stock paper, while text and iconography utilize a sophisticated Graphite.

- **Surface Layers:** The base uses `#FDFCF8` (Ivory). Secondary containers use `#F9F7F2` (Warm Beige) to create subtle depth without relying on heavy shadows.
- **Accents (CMYK Palette):** Cyan, Magenta, Amber, and Green are reserved strictly for functional indicators—status badges, active file indicators, and progress states. 
- **Dark Mode:** Transitions to a "Graphite Stationery" theme. The background shifts to a deep matte grey, with text moving to a soft off-white to maintain readability without harsh contrast.

## Typography
The typography system uses **Hanken Grotesk** for its precise, Apple-like geometric clarity. It provides a contemporary contrast to the warm, traditional paper textures.

- **Tracking:** Headings use tight negative tracking (`-0.02em` to `-0.03em`) to feel modern and "printed."
- **Labels:** **JetBrains Mono** is introduced for small labels, metadata, and file sizes to evoke the technical nature of paper production and specification sheets.
- **Hierarchy:** Use weight over color to establish hierarchy. Reserve Bold (700) for high-level navigation and SemiBold (600) for section titles.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid** model. Content resides within a structured 12-column grid on desktop, but margins are exceptionally generous (48px+) to simulate the "white space" of a high-end magazine or catalog.

- **Rhythm:** An 8px linear scale is used for all component dimensions, but a 4px "half-step" is permitted for tight technical data layouts.
- **Density:** The system is "Airy." Avoid crowding elements; allow margins to "breathe" around critical action areas like the main document workspace.
- **Breakpoints:** 
  - Mobile (<600px): 4-column grid, 16px margins.
  - Tablet (600px-1024px): 8-column grid, 24px margins.
  - Desktop (>1024px): 12-column grid, 48px+ margins.

## Elevation & Depth
Depth is achieved through **Tonal Layering** and **Glassmorphism**, rather than high-contrast shadows.

- **The Base:** The primary workspace (the "Paper") sits at the lowest level.
- **Glassmorphism:** Navigation bars and floating inspectors use a `backdrop-filter: blur(20px)` with a semi-transparent Ivory (`#FDFCF8CC`) background. This mimics the look of frosted vellum paper.
- **Shadows:** When necessary (e.g., for modal dialogs), use "Ambient Shadows"—ultra-diffused, 10-15% opacity, with a slight warm tint (`#4A3F35`) to keep the shadow feeling "natural" and soft against the beige background.
- **Borders:** Use subtle `1px` solid borders in soft warm greys (`#E5E0D5`) to define secondary surfaces.

## Shapes
The shape language is sophisticated and approachable. 

- **Primary Elements:** Containers, cards, and input fields use a consistent **12px - 16px** radius.
- **Contextual Components:** Small elements like chips or badges use a **pill-shape** (max radius) to distinguish them from structural layout blocks.
- **Interactive States:** Buttons and interactive cards should have a subtle scale-down effect (0.98x) on press to mimic the physical feedback of pressing into soft paper.

## Components
- **Buttons:** 
  - *Primary:* Graphite background with Ivory text. 12px corner radius.
  - *Secondary:* Transparent background with a 1px border (`#E5E0D5`) and Graphite text.
- **Input Fields:** Minimalist design with only a bottom border or a very subtle background tint (`#F9F7F2`). Focus state uses a Cyan bottom border.
- **Cards:** Use the warm beige (`#F9F7F2`) for card backgrounds against the ivory base. No borders; use 12px corner radius.
- **File Type Indicators:** Use the CMYK palette to color-code file types (e.g., Cyan for PDFs, Magenta for Design Files, Amber for Assets). Indicators should be small, high-contrast squares with Mono labels.
- **Chips & Badges:** Low-height, pill-shaped elements with light-tinted backgrounds (e.g., light Cyan) and dark-tone text of the same hue for "Status" or "Tags."
- **Navigation:** Vertical sidebar using a frosted glass (vellum) effect. Active links are indicated by a small Graphite dot rather than a full highlight block.