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
    'Sales': [('Lead with the strongest signal', 'Reference one reviewed hiring or growth signal, not a generic company fact.'), ('Confirm the hiring impact', 'Ask how the signal affects hiring volume, speed, quality or compliance.'), ('Position one relevant service', 'Connect only the highest-fit talent solution to the confirmed need.'), ('Secure a clear next step', 'Agree the stakeholder, requirement brief and follow-up date.')],
    'BDE': [('Map the account', 'Identify the business unit, geography and hiring owner behind the opportunity.'), ('Open with evidence', 'Use a reviewed signal and one diagnostic question in the first outreach.'), ('Qualify the mandate', 'Confirm roles, volume, budget, timeline and current vendor arrangement.'), ('Create progression', 'Record objections and obtain a concrete next commitment.')],
    'BDM': [('Frame the commercial opportunity', 'Connect verified company activity to a measurable recruitment problem.'), ('Map stakeholders', 'Identify the TA user, HR champion, business approver and procurement route.'), ('Shape the solution', 'Combine the best-fit TSS service, delivery model and proof point.'), ('Protect momentum', 'Set a feedback SLA, owner and decision date.')],
    'CEO': [('Review strategic fit', 'Separate observable growth or hiring signals from assumptions.'), ('Estimate value and risk', 'Compare potential demand with access, urgency and evidence quality.'), ('Choose a small test', 'Propose a limited role, location or business unit as the entry point.'), ('Set a decision gate', 'Define the success measure, owner and review date.')]
}
PAIN_POINTS = {'volume-hiring': ('High-volume hiring', 10), 'niche-skills': ('Niche or hard-to-find skills', 10), 'slow-closures': ('Slow closures / time-to-hire', 8), 'candidate-dropoff': ('Interview or offer drop-offs', 6), 'leadership-hiring': ('Leadership hiring', 9), 'payroll-compliance': ('Payroll or compliance complexity', 9), 'flexible-workforce': ('Contract / flexible workforce', 9), 'gcc-expansion': ('GCC or new-location expansion', 10), 'campus-hiring': ('Campus / entry-level hiring', 7)}

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

def integer(value, name, minimum, maximum, fallback=0):
    if value in ('', None):
        return fallback
    try:
        value = int(value)
    except (TypeError, ValueError):
        raise ValueError(f'{name} must be between {minimum} and {maximum}.') from None
    if value < minimum or value > maximum:
        raise ValueError(f'{name} must be between {minimum} and {maximum}.')
    return value

def recommend_services(profile):
    scores = {name: 0 for name in ('Permanent Staffing', 'RPO', 'Executive Search', 'Contract Staffing & Payroll', 'Bulk & Campus Hiring', 'GCC Talent Acquisition', 'HR Consulting & Compliance')}
    pains = set(profile['pain_points'])
    if profile['openings'] >= 1: scores['Permanent Staffing'] += 4
    if profile['openings'] >= 6: scores['RPO'] += 5; scores['Permanent Staffing'] += 3
    if profile['openings'] >= 20: scores['RPO'] += 8; scores['Bulk & Campus Hiring'] += 5
    if 'volume-hiring' in pains: scores['RPO'] += 8; scores['Bulk & Campus Hiring'] += 6
    if 'niche-skills' in pains: scores['Permanent Staffing'] += 9
    if 'slow-closures' in pains: scores['RPO'] += 6; scores['Permanent Staffing'] += 4
    if 'candidate-dropoff' in pains: scores['RPO'] += 4
    if 'leadership-hiring' in pains: scores['Executive Search'] += 12
    if 'payroll-compliance' in pains: scores['Contract Staffing & Payroll'] += 9; scores['HR Consulting & Compliance'] += 10
    if 'flexible-workforce' in pains: scores['Contract Staffing & Payroll'] += 12
    if 'gcc-expansion' in pains: scores['GCC Talent Acquisition'] += 14; scores['RPO'] += 5
    if 'campus-hiring' in pains: scores['Bulk & Campus Hiring'] += 12
    if profile['hiring_activity'] == 'urgent': scores['Permanent Staffing'] += 4; scores['RPO'] += 4
    reasons = {'Permanent Staffing': 'Best suited to targeted permanent roles and specialist skill requirements.', 'RPO': 'Useful when hiring volume, closure speed or process ownership needs dedicated capacity.', 'Executive Search': 'Matches leadership, confidential or business-critical appointments.', 'Contract Staffing & Payroll': 'Supports flexible headcount, third-party payroll and workforce administration.', 'Bulk & Campus Hiring': 'Designed for repeatable high-volume or entry-level recruitment.', 'GCC Talent Acquisition': 'Supports capability-centre growth, new functions and location expansion.', 'HR Consulting & Compliance': 'Addresses HR-process, statutory and workforce-compliance needs.'}
    ranked = sorted(((name, score) for name, score in scores.items() if score), key=lambda item: item[1], reverse=True)[:3]
    return [{'name': name, 'score': score, 'priority': 'Primary' if index == 0 else 'Supporting', 'reason': reasons[name] + (f" Current role focus: {profile['role_families']}." if profile['role_families'] else '')} for index, (name, score) in enumerate(ranked)]

