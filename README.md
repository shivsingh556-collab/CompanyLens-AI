# CompanyLens AI

A staffing-sales intelligence workspace for Sales, BDE, BDM and CEO / Strategy users. CompanyLens qualifies a target account, explains its opportunity score, matches relevant talent services and keeps every public-source claim or discovery hypothesis visible before outreach.

## Run

Requires Python 3.10 or newer. No Python packages, paid API keys or n8n setup are needed.

```bash
git clone https://github.com/shivsingh556-collab/CompanyLens-AI.git
cd CompanyLens-AI
python3 server.py
```

Open http://127.0.0.1:8000. On Windows, `py server.py` can be used. The Python server uses SQLite storage. The Vercel static deployment uses browser storage and needs no server setup.

## Vercel deployment

`vercel.json` publishes `dist` from the repository root with no build step. The hosted app stores briefs in the current browser, with a visible storage label. Research is not shared across users or devices. Clearing site data removes that browser’s saved briefs; export JSON backups. Cloud database, account login and live research are not connected.

If the existing Vercel project already uses `dist` as its root directory, it can continue serving the same static files. Do not configure `server.py` as a Vercel serverless database.

## Working features

- Responsive TSS-focused account qualification dashboard with four decision views.
- Explainable 100-point staffing-opportunity score covering hiring activity, potential demand, TSS problem fit, account context and evidence readiness.
- Hiring profile intake: industry, employee size, locations, opening volume, role families and nine common staffing challenges.
- Service matching across Permanent Staffing, RPO, Executive Search, Contract Staffing & Payroll, Bulk & Campus Hiring, GCC Talent Acquisition, and HR Consulting & Compliance.
- Automatically prepared next action, discovery questions, risks / unknowns and editable-ready first outreach draft.
- Evidence intake: claim, public source URL, publication date and review status.
- Separate labels for unreviewed sources, researcher-reviewed claims and hypotheses.
- Review coverage calculated from the proportion of sourced claims marked reviewed. This is **not a truth or confidence score**.
- Saved briefs, searchable history and reopening: SQLite locally, browser storage on Vercel. Saving an edited brief creates a new snapshot.
- Executive brief copy, JSON export and print / Save PDF, retaining source and status information.
- Validation, output escaping, same-origin browser writes and a restricted static-file allowlist.

## Demo flow

1. Enter a target company and its hiring context.
2. Select the likely recruitment problems and decision view.
3. Add at least one reviewed public hiring signal and one hypothesis.
4. Analyse the opportunity and explain the five scoring factors.
5. Review the recommended TSS service, discovery questions, risks and outreach draft.
6. Open the saved account from history, export the structured JSON or print the opportunity brief.

Use actual sourced statements, or clearly identify fictional sample content. A website entered in the company form is a reference, not evidence by itself.

## Current boundaries

This is a **local, single-user MVP**, not a hosted multi-user service. It binds to loopback only and has no accounts or tenant isolation. SQLite lives in `data/companylens.sqlite3`; back up that file to retain research. Do not expose this development server to the internet. A persistent hosted backend and authentication are separate work before public deployment.

Research and account context are entered by the user. The app does not yet crawl websites, search LinkedIn, independently verify claims or run a generative AI model. Scoring and service matching are deterministic and explainable; they are decision support, not proof of client demand. n8n and live research remain deferred. The earlier `dist/companylens-free-workflow.json` is retained as an unconnected experimental artifact.

Local database history displays the most recent 100 saved briefs; older records remain in SQLite and can be fetched by ID. The local mode reports an error if the backend cannot save. Hosted mode reports browser quota or storage errors without claiming the save succeeded. Exports use the last saved report and warn when the form has unsaved edits.

## API and development

- `GET /api/health`: local backend health.
- `GET /api/briefs`: latest 100 snapshots.
- `GET /api/briefs/{id}`: one complete saved report.
- `POST /api/briefs`: validate, build and persist a new snapshot.

POST body:

```json
{
  "company": "Example Company",
  "website": "https://example.com",
  "persona": "BDM",
  "objective": "Prepare discovery",
  "profile": {
    "industry": "Technology",
    "location": "Mumbai",
    "hiring_activity": "high",
    "openings": 25,
    "role_families": "Engineering and product",
    "pain_points": ["volume-hiring", "slow-closures"]
  },
  "evidence": [{
    "claim": "A working assumption to test in discovery",
    "url": "",
    "status": "hypothesis",
    "observed_at": ""
  }]
}
```

Source statuses: `unreviewed`, `reviewed`, `hypothesis`. Non-hypothesis entries require an HTTP(S) URL. Reviewed means the user reviewed the claim; it is never an independent verification guarantee.

`COMPANYLENS_DB` overrides the SQLite path; `PORT` overrides port 8000.

```bash
python3 -m unittest -v
node --check dist/app.js
```
