# Web known issues

## Implemented today

- **Resolved/covered: project history crowded out.** Symptom: missing recent project deliveries → cause: filtering workspace's capped feed in UI → implemented fix: useDashboard(id) requests project dashboard, backend filters deliveries before cap → prevention: retain project-overview.test.ts and request project scope.
- **Resolved/covered: misleading chart zeroes.** Symptom: missing Apple reports resemble no downloads → cause: null coerced to 0 → implemented convention: absent reports stay null, actual zeros render zero; partial source coverage has lighter bars and table labels → prevention: tests/project-overview.test.ts and tests/e2e/dashboard.spec.ts.
- **Active catalog constraint:** organization metadata can be absent → cause: optional provider lookup/permissions → implemented fallback: connection.name labels the connection, project names remain usable; available organization names alone label Connection options → prevention: share catalogQuery and keep source selection separate.
- **Active metric limitation:** workspace Recent new accounts is a feed count capped at 100, not total users; project Overview uses a separate range-aware aggregate → prevention: preserve the labels and do not reuse snapshot.events for aggregate charts.

- **Resolved:** newly added sources appeared collected at their baseline → initial live cursor equaled notification start → show waiting for the first collection until the live checkpoint advances.
- **Resolved and hosted-verified: static asset security headers absent.** Hosted HTML bypassed src/cloudflare.ts because run_worker_first routes only /api/* through the Worker → public/_headers supplies the same CSP, nosniff and referrer policy at the asset layer → verify hosted HTML/deep links after deployment, since a successful Worker bundle alone does not exercise asset routing. Keep this policy aligned with the fallback response headers in src/cloudflare.ts.

- **Resolved:** metric filters without enumerated values rendered an All-only selector, making Google Play country ratings unusable → ViewEditor renders a bounded text input for free-form filters and preserves selectors for enumerated filters. Typecheck/build verify composition; browser verification remains task-authorized only.

- **Resolved: project calendar mismatch.** Range construction and API validation use the project timezone, including positive/negative UTC offsets and DST transitions. Provider report labels retain their native calendar. Core/backend regression coverage verifies the contract.
- **Resolved: unloaded views could replace the saved layout.** Configure views is disabled until the query succeeds and the editor requires loaded data. Static React rendering tests cover pending/error/success states; no browser acceptance is implied.
- **Resolved: cached workspace screens hid refresh failures.** Shared RefreshNotice displays the error and last successful data update alongside cached Projects, Destinations, Activity and project data. QueryClient/rendering tests cover stale cached data after failure.
- **Resolved retention copy mismatch:** Settings correctly labels download retention as 365 days.
- **Resolved stale reconnect catalog:** connection mutations reset the affected catalog before dashboard invalidation, preventing a prior grant's cached resources from remaining selectable.

- **Resolved in source: deferred route failure erased the application.** Suspense handles pending imports but cannot catch rejected chunks. Shared RouteContent supplies an error boundary with reload guidance, keeps surrounding navigation mounted, and clears the failure when the path changes. Typecheck/build verify integration; browser failure/reload acceptance was not authorized.
