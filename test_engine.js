const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildBrowserReport} = require('./dist/engine.js');
const base = () => ({company:'Example', website:'https://example.com', persona:'BDM', objective:'Prepare discovery', evidence:[]});
test('empty brief has zero evidence and review coverage', () => {
  const result = buildBrowserReport(base());
  assert.equal(result.review_coverage, 0);
  assert.equal(result.source_count, 0);
  assert.equal(result.playbook.length, 4);
});
test('coverage counts reviewed sources only', () => {
  const data = base();
  data.evidence = [{claim:'One', url:'https://example.com', status:'reviewed'}, {claim:'Two', url:'https://example.com', status:'unreviewed'}, {claim:'Guess', status:'hypothesis'}];
  const result = buildBrowserReport(data);
  assert.equal(result.review_coverage, 50);
  assert.equal(result.hypothesis_count, 1);
});
test('reject invalid links, unsupported roles, missing sources and invalid dates', () => {
  for (const extra of [{website:'javascript:alert(1)'}, {persona:'constructor'}, {company:' '}, {evidence:[{claim:'Claim',status:'reviewed'}]}, {evidence:[{claim:'Claim',status:'hypothesis',observed_at:'2026-02-30'}]}]) {
    assert.throws(() => buildBrowserReport({...base(), ...extra}));
  }
});
test('preserve literal source text for safe UI rendering', () => {
  const data = base(); data.company = '<img src=x onerror=alert(1)>';
  assert.equal(buildBrowserReport(data).company, data.company);
});
test('high-volume hiring produces an explainable RPO opportunity', () => {
  const data = base();
  data.profile = {industry:'Technology', location:'Mumbai', hiring_activity:'high', openings:35, role_families:'Engineering and product', pain_points:['volume-hiring','slow-closures']};
  data.evidence = [{claim:'The company lists 35 open roles.', url:'https://example.com/careers', status:'reviewed'}];
  const result = buildBrowserReport(data);
  assert.equal(result.services[0].name, 'RPO');
  assert.ok(result.opportunity.score >= 65);
  assert.equal(result.opportunity.factors.length, 5);
});
test('leadership demand recommends executive search without inventing evidence', () => {
  const data = base();
  data.profile = {hiring_activity:'active', openings:2, pain_points:['leadership-hiring']};
  const result = buildBrowserReport(data);
  assert.equal(result.services[0].name, 'Executive Search');
  assert.match(result.risks.join(' '), /No public evidence/);
});
