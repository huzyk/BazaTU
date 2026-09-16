const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = { view: 'current', insurer: null, category: null, q: '' };
const categories = ['Wszystkie','Konkursy i akcje','Promocje i zniżki','Produkty','Procedury i zmiany','Systemy','Szkolenia','Pozostałe'];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmt(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
}
function days(v) { return Math.ceil((new Date(v+'T23:59:59') - new Date()) / 86400000); }
async function api(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error('Serwer zwrócił nieprawidłową odpowiedź'); }
  if (!res.ok) throw new Error(data.error || `Błąd HTTP ${res.status}`);
  return data;
}
function post(url, body) {
  return api(url, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
function setActive(el) { $$('.nav').forEach(x => x.classList.remove('active')); if (el) el.classList.add('active'); }

async function refreshNav() {
  const insurers = await api('/api/insurers');
  $('#insurers').innerHTML = insurers.map(x => `<button class="nav insurerNav" data-insurer="${esc(x.name)}"><span>${esc(x.name)}</span><b>${x.count}</b></button>`).join('');
  const stats = await api('/api/stats');
  $('#nCurrent').textContent = stats.current;
  $('#nExpiring').textContent = stats.expiring;
  $('#nAll').textContent = stats.all;
}

async function render() {
  if (state.view === 'admin') return renderAdmin();
  const params = new URLSearchParams();
  if (state.insurer) params.set('insurer', state.insurer);
  if (state.category) params.set('category', state.category);
  if (state.q) params.set('q', state.q);
  let items = await api('/api/items?' + params.toString());
  if (state.view === 'current') items = items.filter(x => x.status === 'Aktualne');
  if (state.view === 'expiring') items = items.filter(x => x.valid_to && days(x.valid_to) >= 0 && days(x.valid_to) <= 7);
  const title = state.insurer || ({current:'Aktualne',expiring:'Kończące się',all:'Wszystkie komunikaty'}[state.view] || 'Komunikaty');
  $('#content').innerHTML = `
    <div class="pageHead"><h1>${esc(title)}</h1><p>${state.insurer ? 'Komunikaty i wiedza · '+esc(state.insurer) : 'Baza wiedzy TU'}</p></div>
    <div class="toolbar">${categories.map(c => `<button class="filter ${(!state.category&&c==='Wszystkie')||state.category===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}<span class="resultCount">${items.length} wyników</span></div>
    <div class="list">${items.length ? items.map(renderRow).join('') : '<div class="empty">Brak komunikatów.</div>'}</div>`;
}
function renderRow(x) {
  return `<div class="row" data-id="${x.id}"><div><div class="insurer">${esc(x.insurer)}</div><span class="category">${esc(x.category)}</span></div><div><div class="title">${esc(x.title)}</div><div class="meta">${fmt(x.received_at)} · ${esc(x.sender||'—')}</div></div><div class="valid">${x.valid_to?'do '+fmt(x.valid_to):'Bez terminu'}</div><div class="status ${x.status==='Aktualne'?'current':'archived'}">● ${esc(x.status)}</div><div>${x.attachments?'📎 '+x.attachments:''}</div></div>`;
}
async function openDetail(id) {
  const x = await api('/api/items/' + id);
  $('#detail').innerHTML = `<div class="detail"><div class="detailEyebrow">${esc(x.insurer)} · ${esc(x.category)}</div><h2>${esc(x.title)}</h2><div class="mail"><h3>Wiadomość źródłowa</h3><div class="meta">${esc(x.sender||'—')} · ${fmt(x.received_at)} · ${esc(x.source_mailbox||'')}</div><div class="mailBody">${esc(x.body_text||'Brak treści.')}</div>${x.attachments?.length?`<h3>Załączniki (${x.attachments.length})</h3>${x.attachments.map(a=>`<div class="attachment">📎 ${esc(a.filename)}</div>`).join('')}`:''}</div></div>`;
  $('#drawer').classList.add('open');
}
function closeDetail() { $('#drawer').classList.remove('open'); }

async function renderAdmin() {
  const cfg = await api('/api/imap/config');
  const sync = await api('/api/sync/status');
  const folderHtml = cfg.folders.map(folder => {
    const s = sync.find(x => x.folder === folder);
    const label = s ? `UID ${s.lastUid} · ${fmt(s.lastSync)}` : 'jeszcze nie synchronizowano';
    return `<div class="folderLine"><span>📁 ${esc(folder)}</span><small>${esc(label)}</small></div>`;
  }).join('');
  $('#content').innerHTML = `
    <div class="pageHead"><h1>Administracja</h1><p>Skrzynka działa tylko do odczytu. Baza synchronizuje wyłącznie nowe wiadomości.</p></div>
    <div class="adminGrid">
      <div class="panel">
        <div class="panelTitle"><div><h3>Skrzynka LH.pl</h3><p class="meta">${esc(cfg.address)} · ${esc(cfg.host)}:${cfg.port}</p></div><span class="safeBadge">🔒 IMAP read-only</span></div>
        <div class="configGrid"><label>Hasło<input id="imapPassword" type="password" autocomplete="current-password" placeholder="Hasło do skrzynki"></label><label>Szybki podgląd<select id="previewLimit"><option>5</option><option>10</option><option selected>20</option><option>50</option></select></label></div>
        <div class="safetyNote"><b>Synchronizacja przyrostowa</b><br>Pierwsza synchronizacja zapisuje lokalnie wiadomości i załączniki. Kolejne pobierają tylko nowe UID. Skrzynka jest otwierana wyłącznie do odczytu.</div>
        <div class="imapActions"><button id="testImap" class="filter">Test połączenia</button><button id="previewImap" class="filter">Szybki podgląd</button><button id="syncImap" class="primaryBtn">Synchronizuj nowe wiadomości</button><span id="imapStatus" class="meta"></span></div>
      </div>
      <div class="panel"><h3>Stan synchronizacji</h3><div class="folderResults">${folderHtml}</div></div>
    </div><div id="mailPreview" class="previewSection"></div>`;
}
function password() { return $('#imapPassword')?.value || ''; }
async function testImap() {
  if (!password()) return $('#imapStatus').textContent = 'Wpisz hasło.';
  $('#imapStatus').textContent = 'Łączenie…';
  try { await post('/api/imap/test',{password:password()}); $('#imapStatus').textContent='✓ Połączenie działa'; }
  catch(e) { $('#imapStatus').textContent='✕ '+e.message; }
}
async function previewImap() {
  if (!password()) return $('#imapStatus').textContent='Wpisz hasło.';
  $('#imapStatus').textContent='Pobieram nagłówki…';
  try {
    const r=await post('/api/imap/preview',{password:password(),limit:Number($('#previewLimit').value)});
    $('#imapStatus').textContent=`✓ ${r.count} nagłówków`;
    $('#mailPreview').innerHTML=`<div class="previewList">${r.messages.map(m=>`<div class="folderLine"><b>${esc(m.folder)}</b><span>${esc(m.subject)}</span><small>${fmt(m.date)}</small></div>`).join('')}</div>`;
  } catch(e) { $('#imapStatus').textContent='✕ '+e.message; }
}
async function syncImap() {
  if (!password()) return $('#imapStatus').textContent='Wpisz hasło.';
  const btn=$('#syncImap'); btn.disabled=true; $('#imapStatus').textContent='Synchronizuję… pierwsze uruchomienie może potrwać kilka minut.';
  try {
    const r=await post('/api/sync/run',{password:password()});
    $('#imapStatus').textContent=`✓ Zaimportowano ${r.imported} nowych wiadomości.`;
    await refreshNav();
  } catch(e) { $('#imapStatus').textContent='✕ '+e.message; }
  finally { btn.disabled=false; }
}

// Delegacja zdarzeń: działa także dla elementów tworzonych dynamicznie.
document.addEventListener('click', async (e) => {
  const nav=e.target.closest('.nav');
  if (nav) {
    if (nav.classList.contains('insurerNav')) { state.insurer=nav.dataset.insurer; state.view='insurer'; state.category=null; }
    else if (nav.dataset.view) { state.view=nav.dataset.view; state.insurer=null; state.category=null; }
    setActive(nav); await render(); return;
  }
  const filter=e.target.closest('.filter[data-cat]');
  if (filter) { state.category=filter.dataset.cat==='Wszystkie'?null:filter.dataset.cat; await render(); return; }
  const row=e.target.closest('.row[data-id]'); if (row) { await openDetail(row.dataset.id); return; }
  if (e.target.closest('#closeDrawer') || e.target.closest('.drawerBackdrop')) { closeDetail(); return; }
  if (e.target.closest('#testImap')) return testImap();
  if (e.target.closest('#previewImap')) return previewImap();
  if (e.target.closest('#syncImap')) return syncImap();
  if (e.target.closest('#addInsurer')) { const n=prompt('Nazwa towarzystwa:'); if(n){await post('/api/insurers',{name:n});await refreshNav();} }
});
$('#search').addEventListener('input',e=>{state.q=e.target.value;clearTimeout(window.searchTimer);window.searchTimer=setTimeout(render,180)});
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus()}if(e.key==='Escape')closeDetail()});

(async function boot(){
  try { await refreshNav(); await render(); }
  catch(e) { console.error(e); $('#content').innerHTML=`<div class="panel"><h3>Błąd uruchamiania</h3><p>${esc(e.message)}</p></div>`; }
})();
