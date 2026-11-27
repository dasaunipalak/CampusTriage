# CampusTriage

AI-assisted campus maintenance prioritisation. A student describes an issue, an analyzer extracts structured information, and the backend explains the pending queue to an admin. Built as a solo Software Engineering prototype for 25 November 2026. Use fictional complaint data for demonstrations.

## Quick start: classroom demo

Requires **Node.js 22.13+** and npm. From the repository root:

```sh
npm ci
npm --prefix server ci
npm --prefix client ci
npm test
npm run build
npm run demo
```

Open **http://localhost:3001**. Student and admin screens share the same server and SQLite API. The demo command explicitly uses **mock analysis**, a clock frozen at `2026-11-24T12:00:00.000Z`, and `server/data/demo.sqlite`. A visible banner labels the simulation. The three seed fixtures are fictional. No key is needed for this mode. Ctrl+C stops the server. Demo submissions and resolutions persist between runs.

For a fresh isolated demo, choose an unused database filename without deleting existing data:

```sh
DB_PATH=./server/data/demo-rehearsal.sqlite npm run demo
```

The original seed command still works: `npm --prefix server run seed`. It only seeds an empty database, uses mock analysis explicitly, and refuses to overwrite complaints. Optional `SEED_NOW` fixes fixture timestamps. Its default database is separate from the demo database.

## Real AI configuration

No provider credentials were configured in this checkout. Default runtime analysis mode is **openai**, never an automatic mock fallback. Create the local configuration:

```sh
cp server/.env.example server/.env
```

Edit `server/.env` locally:

- Set **OPENAI_API_KEY** to your server-side OpenAI API key.
- Set **OPENAI_MODEL** to a model available to your account that supports Responses API strict structured outputs.
- Set `ANALYZER_MODE=openai` or leave it blank for the default.
- Optional `AI_TIMEOUT_MS` defaults to 15000 (integer 1–60000).
- Optional `PORT` defaults to 3001; `DB_PATH` defaults to `server/data/campus-triage.sqlite`.

The example file contains names with empty values only. `.env` files, dependencies, SQLite files/sidecars and common credential files are ignored. Never put the key in `client/` or a `VITE_*` variable.

```sh
npm run verify:live
npm run build
npm start
```

`verify:live` makes one real request using a fictional description, validates its evidence, and prints success only after it succeeds. It exits nonzero on missing configuration or failure. **Live AI is currently UNVERIFIED**. The final submission pass ran `npm run verify:live` and got exit code 1: `server/.env not found. Continuing without it.` followed by `Live AI UNVERIFIED. Add OPENAI_API_KEY and OPENAI_MODEL to server/.env.` No real request was made, and no live form-to-dashboard check passed. Exact results are recorded in `docs/live-results.json`. Adapter tests use fake responses and cannot verify model access, billing, network access or real AI accuracy.

Missing configuration, provider errors, refusals, timeouts and invalid/ungrounded output still save a valid complaint for manual review. Default OpenAI mode with missing settings therefore gives a usable submission flow but cannot demonstrate real hazard extraction. Choose `npm run demo` explicitly for the deterministic classroom demo. Historical seeded/mock results keep their own source labels even when the active server mode is OpenAI.

The adapter calls the [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) with [strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), `store: false`, a server-side key and a bounded deadline. These API references informed the adapter implementation. Only the description is sent; location stays local. External processing still requires appropriate campus consent before any real deployment.

## Development and verification

### Student sign-in and email setup

Student complaint submission requires an OTP login using an `@iiitl.ac.in` address. Copy `server/.env.example` to `server/.env` if you have not already done so. With `OTP_EMAIL_SENDER=console` (the safe default), request a code in the browser and read it in the server terminal (`[student OTP] address: 123456`). This mode never sends email. Automated tests use an in-memory sender.

To send real messages, change only `OTP_EMAIL_SENDER=console` to `OTP_EMAIL_SENDER=smtp` in `server/.env`, fill in the SMTP values below, and restart the backend. The SMTP sender never prints OTPs. On failure it logs a sanitized SMTP diagnostic and the API returns a generic send error. The email address and OTP go to the SMTP server as needed to deliver the sign-in email; SMTP credentials remain server-side. `SESSION_SECRET` should be a long random value for a persistent deployment.

#### Gmail SMTP

