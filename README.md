# CompanyLens AI

Evidence-backed company research and role-specific strategy workspace for Sales, BDE, BDM and business leaders.

## What makes it different

Most company-research tools mix facts and AI assumptions. CompanyLens AI keeps an **Evidence Ledger**: every recommendation is marked as verified evidence, a signal that needs verification, or a hypothesis for discovery.

One research request produces four decision views:

- **Sales:** conversation hooks and diagnostic questions
- **BDE:** account mapping and outreach preparation
- **BDM:** commercial thesis, stakeholder map and deal progression
- **CEO / Strategy:** patterns, priorities and reversible experiments

## Included MVP

- Responsive, interactive frontend in `dist/index.html`
- Persona-specific strategy playbooks
- Confidence score and evidence ledger
- Copyable executive brief and JSON export
- Importable free n8n workflow in `dist/companylens-free-workflow.json`
- No paid AI key required for the initial evidence-intake workflow

## Run locally

Open `dist/index.html` in a browser.

## n8n setup

1. Self-host n8n Community Edition.
2. Import `dist/companylens-free-workflow.json`.
3. Activate the workflow and send a POST request to its webhook with:

```json
{
  "company": "Example Company",
  "website": "https://example.com",
  "persona": "BDM",
  "objective": "Prepare a first discovery conversation"
}
```

The free workflow reads the supplied official website, extracts basic evidence and returns a structured research ledger. Future versions can add primary-source news, careers signals and optional AI synthesis.

## Responsible-use rule

Use public sources only. Verify facts before outreach. Do not scrape private profiles, bypass access controls, or treat hypotheses as company truth.

## Status

MVP in active development.
