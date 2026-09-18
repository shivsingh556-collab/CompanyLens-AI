'use strict';

const PLAYBOOKS = {
  Sales: [['Lead with the strongest signal', 'Reference one reviewed hiring or growth signal, not a generic company fact.'], ['Confirm the hiring impact', 'Ask how the signal affects hiring volume, speed, quality or compliance.'], ['Position one relevant service', 'Connect only the highest-fit talent solution to the confirmed need.'], ['Secure a clear next step', 'Agree the stakeholder, requirement brief and follow-up date.']],
  BDE: [['Map the account', 'Identify the business unit, geography and hiring owner behind the opportunity.'], ['Open with evidence', 'Use a reviewed signal and one diagnostic question in the first outreach.'], ['Qualify the mandate', 'Confirm roles, volume, budget, timeline and current vendor arrangement.'], ['Create progression', 'Record objections and obtain a concrete next commitment.']],
  BDM: [['Frame the commercial opportunity', 'Connect verified company activity to a measurable recruitment problem.'], ['Map stakeholders', 'Identify the TA user, HR champion, business approver and procurement route.'], ['Shape the solution', 'Combine the best-fit TSS service, delivery model and proof point.'], ['Protect momentum', 'Set a feedback SLA, owner and decision date.']],
  CEO: [['Review strategic fit', 'Separate observable growth or hiring signals from assumptions.'], ['Estimate value and risk', 'Compare potential demand with access, urgency and evidence quality.'], ['Choose a small test', 'Propose a limited role, location or business unit as the entry point.'], ['Set a decision gate', 'Define the success measure, owner and review date.']]
};

const PAIN_POINTS = {
  'volume-hiring': {label: 'High-volume hiring', points: 10},
  'niche-skills': {label: 'Niche or hard-to-find skills', points: 10},
  'slow-closures': {label: 'Slow closures / time-to-hire', points: 8},
  'candidate-dropoff': {label: 'Interview or offer drop-offs', points: 6},
  'leadership-hiring': {label: 'Leadership hiring', points: 9},
  'payroll-compliance': {label: 'Payroll or compliance complexity', points: 9},
  'flexible-workforce': {label: 'Contract / flexible workforce', points: 9},
  'gcc-expansion': {label: 'GCC or new-location expansion', points: 10},
  'campus-hiring': {label: 'Campus / entry-level hiring', points: 7}
};

function cleanText(value, name, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Error(`${name}: enter valid text (up to ${max} characters).`);
  return value.trim();
}

function cleanUrl(value, required = false) {
  value = cleanText(value, 'Source URL', 2048, required);
  if (value) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('Enter a valid HTTP(S) URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use HTTP(S) URLs without credentials.');
  }
  return value;
}

function boundedNumber(value, name, min, max, fallback) {
  if (value === '' || value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return number;
}

function uniquePainPoints(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Pain points must be a list.');
  const result = [...new Set(value)];
  if (result.length > 9 || result.some(item => !Object.hasOwn(PAIN_POINTS, item))) throw new Error('Choose valid hiring challenges.');
  return result;
}

function serviceReason(name, profile) {
  const reasons = {
    'Permanent Staffing': 'Best suited to targeted permanent roles and specialist skill requirements.',
    RPO: 'Useful when hiring volume, closure speed or process ownership needs dedicated capacity.',
    'Executive Search': 'Matches leadership, confidential or business-critical appointments.',
    'Contract Staffing & Payroll': 'Supports flexible headcount, third-party payroll and workforce administration.',
    'Bulk & Campus Hiring': 'Designed for repeatable high-volume or entry-level recruitment.',
    'GCC Talent Acquisition': 'Supports capability-centre growth, new functions and location expansion.',
    'HR Consulting & Compliance': 'Addresses HR-process, statutory and workforce-compliance needs.'
  };
  const role = profile.role_families ? ` Current role focus: ${profile.role_families}.` : '';
  return reasons[name] + role;
}

function recommendServices(profile) {
  const scores = new Map([['Permanent Staffing', 0], ['RPO', 0], ['Executive Search', 0], ['Contract Staffing & Payroll', 0], ['Bulk & Campus Hiring', 0], ['GCC Talent Acquisition', 0], ['HR Consulting & Compliance', 0]]);
  const add = (service, points) => scores.set(service, scores.get(service) + points);
  const pains = new Set(profile.pain_points);
  if (profile.openings >= 1) add('Permanent Staffing', 4);
  if (profile.openings >= 6) { add('RPO', 5); add('Permanent Staffing', 3); }
  if (profile.openings >= 20) { add('RPO', 8); add('Bulk & Campus Hiring', 5); }
  if (pains.has('volume-hiring')) { add('RPO', 8); add('Bulk & Campus Hiring', 6); }
  if (pains.has('niche-skills')) add('Permanent Staffing', 9);
  if (pains.has('slow-closures')) { add('RPO', 6); add('Permanent Staffing', 4); }
  if (pains.has('candidate-dropoff')) add('RPO', 4);
  if (pains.has('leadership-hiring')) add('Executive Search', 12);
  if (pains.has('payroll-compliance')) { add('Contract Staffing & Payroll', 9); add('HR Consulting & Compliance', 10); }
  if (pains.has('flexible-workforce')) add('Contract Staffing & Payroll', 12);
  if (pains.has('gcc-expansion')) { add('GCC Talent Acquisition', 14); add('RPO', 5); }
  if (pains.has('campus-hiring')) add('Bulk & Campus Hiring', 12);
  if (profile.hiring_activity === 'urgent') { add('Permanent Staffing', 4); add('RPO', 4); }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).filter(([, score]) => score > 0).slice(0, 3).map(([name, score], index) => ({name, score, priority: index === 0 ? 'Primary' : 'Supporting', reason: serviceReason(name, profile)}));
}

