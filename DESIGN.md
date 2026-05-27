---
version: alpha
name: Regex URL Guard
description: A functional, developer-focused Chrome extension for blocking URLs by regex patterns. Clean and professional UI with high information density.
colors:
  primary: "#3b82f6"
  primary-hover: "#2563eb"
  primary-foreground: "#ffffff"
  secondary: "#f3f4f6"
  secondary-hover: "#e5e7eb"
  secondary-foreground: "#4b5563"
  foreground: "#1f2937"
  surface: "#ffffff"
  surface-muted: "#f9fafb"
  surface-subtle: "#f3f4f6"
  border: "#e5e7eb"
  border-hover: "#d1d5db"
  muted: "#9ca3af"
  muted-foreground: "#6b7280"
  accent: "#eff6ff"
  ring: "#93c5fd"
  danger: "#dc2626"
  danger-hover: "#b91c1c"
  danger-foreground: "#ffffff"
  danger-subtle: "#fef2f2"
  danger-border: "#fecaca"
  warning: "#f59e0b"
  warning-text: "#b45309"
typography:
  heading-lg:
    fontFamily: system-ui, sans-serif
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
  heading-md:
    fontFamily: system-ui, sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
  body-md:
    fontFamily: system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: system-ui, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-md:
    fontFamily: system-ui, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  label-sm:
    fontFamily: system-ui, sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.04em
  mono-md:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 2px
  md: 4px
  lg: 8px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: 12px
    typography: "{typography.label-md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.lg}"
    padding: 12px
    typography: "{typography.label-md}"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.danger-foreground}"
    rounded: "{rounded.lg}"
    padding: 12px
    typography: "{typography.label-md}"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
  button-danger-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.lg}"
    padding: 12px
    typography: "{typography.label-md}"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: 12px
    typography: "{typography.body-md}"
  input-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: 12px
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  tag-selected:
    backgroundColor: "#dbeafe"
    textColor: "#1e40af"
    rounded: "{rounded.sm}"
  tag-default:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.sm}"
---

## Overview

**Regex URL Guard** is a Chrome extension that lets users define groups of URL patterns (including regex) and block access to matching sites during specified time windows or after daily usage limits are reached. The UI targets technically-proficient users—developers, students, or productivity-focused individuals—who need fine-grained control over their browsing habits.

The design philosophy is **functional minimalism**: every element earns its place. Information is dense but not cluttered. Neutral grays dominate, with blue reserved for primary actions and red strictly for destructive or blocked states. The aesthetic evokes a developer tool or system preferences panel rather than a consumer app.

## Colors

The palette is a high-contrast, accessibility-conscious combination of cool grays and a single primary blue. Two accent systems—blue for affirmative actions and red for danger—give users immediate visual feedback on the consequences of their actions.

