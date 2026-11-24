# Verification record

Recorded and rerun in the final submission pass on 24 November 2026 for the local submission prototype. All complaints and scores used here are fictional/synthetic.

| Check | Observed result |
| --- | --- |
| Repository baseline | Clean `feature/backend-prioritisation`, no applicable AGENTS.md; original 13 tests passed |
| Final backend tests | 24 passed, 0 failed; full output in `backend-test-results.txt` |
| React production build | Passed with Vite; static build serves from Express |
| Presentation | Five-slide HTML, five-page PDF, and `CampusTriage.pptx`; actual PPTX reopened in Keynote 13.1, five slides rendered and visually inspected; native text/table and screenshot preserved |
| UI browser checks | 12 passed using local headless Chrome, built React, temporary HTTP servers and SQLite |
| Mobile | Student and admin fit 390px width without horizontal overflow |
| UI submission order | Routine #1 first, later electrical hazard #2 ranks above it; exact Hinglish evidence visible |
| Resolve | UI removes resolved hazard after successful PATCH and queue refresh; database status confirmed |
| Boundary | Fixed clock before/at 48h changes `[3,2,1]` to `[3,1,2]` |
| FIFO comparison | Same tickets FIFO `[1,2,3]`; hazard moves from third to first under ranking |
| Failure | Simulated stalled provider: saved original, null analysis, unknown risk, required manual review |
| Browser errors | No uncaught page JavaScript errors in verification flow |
| Live AI | **UNVERIFIED**, zero live checks passed: `npm run verify:live` exited 1 because `server/.env` is absent and both AI settings are missing |
| Demo startup | Actual demo entry point served built student page (HTTP 200), explicit mock status and fixed-clock ranked seed `[3,2,1]` using isolated temporary SQLite |
| PPTX integrity/layout | Five slides, 16:9, native comparison table on slide 4; package and layout validators found zero findings/warnings |

## Evidence and reproduction

From the repository root, after the three `npm ci` installation commands in README:

```sh
npm test
npm run build
npm run simulate
npm run verify:ui
npm run slides
npm run pptx
npm run verify:pptx
```

The browser script uses mock analysis for the routine/hazard and boundary simulations. The fallback case injects a fake stalled fetch into the actual OpenAI adapter. It never sends a real network request to OpenAI. Adapter “live verification” unit assertions use fake successful output solely to test the status logic; these are not evidence of real provider success.

The full UI report includes Chrome version, individual checks and observed orders. PNGs show the student form, ranked admin queue, exact-boundary queue, timeout/manual review and mobile layouts. Test and simulation reports correspond to these fictional fixtures, not campus outcomes.

## Presentation format and actual application verification

`docs/CampusTriage.pptx` preserves the five-slide HTML presentation, its layout, fictional UI screenshot and the recorded simulation values. Text is editable and slide 4 contains a native editable table. Because the bundled presentation runtime is unavailable, conversion uses installed Keynote 13.1 with temporary source assets and a small Office XML adjustment for text positioning/alignment. No replacement presentation library was installed.

The final PPTX was reopened in Keynote, which reported exactly **five slides**, and exported PNG renders of every slide. Each final render was inspected at full size: headings, screenshot, explanatory text and table results are readable without clipping or overlap. Minor application typography/table-border differences from HTML remain. Package integrity and layout geometry validators passed with zero findings. `pptx-verification.json` records the PPTX hash, actual render application, counts and table/result assertions. The comparison remains FIFO `[1,2,3]`, ranking just before the boundary `[3,2,1]`, and ranking at 48 hours `[3,1,2]`.

Keynote conversion initially took longer while reading Desktop assets. The reproducible exporter now uses temporary assets outside Desktop. System Events UI inspection was unavailable (`osascript is not allowed assistive access`, -1728), but native Keynote open/export commands succeeded without changing privacy permissions. Microsoft PowerPoint itself is not installed, so no claim is made that this file was tested in that application.

Reproduce on macOS with Chrome, Python 3 and Keynote: `npm run pptx` exports and verifies the PPTX; `npm run verify:pptx` reopens/renders an existing file. Generated visual previews stay in ignored `.submission-build/pptx/rendered/`. HTML and PDF source outputs remain available. The first export may take longer while Keynote launches; subsequent exports use a 50-second application timeout.

## Exact live-verification result

`npm run verify:live` exited **1** with:

```text
server/.env not found. Continuing without it.
Live AI UNVERIFIED. Add OPENAI_API_KEY and OPENAI_MODEL to server/.env.
```

No real provider request ran. Consequently the requested real-AI student-form submission and live dashboard summary/evidence/rank-reason checks were blocked and **zero live checks passed**. The 12 passing browser checks use explicit mock or stubbed AI; they are simulation evidence only. The classroom command remains `npm run demo`, with a visible mock/simulation banner. Exact machine-readable status is in `live-results.json`.

## Exact classroom commands

From the repository root with Node.js 22.13+:

```sh
npm ci
npm --prefix server ci
npm --prefix client ci
npm test
npm run build
npm run demo
```

Open **http://localhost:3001**. Demo uses only mock analysis and a clock frozen at `2026-11-24T12:00:00.000Z`. Use an unused file for a clean rehearsal, without deleting prior data:

```sh
DB_PATH=./server/data/final-rehearsal.sqlite npm run demo
```

`npm run simulate` reproduces the policy comparison; `npm run verify:ui` repeats all 12 browser checks. Those checks do not consume a live API key.

## Remaining limitations

Add the two missing AI settings to ignored `server/.env` and run `npm run verify:live`. A provider account with model access, billing/quota and connectivity is necessary. Until that succeeds, demonstrate with explicitly labelled mock mode and disclose that live extraction is unverified.

No authentication, authorization, deployment, rate limiting, factor calibration, completed-review workflow or real-world AI accuracy evaluation is included. Existing persistence-after-restart was demonstrated in the backend milestone; this run also tests database reopen and legacy migration. The browser uses temporary in-memory SQLite for isolation rather than your persistent demo database.