Google requires 2-Step Verification before you can create an App Password. In your Google Account, open **Security & sign-in**, enable **2-Step Verification**, then open **App passwords** and create one for CampusTriage. Use that generated App Password as `SMTP_PASS`, not your normal Google Account password. Google's App Password option may be unavailable for some managed/work accounts, Advanced Protection accounts, or accounts using security-key-only 2-Step Verification; see [Google's App Password help](https://support.google.com/accounts/answer/185833).

```dotenv
OTP_EMAIL_SENDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-16-character-app-password
MAIL_FROM="CampusTriage <your-account@gmail.com>"
```

Gmail port **587** uses STARTTLS; port **465** uses SSL/TLS from connection start. Store the App Password only in the ignored `server/.env`. Revoke it in your Google Account when it is no longer needed.

#### Other SMTP providers

Get the SMTP hostname, submission port, username, password/token, and permitted sender address from your provider. Put those values in `server/.env` using the same names: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`. Port 587 uses STARTTLS and port 465 uses SSL/TLS. The verification tool sends one test message (no OTP) to the one recipient you provide:

```powershell
Set-Location "C:\dev\CampusTriage\server"
npm run verify:email -- recipient@example.com
```

For student login, check the inbox **and spam/junk folder**. `server/.env.example` uses placeholders only. Never put SMTP credentials in the frontend, source code, screenshots, or chat. No real email is sent unless you explicitly select `OTP_EMAIL_SENDER=smtp` and invoke a send action.

Backend terminal:

```sh
npm --prefix server run dev
```

Frontend terminal:

```sh
npm run dev
```

Open Vite's printed URL (normally http://localhost:5173). Its `/complaints` and `/api` proxy targets port 3001. With a built frontend, `npm start` or `npm run demo` serves everything from port 3001. No cross-origin browser setup is needed.

```sh
npm test                 # backend, ranking, adapter, migration and simulation tests
npm run build           # production React build
npm run simulate        # fixed-time FIFO comparison; writes docs/simulation-results.json
npm run verify:ui       # real headless browser + temporary HTTP APIs + SQLite
npm run slides          # regenerate 5-slide HTML deck and PDF from recorded evidence
npm run pptx            # export editable PPTX using installed macOS Keynote
npm run verify:pptx     # reopen/render the actual PPTX and verify five slides/results
```

Browser verification uses installed Google Chrome on macOS by default. On another machine set `CHROME_PATH` to a Chrome/Chromium executable, for example `CHROME_PATH=/usr/bin/google-chrome npm run verify:ui`. It uses only temporary in-memory databases and stubbed/mock analysis, never your live database or key. It checks actual student/admin interactions, hazard precedence, exact boundary promotion, resolution, empty/error states, mobile overflow and provider-timeout fallback. It writes `docs/browser-results.json` and `docs/screenshots/`. `npm run slides` requires those screenshots and the same browser executable. PowerPoint export/verification commands additionally require macOS, Python 3 and installed Keynote. They use temporary asset copies outside Desktop and preserve editable slide text and a native comparison table. Rebuilding HTML/PDF does not automatically overwrite the PPTX; run `npm run pptx` after source changes.

Rerun in the final submission pass on 24 November: **24 backend tests passed, 0 failures**; production React build passed; **12 browser checks passed**. Original baseline: 13/13 tests passed before changes. Evidence is in `docs/backend-test-results.txt`, `docs/browser-results.json`, `docs/simulation-results.json`, and the screenshots. None of this establishes live AI accuracy or real campus response-time improvement.

## Rehearse the demo

1. Start `npm run demo` after building. Point out the mock/simulation banner and frozen UTC clock. The seeded queue has a possible hazard first, then a routine fan report waiting 48 hours, then the projector report.
2. Submit “The classroom projector is not working.” in the student screen at a fictional location.
3. Submit “washroom ke socket mein paani ja raha hai” later. In the admin screen, the later hazard goes above the routine submission. Existing hazards use oldest-first ties; on a fresh empty UI test database it is rank 1. Inspect the original text, evidence quote, required review and source label.
4. Mark a complaint resolved. The queue refreshes and that ticket leaves the pending list.
5. Run `npm run simulate` to demonstrate the exact 48-hour boundary and compare identical fictional tickets under FIFO and ranking. `npm run verify:ui` repeats this in the browser with a controlled clock and simulates provider timeout to verify manual review. There is no public endpoint that changes time or forces AI failure.

### Recorded simulation, not field evaluation

Reference before boundary: `2026-11-24T11:59:59.999Z`; at boundary: `2026-11-24T12:00:00.000Z`. All three tickets are pending in this comparison. The fixture factors intentionally differ to make the score rule observable.

| Fictional ticket | Severity / urgency / impact | FIFO position | Ranked just before 48h | Ranked at 48h |
| --- | --- | --- | --- | --- |
| #1 Fan, created 22 Nov 12:00 UTC | 2 / 2 / 4 | 1 | 3 | 2 |
| #2 Projector, created 24 Nov 06:00 UTC | 9 / 9 / 9 | 2 | 2 | 3 |
| #3 Wet electrical socket, created 24 Nov 11:00 UTC | 5 / 5 / 5 | 3 | 1 | 1 |

FIFO ignores possible safety concern. Our ranking moves #3 to position 1 and promotes #1 at the inclusive boundary. This is a deterministic simulation with mock extraction and synthetic scores. The separate browser submission scenario records a new hazard at position 1 and the earlier routine complaint at position 2.

## API contract

Student auth endpoints are under `/api/auth/student`: `POST /request-otp` accepts `{ "email": "name@iiitl.ac.in" }`, `POST /verify-otp` accepts `{ "email": "...", "code": "123456" }`, `GET /me` returns the current session or **401**, and `POST /logout` clears the session cookie. The signed session cookie is `HttpOnly` and `SameSite=Lax`. `POST /complaints` also requires that student session; queue reads retain the existing response shape.

`POST /complaints` accepts JSON `{ "description": "...", "location": "..." }`. Both must be nonblank strings; maximum lengths are 5000 and 200. Original text is preserved. The API ignores supplied status, timestamps, AI fields and factor values. A saved complaint returns **201**, including failed analysis. Validation errors return **400**, oversized bodies **413**.

```sh
curl -i -X POST http://localhost:3001/api/auth/student/request-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"student@iiitl.ac.in"}'
# Read the code from the server terminal, then:
curl -i -c cookies.txt -X POST http://localhost:3001/api/auth/student/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"student@iiitl.ac.in","code":"123456"}'
curl -i -b cookies.txt -X POST http://localhost:3001/complaints \
  -H 'Content-Type: application/json' \
  -d '{"description":"socket mein paani ja raha hai","location":"Fictional hostel"}'
curl http://localhost:3001/complaints
curl -X PATCH http://localhost:3001/complaints/1/resolve
curl http://localhost:3001/api/status
```

Illustrative newly created mock hazard response:

```json
{
  "id": 1,
  "description": "socket mein paani ja raha hai",
  "location": "Fictional hostel",
  "analysis": {
    "category": "electrical",
    "summary": "socket mein paani ja raha hai",
    "possibleSafetyRisk": true,
    "riskEvidence": "socket mein paani ja raha hai",
    "needsReview": true
  },
  "analysisStatus": "succeeded",
  "analysisMode": "mock",
  "analysisError": null,
  "needsReview": true,
  "reviewStatus": "required",
  "createdAt": "2026-11-24T12:00:00.000Z",
  "status": "pending",
  "resolvedAt": null,
  "severity": 5,
  "urgency": 5,
  "impact": 5,
  "scoringSource": "provisional-defaults",
  "ranking": {
    "tier": "safety",
    "score": 4.5,
    "elapsedHours": 0,
    "rankReason": "Possible safety hazard: prioritised for admin review.",
    "factors": { "severity": 5, "urgency": 5, "impact": 5, "waiting": 0 },
    "scoringSource": "provisional-defaults",
    "provisional": true
  }
}
```

`GET /complaints` returns **200** and a ranked JSON array of the same objects, or `[]`. Read nullable `analysis.summary` and `analysis.riskEvidence`; show `analysisMode`, `analysisStatus`, `reviewStatus` and `ranking.rankReason`. The frontend renders backend order without sorting. Times are UTC ISO strings; the browser displays them in local time.

`PATCH /complaints/:id/resolve` returns **200** and the full complaint with `status: "resolved"` and UTC `resolvedAt`. It preserves the first resolution time on retries. Unknown/invalid IDs return **404** and `{ "error": "Complaint not found." }`. Resolution does not certify AI analysis or clear its review flag. No review-completion endpoint is implemented.

`GET /api/status` reports active mode, configured model, missing setting **names**, readiness, whether a live response passed validation in the current server session, simulation flag and reference UTC time. It never includes the key. Readiness means configuration is present, not that the provider works. `liveVerified` is session-local and resets on restart.

## Analyzer boundary and failure behaviour

`server/src/analyzer.js` exports `async analyzeComplaint(description)`, `createAnalyzer(...)` and explicit `mockAnalyzeComplaint(description)`. The agreed result remains:

```json
{
  "category": "electrical",
  "summary": "Water is entering a socket near the washroom.",
  "possibleSafetyRisk": true,
  "riskEvidence": "socket mein paani ja raha hai",
  "needsReview": true
}
```

Require nonblank string category/summary, boolean flags, and string-or-null risk evidence. A possible risk requires nonblank evidence. Every supplied evidence string must be an exact, contiguous, case-sensitive substring of the original description, including on non-risk results. Invalid evidence rejects the entire analysis. Additional result fields are discarded before saving. Any safety flag forces top-level manual review even if the analyzer says `needsReview: false`.

On failure: `analysis: null`, `analysisStatus: "failed"`, `needsReview: true`, `reviewStatus: "required"`, and a generic `analysisError`. Risk is **unknown**, not a successful “no risk”. Failed complaints follow the routine/age rules because no validated safety flag exists. Admins must review these flagged failures; a failure does not automatically enter the hazard tier.

`analysisMode` persists the source (`openai`, `mock`, or `legacy-mock`; test injections use `injected`). Existing milestone databases migrate without deleting records and label historical analysis `legacy-mock`. Mock outputs are never relabelled live. The deterministic mock is a keyword demonstration, not a safety classifier.

## Ranking rules (unchanged)

The pure function `server/src/ranking.js` takes complaints, explicit 0–10 severity/urgency/impact and a reference time. API routes select pending complaints before ranking.

1. Validated possible safety hazards, oldest first for admin review.
2. Other tickets waiting **at least 48 hours**, oldest first regardless of score.
3. Remaining routine tickets by descending score, then oldest first. Exact timestamp ties use ascending ID.

```text
elapsedHours = max(0, (referenceTime - createdAt) / 1 hour)
waiting = min(10, elapsedHours / 6)
score = 0.4 * severity + 0.3 * urgency + 0.2 * impact + 0.1 * waiting
```

New submissions use **provisional severity=5, urgency=5, impact=5**, since the analyzer contract does not supply those factors. Their score starts at 4.5, and waiting adds at most 1 point. Consequently, equal-default routine reports rank oldest first until a tier rule applies. Neither mock nor live AI secretly estimates factor values. API metadata exposes `scoringSource: "provisional-defaults"` and `ranking.provisional: true`. Demo fixtures supply deliberate synthetic factors marked `demo-fixture`; their scores are not measured AI outputs. No factor-editing UI/API is implemented.

## Submission files and limitations

- `docs/SRS.md`: implemented requirements, architecture, data model, failure behaviour and acceptance-test mapping.
- `docs/presentation.html`: self-contained five-slide browser presentation, with real demo screenshots. Open locally; use previous/next buttons or arrow keys.
- `docs/presentation.pdf`: five-page print copy of the same slides.
- `docs/CampusTriage.pptx`: five-slide PowerPoint with editable text and comparison table, exported from the existing HTML layout. The actual PPTX was opened and rendered in Keynote 13.1; all five slides were visually checked. Microsoft PowerPoint itself is not installed/tested.
- `docs/live-results.json` and `docs/pptx-verification.json`: exact live-verification failure and PowerPoint validation receipts.
- `docs/VERIFICATION.md`: actual results and remaining limits.
- `docs/screenshots/`, `docs/browser-results.json`, `docs/simulation-results.json`: recorded fictional demo evidence.

This local prototype has student OTP authentication and request limits, but no admin authorization, notifications, model accuracy study, deployment, backup workflow, multi-campus isolation or review-completion workflow. The server binds to loopback for the classroom demo. It is not ready for public use. The deadline applies to AI fetching and response parsing; database/filesystem failures still return an error and cannot promise persistence. Live OpenAI verification and real SMTP inbox delivery remain unverified external configuration tasks.
