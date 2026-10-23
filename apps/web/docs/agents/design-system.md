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

## Implemented today — provider report rendering

Provider cards use existing Card/Button/Checkbox primitives. Each shows source, definition, status, unit/currency, reporting timezone and freshness. Series/funnels include visible axes and expandable exact decimal values; cohort tables preserve provider headers, zeros and nulls. Stale retained points are explicitly partial, and no cross-provider total or currency conversion is displayed. Multiple SVG series have distinct accessible title IDs.

## Implemented today — public landing page

`landing/` inherits the app's Inter-first system stack, warm white/green surfaces, dark green action color and rounded framing. It uses its own small token sheet instead of loading dashboard/HeroUI styles. Muted copy and example chart bars use darker colors for contrast. Source checks measured 5.76:1 muted text on the hero and 3.31:1 for the lightest chart bar on white; these are token measurements, not a rendered accessibility audit.

The page opens with the existing “Your products. In the loop.” positioning and one primary Start monitoring action. A labeled illustrative source-specific overview introduces the product; a grouped integration directory, channel notification example, privacy/self-host facts and native FAQs answer setup objections. No customer statistics, testimonials, universal realtime claims, prices or invented social proof are present. Hosted channel copy names Slack/Discord; email/Telegram are qualified as operator-configured options. Changes to hosted capability should trigger copy review.

Design references: [Mixpanel product-first hero on Mobbin](https://mobbin.com/sites/sections/e91947a9-c8bd-42e9-bbc4-4b578a24b9c7), [Linear Insights on Mobbin](https://mobbin.com/sites/sections/d48c27ab-a51c-47f7-8a9e-fbe9a83fa74a), and [Hallmark](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/SKILL.md). They inform hierarchy and product specificity; no third-party screenshots are shipped. Hallmark's static sweep and independent source review were performed. Browser capture/render checks were not authorized. The examples are source-owned HTML with clearly fictitious values, not production screenshots or provider acceptance evidence.