def opportunity(profile, evidence, reviewed):
    activity = {'unknown': 0, 'low': 5, 'active': 14, 'high': 21, 'urgent': 26}[profile['hiring_activity']]
    openings = 16 if profile['openings'] >= 20 else 12 if profile['openings'] >= 6 else 7 if profile['openings'] >= 2 else 3 if profile['openings'] == 1 else 0
    challenge = min(25, sum(PAIN_POINTS[item][1] for item in profile['pain_points']))
    context = min(10, (3 if profile['industry'] else 0) + (3 if profile['location'] else 0) + (4 if profile['role_families'] else 0))
    readiness = min(15, reviewed * 4 + max(0, len(evidence) - reviewed))
    score = min(100, activity + openings + challenge + context + readiness)
    tier = 'Priority account' if score >= 75 else 'Strong prospect' if score >= 55 else 'Developing opportunity' if score >= 35 else 'Needs qualification'
    action = 'Book a discovery call and request the active requirement brief.' if score >= 75 else 'Contact the hiring stakeholder with one evidence-led question.' if score >= 55 else 'Validate hiring volume, urgency and decision ownership.' if score >= 35 else 'Collect stronger hiring evidence before outreach.'
    return {'score': score, 'tier': tier, 'next_action': action, 'factors': [{'label': 'Hiring activity', 'score': activity, 'max': 26}, {'label': 'Potential demand', 'score': openings, 'max': 16}, {'label': 'TSS problem fit', 'score': challenge, 'max': 25}, {'label': 'Account context', 'score': context, 'max': 10}, {'label': 'Evidence readiness', 'score': readiness, 'max': 15}]}

def build_report(data):
    if not isinstance(data, dict):
        raise ValueError('Expected a JSON object.')
    company = string(data.get('company', ''), 'Company', 160, True)
    website = web_url(data.get('website', ''))
    persona = data.get('persona', 'BDM')
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
    raw_profile = data.get('profile') or {}
    if not isinstance(raw_profile, dict):
        raise ValueError('Profile must be an object.')
    hiring_activity = raw_profile.get('hiring_activity', 'unknown')
    if hiring_activity not in ('unknown', 'low', 'active', 'high', 'urgent'):
        raise ValueError('Choose a valid hiring activity level.')
    pain_points = raw_profile.get('pain_points', [])
    if not isinstance(pain_points, list) or len(pain_points) > 9 or any(item not in PAIN_POINTS for item in pain_points):
        raise ValueError('Choose valid hiring challenges.')
    pain_points = list(dict.fromkeys(pain_points))
    profile = {'industry': string(raw_profile.get('industry', ''), 'Industry', 100), 'employee_band': string(raw_profile.get('employee_band', ''), 'Employee band', 40), 'location': string(raw_profile.get('location', ''), 'Location', 300), 'hiring_activity': hiring_activity, 'openings': integer(raw_profile.get('openings', 0), 'Openings', 0, 10000), 'role_families': string(raw_profile.get('role_families', ''), 'Role families', 600), 'pain_points': pain_points}
    sourced = [e for e in evidence if e['status'] != 'hypothesis']
    reviewed = sum(e['status'] == 'reviewed' for e in sourced)
    coverage = round(100 * reviewed / len(sourced)) if sourced else 0
    services = recommend_services(profile)
    questions = [f"Which {profile['role_families'] or 'roles'} are the hardest to close, and what is the current time-to-hire?", 'How many positions are approved for the next 90 days, and which locations are highest priority?', 'Where does the current process lose the most time: sourcing, screening, interviews, offers or joining?', 'How are external recruitment partners measured, and who approves a new staffing partner?']
    if 'payroll-compliance' in pain_points: questions.append('Which payroll, statutory or contractor-compliance responsibilities need external support?')
    if 'gcc-expansion' in pain_points: questions.append('Which capabilities and launch milestones define success for the GCC or new location?')
    if services: questions.append(f"Would a limited {services[0]['name']} pilot on one role family be a useful way to validate delivery?")
    risks = []
    if not evidence: risks.append('No public evidence has been added; the opportunity is based only on user-entered assumptions.')
    if not any(item['status'] == 'reviewed' for item in evidence): risks.append('No sourced claim has been marked reviewed yet.')
    if hiring_activity == 'unknown': risks.append('Current hiring activity is unknown.')
    if not profile['openings']: risks.append('Approved opening volume has not been confirmed.')
    if not profile['role_families']: risks.append('Target role families and skills are not defined.')
    if not pain_points: risks.append('No recruitment pain point has been validated.')
    if not risks: risks.append('Core opportunity inputs are present; validate them with the client before committing delivery capacity.')
    reviewed_evidence = next((item for item in evidence if item['status'] == 'reviewed'), None)
    opening = f"I noticed that {reviewed_evidence['claim'][0].lower() + reviewed_evidence['claim'][1:]}" if reviewed_evidence else f"I have been looking at {company}'s current talent priorities"
    service = services[0]['name'] if services else 'recruitment support'
    outreach = f"Hi [Name],\n\n{opening}. With {profile['openings'] or 'multiple'} potential openings" + (f" across {profile['role_families']}" if profile['role_families'] else '') + f", I wanted to understand where your team is seeing the greatest hiring bottleneck.\n\nWe support organisations through {service}, with the engagement shaped around role complexity, hiring volume and closure timelines. Would a short conversation next week be useful to compare priorities and see whether a focused pilot makes sense?\n\nRegards,\n[Your Name]"
    return {'id': str(uuid.uuid4()), 'created_at': datetime.now(timezone.utc).isoformat(), 'company': company, 'website': website, 'persona': persona, 'objective': objective, 'profile': profile, 'evidence': evidence, 'review_coverage': coverage, 'reviewed_count': reviewed, 'source_count': len(sourced), 'hypothesis_count': sum(e['status'] == 'hypothesis' for e in evidence), 'playbook': [{'action': a, 'reason': r} for a, r in PERSONAS[persona]], 'opportunity': opportunity(profile, evidence, reviewed), 'services': services, 'discovery_questions': questions[:6], 'risks': risks, 'outreach': outreach, 'notice': 'Decision support based on user-entered account context and evidence. Verify claims and client needs before outreach or commercial commitment.'}

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
