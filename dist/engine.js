'use strict';
function buildBrowserReport(data) {
  function text(value, name, max, required = false) {
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Error(`${name}: enter valid text (up to ${max} characters).`);
    return value.trim();
  }
  function url(value, required = false) {
    value = text(value, 'Source URL', 2048, required);
    if (value) { let parsed; try { parsed = new URL(value); } catch { throw new Error('Enter a valid HTTP(S) URL.'); } if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use HTTP(S) URLs without credentials.'); }
    return value;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a brief object.');
  const company = text(data.company, 'Company', 160, true), website = url(data.website || ''), objective = text(data.objective, 'Objective', 2000, true);
  if (!Object.hasOwn(PLAYBOOKS, data.persona)) throw new Error('Choose a valid persona.');
  if (!Array.isArray(data.evidence) || data.evidence.length > 30) throw new Error('Supply at most 30 evidence entries.');
  const evidence = data.evidence.map(entry => {
    if (!entry || !['reviewed', 'unreviewed', 'hypothesis'].includes(entry.status)) throw new Error('Choose a valid evidence status.');
    const observed_at = text(entry.observed_at || '', 'Source date', 10);
    if (observed_at) {
      const parsed = new Date(observed_at + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(observed_at) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== observed_at || observed_at > new Date().toISOString().slice(0, 10)) throw new Error('Source date must be a real date, today or earlier.');
    }
    return {claim: text(entry.claim, 'Claim', 2000, true), url: url(entry.url || '', entry.status !== 'hypothesis'), status: entry.status, observed_at};
  });
  const sourced = evidence.filter(entry => entry.status !== 'hypothesis');
  const reviewed = sourced.filter(entry => entry.status === 'reviewed').length;
  return {id: crypto.randomUUID(), created_at: new Date().toISOString(), company, website, persona: data.persona, objective, evidence, review_coverage: sourced.length ? Math.round(reviewed / sourced.length * 100) : 0, reviewed_count: reviewed, source_count: sourced.length, hypothesis_count: evidence.length - sourced.length, playbook: PLAYBOOKS[data.persona].map(([action, reason]) => ({action, reason})), notice: 'Researcher-supplied evidence. Reviewed means marked reviewed by you, not independently verified. Playbooks are templates, not AI-generated company findings. No live research has run.'};
}
if (typeof module !== 'undefined') module.exports = {buildBrowserReport};
const PLAYBOOKS = {"Sales": [["Choose a relevant opening", "Use a reviewed source to open the conversation."], ["Confirm the impact", "Ask what this change means for time, revenue or risk."], ["Test the need", "Ask whether this is a priority and how it is handled today."], ["Agree a next step", "Define one useful follow-up and its owner."]], "BDE": [["Map the account", "Identify the relevant business unit and geography."], ["Prepare outreach", "Reference one source and ask one diagnostic question."], ["Qualify timing", "Confirm urgency, current approach and decision process."], ["Log the learning", "Record objections and update the working hypothesis."]], "BDM": [["Frame the opportunity", "Connect the supplied evidence to a commercial hypothesis."], ["Map stakeholders", "Identify champion, user and approver during discovery."], ["Challenge the thesis", "Ask what would disprove the proposed need."], ["Plan progression", "Agree proof, owner and next commitment."]], "CEO": [["Review the evidence", "Separate observed changes from assumptions."], ["Identify uncertainty", "Prioritise the unanswered questions with highest decision impact."], ["Choose one experiment", "Define a small, reversible test of the thesis."], ["Set a decision gate", "Assign an owner, success measure and review date."]]};
