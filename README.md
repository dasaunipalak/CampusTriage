# CampusTriage
Smart Complaint Prioritisation System

Member 2 backend: Express, SQLite persistence, replaceable complaint analysis and pure ranking. Frontend and real AI analysis are owned by teammates. No frontend files are required to run this milestone.

## Run locally

Requires Node.js **22.13+** (SQLite uses the built-in `node:sqlite` module) and npm. Some Node versions print an experimental SQLite warning.

```sh
cd server
npm ci
npm test
npm run seed
npm start
```

API: `http://localhost:3001`. Database: `server/data/campus-triage.sqlite`, created automatically and ignored by Git. `PORT` and `DB_PATH` override these defaults. Relative `DB_PATH` values resolve from the process working directory. Stop with Ctrl+C.

The seed creates three deliberately scored complaints relative to the seed time: a 6-hour-old routine projector complaint (3, 4, 8), an exactly 48-hour-old routine fan complaint (2, 2, 4), and a 1-hour-old possible electrical hazard (9, 10, 7). Their expected queue order is IDs **3, 2, 1**. Seeding refuses a nonempty database and never clears existing complaints. For a separate demo database:

```sh
DB_PATH=./data/demo.sqlite npm run seed
DB_PATH=./data/demo.sqlite npm start
```

Use `SEED_NOW=2026-11-23T12:00:00.000Z npm run seed` for fixed timestamps on a fresh database. Tests freeze their reference time to that instant; the live API always ranks against the current UTC time, so fixture waiting times naturally change.

## API usage

```sh
curl -i -X POST http://localhost:3001/complaints \
  -H 'Content-Type: application/json' \
  -d '{"description":"socket mein paani ja raha hai","location":"Hostel washroom"}'

curl http://localhost:3001/complaints

curl -X PATCH http://localhost:3001/complaints/1/resolve
```

`POST /complaints` requires a JSON object with nonblank string `description` (at most 5000 characters) and `location` (at most 200 characters). Original strings are preserved, including whitespace. Client-supplied status, analysis, timestamps and scoring fields are ignored. Invalid fields/JSON return 400; bodies over 32 KB return 413. A valid submission is saved even if analysis fails. Success returns **201** and the complete saved complaint.

Example successful hazard response (illustrative ID/time; ranking computed at creation):

```json
{
  "id": 1,
  "description": "socket mein paani ja raha hai",
  "location": "Hostel washroom",
  "analysis": {
    "category": "electrical",
    "summary": "socket mein paani ja raha hai",
    "possibleSafetyRisk": true,
    "riskEvidence": "socket mein paani ja raha hai",
    "needsReview": true
  },
  "analysisStatus": "succeeded",
  "analysisError": null,
  "needsReview": true,
  "reviewStatus": "required",
  "createdAt": "2026-11-23T12:00:00.000Z",
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

`GET /complaints` returns **200**, a JSON array of these complaint objects in queue order (`[]` if none). Read `analysis.summary` and `analysis.riskEvidence` only when `analysis` is non-null. Render `reviewStatus` and `ranking.rankReason` directly. Scores use full numeric precision; round for display only.

On failed/invalid analysis, the same complaint structure contains these fields instead (excerpt):

```json
{
  "analysis": null,
  "analysisStatus": "failed",
  "analysisError": "Analysis unavailable or invalid; manual review required.",
  "needsReview": true,
  "reviewStatus": "required"
}
```

This is **unknown risk**, not a successful no-risk result. Successful no-risk analysis has `analysisStatus: "succeeded"`, `analysis.possibleSafetyRisk: false`, and `analysisError: null`. Failed analyses have no inferred safety flag and follow routine ranking while remaining visibly marked for manual review.

`PATCH /complaints/:id/resolve` returns **200**, the full complaint with `status: "resolved"` and a UTC `resolvedAt`; it leaves the pending list. Repeating resolution returns the same status and original resolution timestamp. Unknown or invalid IDs return **404**:

```json
{ "error": "Complaint not found." }
```

Review status means review **required** or **not_required**, not completed approval. Resolving a complaint does not certify an AI result or erase its review flag. There is no review-completion endpoint in this milestone.

For React development, proxy `/complaints` from the frontend dev server to `http://localhost:3001` (including PATCH). This backend does not enable cross-origin access; a dev proxy provides same-origin browser requests. Authentication/authorization must be added before public deployment.

## AI teammate integration

Replace **`server/src/analyzer.js` → `async analyzeComplaint(description)`** with the real implementation. It receives the original description string and must resolve to:

```json
{
  "category": "electrical",
  "summary": "Water is entering a socket near the washroom.",
  "possibleSafetyRisk": true,
  "riskEvidence": "socket mein paani ja raha hai",
  "needsReview": true
}
```

Contract: nonblank string `category` and `summary`; boolean `possibleSafetyRisk` and `needsReview`; `riskEvidence` is a string or `null`, with a nonblank string required for a possible risk. All five fields are required. No numeric severity/urgency/impact is expected from this analyzer contract. Extra fields are discarded. Throw/reject on provider failure; invalid data and rejected analysis are saved as `analysisStatus: "failed"`, `analysis: null`, and manual review required. Configure provider timeouts in the real adapter so requests cannot hang indefinitely. `createApp({ db, analyzer, now })` supports test injection without modifying production code.

The deterministic mock flags electrical keywords (`socket`, `wire`, `electrical`, `spark`, `bijli`) together with risk keywords (`water`, `paani`, `spark`, `exposed`, `shock`, `smoke`, `burn`). It normalizes whitespace for the summary and uses the submitted description as evidence. This is a demo heuristic, not an actual safety assessment. Any possible safety flag forces review even if the analyzer returns `needsReview: false`.

## Ranking and provisional scoring

`server/src/ranking.js` exports pure `rankComplaints(complaints, referenceTime)`. Supply an ISO timestamp or Date and explicit numeric `severity`, `urgency`, `impact` in **[0, 10]**, plus `createdAt` and `analysis` for each complaint. It returns a new sorted array with ranking metadata and does not mutate inputs. The API selects pending complaints before calling it.

1. Possible safety hazards first, oldest first, for admin review.
2. Remaining complaints waiting **at least 48 hours**, oldest first regardless of score.
3. Other routine complaints by descending weighted score, then oldest first. Exact creation-time ties use ascending ID.

```text
elapsedHours = max(0, (referenceTime - createdAt) / 1 hour)
waiting = min(10, elapsedHours / 6)
score = 0.4 * severity + 0.3 * urgency + 0.2 * impact + 0.1 * waiting
```

New submissions use **provisional defaults severity=5, urgency=5, impact=5**, not AI-calibrated estimates. These produce score 4.5 at creation. The API exposes the inputs, `scoringSource: "provisional-defaults"`, and `ranking.provisional: true`. Demo fixtures supply deliberate factors and `scoringSource: "demo-fixture"`; their values are synthetic too, not real AI measurements. There is no factor-editing API yet. Safety and overdue tiers override numeric score.

## Verification

`cd server && npm test` uses Node's built-in test runner, temporary SQLite databases and real HTTP requests on ephemeral loopback ports. Tests cover safety precedence, the inclusive 48-hour boundary, weighted score ordering, exact score ties, waiting bounds, purity, validation, successful/failed/invalid analysis, review flags, demo fixtures, persistence across database reopen, and idempotent resolution/removal/404. Tests never modify your demo database.
