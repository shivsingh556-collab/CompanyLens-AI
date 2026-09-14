'use strict';
const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];
let persona = 'Sales', evidence = [], currentReport = null, history = [], dirty = false;
const browserStorage = document.body.dataset.storage === 'browser';
const storageKey = 'companylens.briefs.v1';
function loadBrowserHistory() {
  const rows = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(rows)) throw new Error('Saved research could not be read. Export a backup before clearing browser storage.');
  return rows.map(row => {
    const checked = buildBrowserReport(row);
    if (typeof row.id !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw new Error('A saved brief is damaged. Browser storage was left unchanged.');
    return {...checked, id: row.id, created_at: row.created_at};
  });
}
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let toastTimer;
function notify(message) { q('#toast').textContent = message; q('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => q('#toast').classList.remove('show'), 4500); }
async function api(path, options = {}) {
  const response = await fetch(path, {...options, signal: AbortSignal.timeout(10000)});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
function markDirty() {
  dirty = true;
  q('#reportState').textContent = 'Unsaved changes. Save research brief to update the report. Exports use the last saved version.';
}
function setPersona(value) {
  persona = value;
  qa('.persona').forEach(button => { const active = button.dataset.persona === value; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}
function renderDraft() {
  q('#draftEvidence').innerHTML = evidence.map((item, index) => `<div class="draft-item"><b>${index + 1}. ${escapeHTML(item.claim)}</b><p class="help">${escapeHTML(item.status)}${item.observed_at ? ' · ' + escapeHTML(item.observed_at) : ''}</p><button class="ghost" type="button" data-remove="${index}">Remove entry ${index + 1}</button></div>`).join('');
}
function sourceLink(item) {
  try { const url = new URL(item.url); if (!['http:', 'https:'].includes(url.protocol)) return 'No public source'; return `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(url.hostname)}</a>${item.observed_at ? '<br>' + escapeHTML(item.observed_at) : ''}`; } catch { return 'Discovery required'; }
}
function renderReport(report) {
  currentReport = report;
  q('#report').hidden = false;
  q('#companyTitle').textContent = report.company;
  q('#personaLabel').textContent = `${report.persona.toUpperCase()} DECISION VIEW`;
  q('#objectiveText').textContent = report.objective;
  q('#playbookTitle').textContent = `${report.persona} playbook`;
  q('#scoreValue').textContent = report.review_coverage + '%';
  q('.score').style.setProperty('--score', `${report.review_coverage}%`);
  q('.score').title = `${report.reviewed_count} of ${report.source_count} sourced claims marked reviewed by you. Not a confidence score.`;
  q('#sourceCount').textContent = report.source_count;
  q('#hypothesisCount').textContent = report.hypothesis_count;
  q('#triggerList').innerHTML = report.evidence.length ? report.evidence.map(item => `<div class="trigger"><i class="signal"></i><div><b>${escapeHTML(item.claim)}</b><p>${item.status === 'reviewed' ? 'Marked reviewed by the researcher; not independently verified.' : item.status === 'hypothesis' ? 'Working assumption. Confirm during discovery.' : 'Source supplied. Review before using in outreach.'}</p></div><span class="confidence">${escapeHTML(item.status)}</span></div>`).join('') : '<p class="help">No company evidence added yet. The playbook below is general guidance; it is not a research finding.</p>';
  q('#playbook').innerHTML = report.playbook.map((item, i) => `<div class="play-item"><span>0${i + 1}</span><div><b>${escapeHTML(item.action)}</b><p>${escapeHTML(item.reason)}</p></div></div>`).join('');
  q('#evidenceBody').innerHTML = report.evidence.map(item => `<tr><td>${escapeHTML(item.claim)}</td><td>${escapeHTML(item.status)}</td><td>${sourceLink(item)}</td></tr>`).join('');
  q('#reportState').textContent = `Saved ${new Date(report.created_at).toLocaleString()}. ${report.notice}`;
}
function renderHistory() {
  const search = q('#historySearch').value.toLowerCase();
  const filtered = history.filter(item => `${item.company} ${item.objective}`.toLowerCase().includes(search));
  q('#historyList').innerHTML = filtered.length ? filtered.map(item => `<button class="ghost history-item" data-id="${escapeHTML(item.id)}">${escapeHTML(item.company)}<small>${escapeHTML(item.persona)} · ${new Date(item.created_at).toLocaleDateString()}</small></button>`).join('') : '<p class="help">No saved briefs found.</p>';
}
async function refreshHistory() { history = browserStorage ? loadBrowserHistory() : (await api('/api/briefs')).briefs; renderHistory(); }
q('#historySearch').addEventListener('input', renderHistory);
q('#historyList').addEventListener('click', event => {
  const button = event.target.closest('[data-id]'); if (!button) return;
  if (dirty && !confirm('Discard unsaved changes and open this saved brief?')) return;
  const item = history.find(row => row.id === button.dataset.id);
  if (!item) return;
  q('#company').value = item.company; q('#website').value = item.website; q('#objective').value = item.objective;
  evidence = item.evidence.map(entry => ({...entry})); setPersona(item.persona); renderDraft(); renderReport(item); dirty = false;
});
qa('.persona').forEach(button => button.addEventListener('click', () => { setPersona(button.dataset.persona); markDirty(); }));
q('#researchForm').addEventListener('input', markDirty);
q('#evidenceStatus').addEventListener('change', () => { q('#sourceUrl').required = q('#evidenceStatus').value !== 'hypothesis'; });
q('#sourceUrl').required = true;
q('#sourceDate').max = new Date().toLocaleDateString('en-CA');
q('#evidenceForm').addEventListener('submit', event => {
  event.preventDefault();
  if (evidence.length >= 30) return notify('A brief can contain up to 30 evidence entries.');
  const claim = q('#claim').value.trim();
  if (!claim) return notify('Enter a claim or hypothesis.');
  evidence.push({claim, url: q('#sourceUrl').value.trim(), observed_at: q('#sourceDate').value, status: q('#evidenceStatus').value});
  q('#evidenceForm').reset(); q('#sourceUrl').required = true; renderDraft(); markDirty(); notify('Evidence added. Save the brief to store it.');
});
q('#draftEvidence').addEventListener('click', event => { const button = event.target.closest('[data-remove]'); if (button) { evidence.splice(Number(button.dataset.remove), 1); renderDraft(); markDirty(); } });
q('#researchForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (q('#claim').value.trim()) return notify('Add the pending evidence entry to the ledger, or clear it before saving.');
  q('#runBtn').disabled = true; q('#loading').classList.add('show');
  try {
    const payload = {company:q('#company').value.trim(), website:q('#website').value.trim(), objective:q('#objective').value.trim(), persona, evidence};
    let report;
    if (browserStorage) {
      report = buildBrowserReport(payload);
      const rows = loadBrowserHistory();
      try { localStorage.setItem(storageKey, JSON.stringify([report, ...rows])); }
      catch { throw new Error('Browser storage is unavailable or full. Export existing briefs to back them up.'); }
    } else {
      report = await api('/api/briefs', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    }
    renderReport(report); dirty = false; notify('Research brief saved.');
    try { await refreshHistory(); } catch { notify('Brief saved, but history could not refresh. Reload to see it.'); }
  } catch (error) { notify(`Could not save: ${error.message}`); }
  finally { q('#runBtn').disabled = false; q('#loading').classList.remove('show'); }
});
function briefText(report) {
  return `${report.company} — ${report.persona} brief\nObjective: ${report.objective}\nSaved: ${report.created_at}\n\nEvidence\n${report.evidence.map(item => `• ${item.claim} [${item.status}]\n  ${item.url || 'Discovery required'} ${item.observed_at}`).join('\n')}\n\nReview coverage: ${report.review_coverage}% (${report.reviewed_count}/${report.source_count} sourced claims). Not a confidence score.\n\nPlaybook\n${report.playbook.map((item, i) => `${i + 1}. ${item.action}: ${item.reason}`).join('\n')}\n\n${report.notice}`;
}
q('#copyBtn').addEventListener('click', async () => {
  if (!currentReport) return;
  try { await navigator.clipboard.writeText(briefText(currentReport)); notify('Saved brief copied with sources and review labels.'); }
  catch { notify('Clipboard unavailable. Use Export JSON or Print / Save PDF.'); }
});
q('#exportBtn').addEventListener('click', () => {
  if (!currentReport) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(currentReport, null, 2)], {type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = `${currentReport.company.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'company'}-brief.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
q('#printBtn').addEventListener('click', () => { if (currentReport) window.print(); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
setPersona('Sales');
(async () => {
  if (browserStorage) {
    q('#connectionStatus').innerHTML = '<span class="dot"></span><span>Saved on this browser</span>';
    q('#reportState').textContent = 'Your research stays in this browser. It does not sync across devices. Export JSON backups before clearing browser data. Live research is not connected.';
    try { await refreshHistory(); } catch (error) { notify(error.message); }
    return;
  }
  try { await api('/api/health'); await refreshHistory(); q('#connectionStatus').innerHTML = '<span class="dot"></span><span>Local database connected</span>'; }
  catch { q('#connectionStatus').textContent = 'Backend unavailable'; q('#reportState').textContent = 'Start the workspace with python3 server.py, then open http://127.0.0.1:8000. Saving requires the backend.'; }
})();
