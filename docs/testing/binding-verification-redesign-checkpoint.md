# Binding verification redesign — local checkpoint

## Implemented locally
- AI protocol tab first; optional analyze/apply/save/one-real-generation callback.
- Server-persisted, scoped, redacted analysis history with restoration after failed analyses.
- Editable prompt and image/video reference inputs, uploads, locally encoded reference-video fixture (no model generation fee).
- Placeholder-aware input planning and offline missing-reference-map checks.
- Pending task locks across configuration/input changes; shared UI submission lock.
- Multipart and Gemini inline-data reference identity checks using server-generated digests.
- Already-generated videos remain visible on specification mismatch and enter needs_review, not resubmittable failure.
- Inner configuration saves propagate the revision to the outer settings UI.

## Evidence / limits
- Full suite checkpoint: 1042 passed files, 6 skipped; 5414 passed tests, 32 skipped. Subsequent revision callback change checked with targeted tests and TypeScript.
- Webpack production build passed; default Turbopack build blocked by the pre-existing node_modules junction leaving its filesystem root.
- Source map/index validation: 420 routes, 58 pages, 141 tables.
- No push, deployment, or new paid provider generation was performed.

## Not complete / do not claim acceptance
- ModelBay real reference-image/video test: authenticated official API panel lists only prompt/resolution/duration, despite capability description advertising references. Actual reference field paths, formats and limits remain unconfirmed. Do not substitute text-only success or guess unknown fields in paid requests.
- Provider-aware price estimates and automatic non-billable failure fallback are not connected as an end-to-end controller. Current submission flow is conservative: one submission, stop on success or unknown outcome.
- Full browser click-through, upload/provider-accessibility, pending-task restoration and history re-open regression still required. Current local admin browser opens login page.
- Output relevance / each reference actually influencing generation is not proven just by payload identity.
