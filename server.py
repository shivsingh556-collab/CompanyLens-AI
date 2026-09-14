"""CompanyLens local research workspace. Python standard library only."""
import json
import os
import sqlite3
import uuid
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('COMPANYLENS_DB', ROOT / 'data' / 'companylens.sqlite3'))
PERSONAS = {
    'Sales': [('Choose a relevant opening', 'Use a reviewed source to open the conversation.'), ('Confirm the impact', 'Ask what this change means for time, revenue or risk.'), ('Test the need', 'Ask whether this is a priority and how it is handled today.'), ('Agree a next step', 'Define one useful follow-up and its owner.')],
    'BDE': [('Map the account', 'Identify the relevant business unit and geography.'), ('Prepare outreach', 'Reference one source and ask one diagnostic question.'), ('Qualify timing', 'Confirm urgency, current approach and decision process.'), ('Log the learning', 'Record objections and update the working hypothesis.')],
    'BDM': [('Frame the opportunity', 'Connect the supplied evidence to a commercial hypothesis.'), ('Map stakeholders', 'Identify champion, user and approver during discovery.'), ('Challenge the thesis', 'Ask what would disprove the proposed need.'), ('Plan progression', 'Agree proof, owner and next commitment.')],
    'CEO': [('Review the evidence', 'Separate observed changes from assumptions.'), ('Identify uncertainty', 'Prioritise the unanswered questions with highest decision impact.'), ('Choose one experiment', 'Define a small, reversible test of the thesis.'), ('Set a decision gate', 'Assign an owner, success measure and review date.')]
}

def connection():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.execute('CREATE TABLE IF NOT EXISTS briefs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, body TEXT NOT NULL)')
    return conn

def string(value, name, maximum, required=False):
    if not isinstance(value, str):
        raise ValueError(f'{name} must be text.')
    value = value.strip()
    if len(value) > maximum or (required and not value):
        raise ValueError(f'{name} is required and must be at most {maximum} characters.' if required else f'{name} must be at most {maximum} characters.')
    return value

def web_url(value, required=False):
    value = string(value, 'Source URL', 2048, required)
    if value:
        try:
            parts = urlsplit(value)
            if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password:
                raise ValueError()
            parts.port
        except ValueError:
            raise ValueError('Use a valid http or https URL without credentials.') from None
    return value

def build_report(data):
    if not isinstance(data, dict):
        raise ValueError('Expected a JSON object.')
    company = string(data.get('company', ''), 'Company', 160, True)
    website = web_url(data.get('website', ''))
    persona = data.get('persona', 'Sales')
    if not isinstance(persona, str) or persona not in PERSONAS:
        raise ValueError('Choose Sales, BDE, BDM or CEO.')
    objective = string(data.get('objective', ''), 'Objective', 2000, True)
    entries = data.get('evidence', [])
    if not isinstance(entries, list) or len(entries) > 30:
        raise ValueError('Supply at most 30 evidence entries.')
    evidence = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('Each evidence entry must be an object.')
        status = entry.get('status', 'unreviewed')
        if status not in ('unreviewed', 'reviewed', 'hypothesis'):
            raise ValueError('Invalid evidence status.')
        observed = string(entry.get('observed_at', ''), 'Source date', 10)
        if observed:
            try:
                if date.fromisoformat(observed) > date.today():
                    raise ValueError()
            except ValueError:
                raise ValueError('Source date must be a real date, today or earlier.') from None
        source = web_url(entry.get('url', ''), status != 'hypothesis')
        evidence.append({'claim': string(entry.get('claim', ''), 'Claim', 2000, True), 'url': source, 'status': status, 'observed_at': observed})
    # Coverage describes the researcher's review process, never truth or AI confidence.
    sourced = [e for e in evidence if e['status'] != 'hypothesis']
    reviewed = sum(e['status'] == 'reviewed' for e in sourced)
    coverage = round(100 * reviewed / len(sourced)) if sourced else 0
    return {'id': str(uuid.uuid4()), 'created_at': datetime.now(timezone.utc).isoformat(), 'company': company, 'website': website, 'persona': persona, 'objective': objective, 'evidence': evidence, 'review_coverage': coverage, 'reviewed_count': reviewed, 'source_count': len(sourced), 'hypothesis_count': sum(e['status'] == 'hypothesis' for e in evidence), 'playbook': [{'action': a, 'reason': r} for a, r in PERSONAS[persona]], 'notice': 'Researcher-supplied evidence. Reviewed means marked reviewed by you, not independently verified. Playbooks are templates, not AI-generated company findings. No live research has run.'}

class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, content_type='application/json; charset=utf-8'):
        raw = json.dumps(body, ensure_ascii=False).encode() if content_type.startswith('application/json') else body
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/health':
            return self.respond(200, {'status': 'ok', 'mode': 'local-research'})
        if path == '/api/briefs':
            with connection() as conn:
                rows = conn.execute('SELECT body FROM briefs ORDER BY created_at DESC LIMIT 100').fetchall()
            return self.respond(200, {'briefs': [json.loads(row[0]) for row in rows]})
        if path.startswith('/api/briefs/'):
            with connection() as conn:
                row = conn.execute('SELECT body FROM briefs WHERE id = ?', (path.rsplit('/', 1)[-1],)).fetchone()
            return self.respond(200, json.loads(row[0])) if row else self.respond(404, {'error': 'Brief not found.'})
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/index.html': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/engine.js': ('engine.js', 'text/javascript; charset=utf-8'), '/companylens-free-workflow.json': ('companylens-free-workflow.json', 'application/octet-stream')}
        if path in files:
            name, mime = files[path]
            target = ROOT / 'dist' / name
            if target.exists():
                raw = target.read_bytes()
                if name == 'index.html':
                    raw = raw.replace(b'data-storage="browser"', b'data-storage="database"')
                return self.respond(200, raw, mime)
        self.respond(404, {'error': 'Not found.'})

    def do_POST(self):
        # Local single-user workspace: reject cross-origin browser writes.
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.respond(403, {'error': 'Cross-origin writes are not allowed.'})
        if urlsplit(self.path).path != '/api/briefs':
            return self.respond(404, {'error': 'Not found.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.respond(415, {'error': 'Send application/json.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 150000:
                return self.respond(413, {'error': 'Request must be between 1 and 150000 bytes.'})
            report = build_report(json.loads(self.rfile.read(size)))
            with connection() as conn:
                conn.execute('INSERT INTO briefs VALUES (?, ?, ?)', (report['id'], report['created_at'], json.dumps(report)))
            self.respond(201, report)
        except (ValueError, UnicodeError) as exc:
            self.respond(400, {'error': str(exc)})
        except sqlite3.Error:
            self.respond(500, {'error': 'Brief could not be saved. Check the database location.'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    print(f'CompanyLens AI: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