function buildOpportunity(profile, evidence, reviewedCount) {
  const activityPoints = {unknown: 0, low: 5, active: 14, high: 21, urgent: 26}[profile.hiring_activity];
  const openingPoints = profile.openings >= 20 ? 16 : profile.openings >= 6 ? 12 : profile.openings >= 2 ? 7 : profile.openings === 1 ? 3 : 0;
  const challengePoints = Math.min(25, profile.pain_points.reduce((sum, item) => sum + PAIN_POINTS[item].points, 0));
  const contextPoints = Math.min(10, (profile.industry ? 3 : 0) + (profile.location ? 3 : 0) + (profile.role_families ? 4 : 0));
  const evidencePoints = Math.min(15, reviewedCount * 4 + Math.max(0, evidence.length - reviewedCount));
  const total = Math.min(100, activityPoints + openingPoints + challengePoints + contextPoints + evidencePoints);
  const tier = total >= 75 ? 'Priority account' : total >= 55 ? 'Strong prospect' : total >= 35 ? 'Developing opportunity' : 'Needs qualification';
  const nextAction = total >= 75 ? 'Book a discovery call and request the active requirement brief.' : total >= 55 ? 'Contact the hiring stakeholder with one evidence-led question.' : total >= 35 ? 'Validate hiring volume, urgency and decision ownership.' : 'Collect stronger hiring evidence before outreach.';
  return {score: total, tier, next_action: nextAction, factors: [{label: 'Hiring activity', score: activityPoints, max: 26}, {label: 'Potential demand', score: openingPoints, max: 16}, {label: 'TSS problem fit', score: challengePoints, max: 25}, {label: 'Account context', score: contextPoints, max: 10}, {label: 'Evidence readiness', score: evidencePoints, max: 15}]};
}

function discoveryQuestions(profile, services) {
  const questions = [`Which ${profile.role_families || 'roles'} are the hardest to close, and what is the current time-to-hire?`, 'How many positions are approved for the next 90 days, and which locations are highest priority?', 'Where does the current process lose the most time: sourcing, screening, interviews, offers or joining?', 'How are external recruitment partners measured, and who approves a new staffing partner?'];
  if (profile.pain_points.includes('payroll-compliance')) questions.push('Which payroll, statutory or contractor-compliance responsibilities need external support?');
  if (profile.pain_points.includes('gcc-expansion')) questions.push('Which capabilities and launch milestones define success for the GCC or new location?');
  if (services[0]) questions.push(`Would a limited ${services[0].name} pilot on one role family be a useful way to validate delivery?`);
  return questions.slice(0, 6);
}

function risksAndUnknowns(profile, evidence) {
  const risks = [];
  if (!evidence.length) risks.push('No public evidence has been added; the opportunity is based only on user-entered assumptions.');
  if (!evidence.some(item => item.status === 'reviewed')) risks.push('No sourced claim has been marked reviewed yet.');
  if (profile.hiring_activity === 'unknown') risks.push('Current hiring activity is unknown.');
  if (!profile.openings) risks.push('Approved opening volume has not been confirmed.');
  if (!profile.role_families) risks.push('Target role families and skills are not defined.');
  if (!profile.pain_points.length) risks.push('No recruitment pain point has been validated.');
  return risks.length ? risks : ['Core opportunity inputs are present; validate them with the client before committing delivery capacity.'];
}

