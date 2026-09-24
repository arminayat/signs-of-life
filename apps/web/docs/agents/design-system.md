# Web design system

## Implemented today

Sources: styles.css, responsive.css, project.css, content-frame.css and ui.tsx.
Typography uses Inter-first system sans stack; no downloaded font file/import is present. Base text 14px, headings use tighter letter spacing and responsive sizes. Lucide icons plus inline GitHub SVG; green radio mark and Signs of Life/BETA wordmark.

| Token               | Light   | Dark    |
| ------------------- | ------- | ------- |
| --page-background   | #fff    | #101611 |
| --background        | #f7f8f5 | #141a16 |
| --foreground        | #202b25 | #e8ede7 |
| --surface           | #fff    | #1c241e |
| --surface-secondary | #f2f4ef | #252e27 |
| --muted             | #748078 | #a1ada2 |
| --accent            | #254e37 | #c7eaa4 |
| --border            | #e3e7e0 | #313d33 |

Main content is a bordered green-tinted panel, with 20px gutter/24px radius, becoming 8px/18px at <=760px. Desktop workspace sidebar is 230px (210px medium); project layout uses 76px icon rail plus 234px sidebar. Project sidebar becomes in-flow above content on mobile. content-frame.css aligns a 48px header/footer and bottom theme/version control.
Theme toggles root .dark and persists theme; system preference supplies initial default. Cards, native controls, notices and statuses use shared styles with some hard-coded semantic colors.
Accessibility in code: skip link, labeled nav/buttons/fields, alert/status roles, HeroUI modal composition, SVG titles, native expandable daily-value tables and reduced-motion CSS. This is implementation evidence, not a complete accessibility audit.

## Planned/aspirational — UX rules

Maintain readable axes/labels, pending/empty/error states, zero-vs-missing data and honest delivery labels. Preserve exact organization/app selection separation. Do not infer a separate design token package, external font service or design-file specification.
