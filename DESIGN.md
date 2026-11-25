# Design system — L1 Academy

<!-- Written from the built interface, not from an intention. Tokens live in `app/public/css/app.css`. -->

## World

An operations manual for a datacenter floor. A dark instrument rail sits beside a light working surface; hairline rules, tabular figures, small mono labels for identifiers, and one authored diagram plate per lesson. The interface should disappear into the task: a fresher at 09:40 with a ticket open should see the next action, not the product's personality.

Mode: **Operate** for the app, **Read** for lesson prose. The landing and sign-in surfaces borrow the same vocabulary rather than switching to a marketing language.

## Tokens

```
--ink        #12171a   rail top, dark action, headings on light
--rail       #0e1315   sidebar ground
--paper      #f4f5f4   page ground
--surface    #ffffff   panels, cards, inputs
--line       #e3e6e4   hairline
--line-strong#cdd3cf   control borders
--text       #191f22
--text-2     #4d585e
--text-3     #6d797f
--accent     tenant primary (default #1f4fd8 / setup default #2f6bff)
--accent-ink readable white or ink, computed from luminance
--ok         #0b7a4b   --ok-soft #e7f5ee
--warn       #8a5300   --warn-soft #fdf1dd
--bad        #ae2a1c   --bad-soft #fceceb
```

Radius: 5 / 8 / 12 px. Shadows are offset and soft, never zero-offset halos. Light is chosen from the use scene (office, shift work, long reading): light surface for prose, dark plate for diagrams so the schematic reads as an instrument view.

## Type

One UI family (system sans: `-apple-system, "Segoe UI", Roboto, …`) at a fixed rem scale — no fluid display type. Reading prose switches to the system serif (`Iowan Old Style, Palatino, Georgia`) at 17.5px / 1.72, measure 68ch. Code and identifiers use the system mono with tabular numerals.

| Role | Size | Weight |
|---|---|---|
| Page h1 | 28–42px, -0.03em | 650 |
| Section h2 (prose) | 18px | 650 |
| Body | 15px / 1.55 | 400 |
| Prose | 17.5px / 1.72 | 400 |
| Micro label | 10.5–11px, 0.07em, uppercase | 600 |
| Data / points | tabular numerals | 600 |

## Layout

- Rail 248px, sticky; top bar 60px, sticky, translucent paper with blur only on the bar.
- Content max-width 1180 (1340 for admin); lesson grid `1fr / 250px` with the right rail sticky.
- Breakpoints: 1100 (collapse right rail), 900 (rail becomes an off-canvas drawer + scrim), 620 (single-column tables, pills trimmed, breadcrumb reduced to the current page).
- Module rows and drill rows are tables in spirit — divided by hairlines, not cards in a grid. Cards are used for bounded objects (work order, readiness panel, certificate) and never nested.

## Components

- **Buttons:** 38px (32 small, 46 large), 8px radius, four roles — primary (tenant accent), dark ink, ghost outline, quiet text. Every role has hover, focus-visible, active, disabled.
- **Status:** pill with a 6px dot; green pass, amber attention, red fail, plain for neutral. Status is never colour-only — the label carries the meaning.
- **Inputs:** 1px `--line-strong`, 3px accent ring on focus, 9px vertical padding. Errors are inline blocks above the field group, naming the problem and the recovery.
- **Work order:** ticket header strip, subject, body, impact line. The teaching artifact of every lesson.
- **Plate:** dark diagram panel with LED cluster, grammar label, caption. Eight SVG grammars: layers, flow, sequence, compare, topology, timeline, tree, quadrant. One shared animation (draw-in with stagger) and a `prefers-reduced-motion` off-switch.
- **Certificate:** cream document, twin hairline border inside, engraved serif name, rotated seal, module-score grid, signature rule, verification code. Print CSS is A4 landscape at exact millimetres.

## Motion

One authored moment: the diagram draws itself in (staggered 65ms, 550–900ms). Everything else is 150–250ms state feedback. No page-load choreography. Reduced motion removes the draw and the pulse.

## Do not

- No gradient text, glass decoration, coloured left-border callouts, or hard offset shadows.
- No emoji as icons; the icon set is authored 24×24 SVG at 1.7 stroke.
- No progress rings; progress is a bar with a number.
- No second accent colour per module — module colour exists in data but the interface stays restrained.
- No invented customer logos, testimonials or statistics anywhere in the product.

## Accessibility

Body and placeholder contrast ≥ 4.5:1; large ≥ 3:1. Visible focus ring on every interactive element. Quizzes are radio groups with `<fieldset>` semantics implied by `role="radiogroup"` and labelled questions. Diagrams carry `role="img"` and a descriptive `aria-label`; the caption repeats the takeaway in text. Tables have header cells. `aria-live` regions announce toasts. The certificate is real text, not an image, so it prints and reads.