- **Primary (#3b82f6):** Blue 500. Used exclusively for the most important interactive elements: primary buttons, active states, focus rings, and progress meter fills when time remains.
- **Primary Hover (#2563eb):** Blue 600. Darken on hover to signal interactivity.
- **Foreground (#1f2937):** Gray 800. Default text on light backgrounds.
- **Surface (#ffffff):** Pure white. Card and input backgrounds.
- **Surface Muted (#f9fafb):** Gray 50. Page background and secondary input hover states.
- **Surface Subtle (#f3f4f6):** Gray 100. Segmented control backgrounds, disabled fields.
- **Secondary (#f3f4f6 / #e5e7eb):** Gray 100/200. Secondary button and control backgrounds.
- **Secondary Foreground (#4b5563):** Gray 600. Secondary text, descriptions, and secondary button labels.
- **Border (#e5e7eb):** Gray 200. Card borders, input borders, dividers.
- **Muted (#9ca3af):** Gray 400. Placeholder text, icon fills in passive states.
- **Muted Foreground (#6b7280):** Gray 500. Supplementary annotations.
- **Accent (#eff6ff):** Blue 50. Ghost button hover background; subtle highlights.
- **Ring (#93c5fd):** Blue 300. Focus ring for keyboard navigation.
- **Danger (#dc2626):** Red 600. Destructive buttons (delete group), over-limit meter fill, blocked-page indicators.
- **Danger Subtle (#fef2f2) / Danger Border (#fecaca):** Red 50/200. Danger ghost button hover and border; error input borders.
- **Warning (#f59e0b):** Amber 500. Progress meter fill when remaining time ≤ 20%.
- **Warning Text (#b45309):** Amber 700. Remaining-time text when in warning threshold.

## Typography

The extension uses the system UI font stack for all text. This ensures native rendering quality across macOS, Windows, and Linux without any font loading overhead—critical for an extension that initialises on every browser launch.

- **Headings:** Semi-bold (600) in 16–18 px. Used for group names and section titles to create clear visual hierarchy in the settings panel.
- **Body:** Regular (400) in 14 px. The primary reading weight for descriptions, pattern lists, and form labels.
- **Labels / Caps:** Medium (500) in 12 px, with slight letter spacing. Used for meter labels ("Daily limit"), tag text, and uppercase annotations.
- **Mono:** Used for regex pattern inputs and time-range values (HH:MM) to signal machine-readable content and improve scanability.

## Layout

The Options page uses a **sidebar navigation layout** within a max-width-constrained workspace. The page header, pending-settings banner, and total error alert remain global. Below them, a narrow left navigation switches the main content between `Groups` and `General settings` so the two editing surfaces are not shown at the same time. The selected section does not repeat the navigation label as an additional section header.

The internal structure is:
- **Section navigation:** A thin, bordered nav region, not a card. `Groups` shows the current group count; `General settings` only shows an error indicator when global settings or import errors need attention.
- **Groups section:** The default section. Group cards are stacked in the main content area, one per rule group, with a consistent internal grid—left-aligned labels, right-aligned controls.
- **General settings section:** Global options (block action, redirect URL, daily reset hour, notifications) plus import / export controls. Import errors stay inside this section.

On mobile widths, the sidebar collapses into a horizontal segmented navigation above the selected section. Spacing uses a **4 px base grid**. Component padding is 8–12 px internally; cards have 16 px padding. Section gaps are 16–24 px. This maintains density without making the UI feel cramped.

The Popup page is a compact **280 px wide** panel listing active groups for the current page. Each row is a `TimeLimitMeter` component (border box, 40 px tall). An empty state is shown when no groups match.

## Elevation & Depth

Visual hierarchy is achieved through **tonal layers and thin borders**, not heavy shadows.

- **Base layer (surface-muted #f9fafb):** The page background.
- **Raised layer (surface #ffffff + border + shadow-sm):** Cards and inputs. `shadow-sm` (0 1px 2px rgba(0,0,0,0.05)) lifts content just enough to distinguish interactive surfaces from the background.
- **Overlay layer (shadow-lg):** Modal dialogs (ConfirmDialog) float above all content with a stronger shadow and a semi-transparent backdrop.

No gradients or strong shadows are used outside modals. The design feels flat but uses borders to delineate regions clearly.

## Shapes

All interactive elements use **rounded corners** to soften the utilitarian aesthetic without deviating into consumer-app territory.

- **Buttons, inputs, cards, segmented controls:** `rounded-lg` (8 px) — the standard interactive radius.
- **Progress meter fill and small badges:** `rounded-sm` (2 px) — pill-like but compact.
- **Tags (pattern chips, day labels):** `rounded-sm` (2 px).
- **Tooltips:** `rounded-md` (4 px).

All radii within a single component are uniform—no mixing of sharp and soft corners within one element.

## Components

### Buttons

Five variants cover all action types:

- **Primary:** Blue fill, white text. Single most important action per form (e.g. "Save").
- **Secondary:** White fill, gray border, gray text. Secondary actions (e.g. "Cancel", "Edit").
- **Ghost:** Transparent fill, primary-blue border and text. Tertiary actions that reference the primary color without competing (e.g. "Add pattern").
- **Danger:** Red fill, white text. Irreversible destructive actions (e.g. "Delete group").
- **Danger Ghost:** White fill, red border and text. Confirmable destructive actions within a view (e.g. contextual delete within an expanded card).

Button sizes: `sm` (32 px tall) for icon-adjacent controls; `md` (36 px tall) for standard actions; icon-only (`icon-sm` / `icon-md`) for compact toolbar actions.

### Inputs

Text inputs have a consistent rounded-lg border. States:
- **Default:** White background, Gray 300 border, focus turns border Primary blue with a Blue 300 ring.
- **Hover:** Slightly darker field background and border.
- **Error:** Red border (danger-border), red focus ring.
- **Readonly:** Transparent border, no background change—reads like inline text.
- **Disabled:** Gray 100 background, 50% opacity.

Monospace mode (`font-mono`) is applied to regex pattern fields and HH:MM time inputs.

### Segmented Control

A pill-style tab bar for binary or ternary choices (e.g. "Blacklist / Whitelist"). The active segment lifts to a white pill with a subtle shadow; inactive segments are transparent with gray text. In read-only mode, only the selected segment is shown with a bordered, non-interactive style.

### Time Limit Meter

A horizontal progress component used in both the Popup and Options pages to show daily usage. Contains:
- A clock icon + "Daily limit" label.
- Remaining time in mm:ss (font-semibold, color-coded).
- A progress bar that fills left-to-right from remaining → consumed.
- A fraction `consumed / total` in muted text.

Bar and remaining-time text color shift through three states:
- **Normal (>20% left):** Primary blue bar, foreground text.
- **Warning (≤20% left):** Amber bar, amber text.
- **Exceeded (0 s left):** Danger red bar, danger text.

### Tags (Pattern Chips / Day Labels)

Small, rounded-sm chips used for regex patterns in read mode and for day-of-week selections. Two visual states:
- **Selected:** Blue-tinted background (#dbeafe), dark-blue text (#1e40af), blue border.
- **Default:** Gray background, gray text, gray border.

## Do's and Don'ts

- Do use Primary blue for at most one primary action per view—never two competing blue buttons.
- Do maintain WCAG AA contrast for body text: foreground (#1f2937 on #ffffff = 14.1:1), secondary text (#4b5563 on #ffffff = 7.0:1). Note: the primary button (#ffffff on #3b82f6 = 3.68:1) does not meet WCAG AA for small text—this is a known tradeoff accepted for visual brand consistency.
- Don't use shadows heavier than `shadow-sm` outside modal overlays.
- Don't mix rounded-lg and rounded-full corners within the same component.
- Do use monospace font for all regex and time-value inputs to signal machine-readable content.
- Don't apply color to decorative or informational icons—use `text-muted` (#9ca3af) to keep them passive.
- Do show error states inline (red border + error text beneath the field) rather than in a toast or alert.
- Don't use more than three font weights on a single screen (400, 500, 600 are the permitted set).
