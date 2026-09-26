# Web known issues

## Implemented today

- **Resolved/covered: project history crowded out.** Symptom: missing recent project deliveries → cause: filtering workspace's capped feed in UI → implemented fix: useDashboard(id) requests project dashboard, backend filters deliveries before cap → prevention: retain project-overview.test.ts and request project scope.
- **Resolved/covered: misleading chart zeroes.** Symptom: missing Apple reports resemble no downloads → cause: null coerced to 0 → implemented convention: absent reports stay null, actual zeros render zero; partial source coverage has lighter bars and table labels → prevention: tests/project-overview.test.ts and tests/e2e/dashboard.spec.ts.
- **Active catalog constraint:** organization metadata can be absent → cause: optional provider lookup/permissions → implemented fallback: connection.name labels the connection, project names remain usable; available organization names alone label Connection options → prevention: share catalogQuery and keep source selection separate.
- **Active metric limitation:** workspace Recent new accounts is a feed count capped at 100, not total users; project Overview uses a separate range-aware aggregate → prevention: preserve the labels and do not reuse snapshot.events for aggregate charts.

- **Resolved:** newly added sources appeared collected at their baseline → initial live cursor equaled notification start → show waiting for the first collection until the live checkpoint advances.
- **Resolved and hosted-verified: static asset security headers absent.** Hosted HTML bypassed src/cloudflare.ts because run_worker_first routes only /api/* through the Worker → public/_headers supplies the same CSP, nosniff and referrer policy at the asset layer → verify hosted HTML/deep links after deployment, since a successful Worker bundle alone does not exercise asset routing. Keep this policy aligned with the fallback response headers in src/cloudflare.ts.