function buildOutreach(company, profile, services, evidence) {
  const reviewed = evidence.find(item => item.status === 'reviewed');
  const opening = reviewed ? `I noticed that ${reviewed.claim.charAt(0).toLowerCase()}${reviewed.claim.slice(1)}` : `I have been looking at ${company}'s current talent priorities`;
  const service = services[0]?.name || 'recruitment support';
  return `Hi [Name],\n\n${opening}. With ${profile.openings || 'multiple'} potential openings${profile.role_families ? ` across ${profile.role_families}` : ''}, I wanted to understand where your team is seeing the greatest hiring bottleneck.\n\nWe support organisations through ${service}, with the engagement shaped around role complexity, hiring volume and closure timelines. Would a short conversation next week be useful to compare priorities and see whether a focused pilot makes sense?\n\nRegards,\n[Your Name]`;
}

function buildBrowserReport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a brief object.');
  const company = cleanText(data.company, 'Company', 160, true);
  const website = cleanUrl(data.website || '');
  const objective = cleanText(data.objective || 'Qualify the company as a staffing prospect.', 'Objective', 2000, true);
  const persona = data.persona || 'BDM';
  if (!Object.hasOwn(PLAYBOOKS, persona)) throw new Error('Choose a valid persona.');
  const sourceEvidence = data.evidence ?? [];
  if (!Array.isArray(sourceEvidence) || sourceEvidence.length > 30) throw new Error('Supply at most 30 evidence entries.');
  const evidence = sourceEvidence.map(entry => {
    if (!entry || !['reviewed', 'unreviewed', 'hypothesis'].includes(entry.status)) throw new Error('Choose a valid evidence status.');
    const observed_at = cleanText(entry.observed_at || '', 'Source date', 10);
    if (observed_at) {
      const parsed = new Date(observed_at + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(observed_at) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== observed_at || observed_at > new Date().toISOString().slice(0, 10)) throw new Error('Source date must be a real date, today or earlier.');
    }
    return {claim: cleanText(entry.claim, 'Claim', 2000, true), url: cleanUrl(entry.url || '', entry.status !== 'hypothesis'), status: entry.status, observed_at};
  });
  const rawProfile = data.profile || {};
  const hiringActivity = rawProfile.hiring_activity || 'unknown';
  if (!['unknown', 'low', 'active', 'high', 'urgent'].includes(hiringActivity)) throw new Error('Choose a valid hiring activity level.');
  const profile = {industry: cleanText(rawProfile.industry || '', 'Industry', 100), employee_band: cleanText(rawProfile.employee_band || '', 'Employee band', 40), location: cleanText(rawProfile.location || '', 'Location', 300), hiring_activity: hiringActivity, openings: boundedNumber(rawProfile.openings, 'Openings', 0, 10000, 0), role_families: cleanText(rawProfile.role_families || '', 'Role families', 600), pain_points: uniquePainPoints(rawProfile.pain_points)};
  const sourced = evidence.filter(entry => entry.status !== 'hypothesis');
  const reviewed = sourced.filter(entry => entry.status === 'reviewed').length;
  const reviewCoverage = sourced.length ? Math.round(reviewed / sourced.length * 100) : 0;
  const services = recommendServices(profile);
  const opportunity = buildOpportunity(profile, evidence, reviewed);
  return {id: typeof data.id === 'string' ? data.id : crypto.randomUUID(), created_at: Number.isFinite(Date.parse(data.created_at)) ? data.created_at : new Date().toISOString(), company, website, persona, objective, profile, evidence, review_coverage: reviewCoverage, reviewed_count: reviewed, source_count: sourced.length, hypothesis_count: evidence.length - sourced.length, playbook: PLAYBOOKS[persona].map(([action, reason]) => ({action, reason})), opportunity, services, discovery_questions: discoveryQuestions(profile, services), risks: risksAndUnknowns(profile, evidence), outreach: buildOutreach(company, profile, services, evidence), notice: 'Decision support based on user-entered account context and evidence. Verify claims and client needs before outreach or commercial commitment.'};
}

if (typeof module !== 'undefined') module.exports = {buildBrowserReport, recommendServices, PAIN_POINTS};
