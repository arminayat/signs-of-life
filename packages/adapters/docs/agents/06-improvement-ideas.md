# Adapters improvement ideas

## Planned/aspirational

The cross-package Authentication boundary improvement is tracked in workspace improvement-ideas.md. No further provider expansion is selected.

Candidate shortlist researched against official provider documentation on 2026-10-17. These are open proposals, not implementation commitments; effort is a preliminary estimate for the complete integration. Existing source implementations were checked in monitoring/index.ts, core/provider-registry.ts and core/model.ts. No live provider acceptance was performed.

| Candidate | Impact and feasibility boundary | Effort | Affected area | Status |
| --- | --- | --- | --- | --- |
| Plausible / Umami | Read existing aggregate traffic into Usage reports. [Plausible Stats API](https://plausible.io/docs/stats-api) requires its Business plan; [Umami](https://docs.umami.is/docs/api) has distinct cloud/self-hosted authentication. Self-hosted targets require the established public-HTTP controls. | Medium each | monitoring report adapters; provider registry, backend configuration, web setup | open |
| Google Search Console | Add organic clicks, impressions, CTR and position via the [read-only Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query). Detailed rows are not exhaustive; preserve native aggregation and missing dates. | Medium | monitoring report/OAuth adapters; provider registry, backend configuration, web setup | open |
| Firebase Authentication | Potential signup coverage for Firebase apps. [User listing](https://firebase.google.com/docs/auth/admin/manage-users) is paginated in UID order; efficient incremental polling and a minimal-field read path excluding monitored-user emails remain unverified. No auth hooks or broad profile ingestion. | Needs feasibility spike | monitoring auth adapter; provider registry, backend collection, web setup | open |

## Implemented today

The twelve monitoring adapters and Slack/Discord channels are implemented in source. Google Play, Lemon Squeezy, Slack and Discord are done as local implementation; deployment and live acceptance remain separate in root docs/monitoring-integrations.md and integrations.md.
New ideas need impact, effort, affected files and open/in-progress/done status; do not turn absent providers into a promised roadmap.
