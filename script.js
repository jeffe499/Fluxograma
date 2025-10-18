/* script.js - EstudaFácil
   - Suporta campo description
   - Filtros: all / upcoming (não concluídas) / done (concluídas)
   - Notificações, som, visual e TTS
   - Sync/Import/Export robustos
*/

const JSONBIN_BIN_ID = '68f2dc8c43b1c97be96dfc5c';
const JSONBIN_MASTER_KEY = '$2a$10$3LMKVXiRGejkqgkKPn1PLue3gId0dWY/xN2fjHq1RCtx8UPYZicfq';
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';

const LS_USERS = 'ef_users';
const LS_CURRENT = 'ef_current';
const LS_PREFIX = 'ef_user_';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const el = (id) => document.getElementById(id);

function uid(prefix = 'id') { return prefix + Math.random().toString(36).slice(2, 9); }
function pad(n) { return String(n).padStart(2, '0'); }

async function hashPassword(password) {
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* --- storage helpers --- */
function loadUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS) || '[]'); } catch { return []; }
}
function saveUsers(u) { localStorage.setItem(LS_USERS, JSON.stringify(u)); }
function loadUserData(id) {
  const k = LS_PREFIX + id;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) {
      return {
        subjects: [
          { id: 's1', name: 'Matemática', color: '#7c5cff' },
          { id: 's2', name: 'Português', color: '#00d1b2' },
          { id: 's3', name: 'Ciências', color: '#ff6b9a' }
        ],
        tasks: [],
        settings: { notifications: true, studySessionMinutes: 50 }
      };
    }
    return JSON.parse(raw);
  } catch { return { subjects: [], tasks: [], settings: {} }; }
}
function saveUserData(id, data) {
  if (!id) return;
  try { localStorage.setItem(LS_PREFIX + id, JSON.stringify(data)); } catch (e) { console.warn('saveUserData failed', e); }
}

/* --- auth --- */
async function register(username, password) {
  if (!username || !password) throw new Error('Preencha usuário e senha');
  const users = loadUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('Usuário já existe');
  const hash = await hashPassword(password);
  const id = uid('u');
  users.push({ id, username, hash });
  saveUsers(users);
  saveUserData(id, loadUserData(id));
  return id;
}
async function login(username, password) {
  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) throw new Error('Usuário não encontrado');
  const h = await hashPassword(password);
  if (h !== user.hash) throw new Error('Senha inválida');
  localStorage.setItem(LS_CURRENT, user.id);
  return user.id;
}
function logout() { localStorage.removeItem(LS_CURRENT); }

/* --- app state --- */
let CURRENT = null;
let DATA = null;
let lastTriggeredTask = null;
let currentFilter = 'all'; // all | upcoming | done
let currentSearch = '';

/* --- rendering --- */
function renderSubjects() {
  const sel = el('subject');
  if (!sel) return;
  sel.innerHTML = '';
  (DATA.subjects || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  const legend = el('subjectLegend');
  if (legend) {
    legend.innerHTML = '';
    (DATA.subjects || []).forEach(s => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="dot" style="background:${s.color}"></span><span class="name">${s.name}</span>`;
      legend.appendChild(item);
    });
  }
}

function matchesFilter(t) {
  // search first
  if (currentSearch) {
    const needle = currentSearch.toLowerCase();
    if (!(String(t.title || '').toLowerCase().includes(needle) ||
          (t.description || '').toLowerCase().includes(needle))) {
      return false;
    }
  }
  if (currentFilter === 'all') return true;
  if (currentFilter === 'upcoming') {
    // Upcoming = tarefas NÃO concluídas
    return !t.done;
  }
  if (currentFilter === 'done') {
    return !!t.done;
  }
  return true;
}

function renderTasks() {
  const wrap = el('tasks');
  if (!wrap) return;
  wrap.innerHTML = '';
  const sorted = (DATA.tasks || []).slice().sort((a, b) => {
    // sort by date/time/title (undefined => last)
    const da = a.date || '';
    const db = b.date || '';
    const ta = a.time || '';
    const tb = b.time || '';
    const ka = `${da} ${ta} ${a.title || ''}`;
    const kb = `${db} ${tb} ${b.title || ''}`;
    return ka > kb ? 1 : (ka < kb ? -1 : 0);
  });
  const template = el('task-template');
  sorted.forEach(t => {
    if (typeof t.notified === 'undefined') t.notified = false;
    if (!matchesFilter(t)) return;
    const node = template.content.cloneNode(true);
    const article = node.querySelector('article');
    const titleEl = article.querySelector('.task-title');
    const metaEl = article.querySelector('.task-meta');
    const dot = article.querySelector('.subject-dot');
    const markBtn = article.querySelector('.mark');
    const delBtn = article.querySelector('.delete');

    const subj = (DATA.subjects || []).find(s => s.id === t.subjectId);
    dot.style.background = subj ? subj.color : '#ccc';
    titleEl.textContent = t.title || '(sem título)';

    const descPreview = t.description ? (' — ' + (t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description)) : '';
    metaEl.textContent = `${t.date || ''} ${t.time || ''}${descPreview}`;

    if (t.done) article.classList.add('done'); else article.classList.remove('done');

    markBtn.textContent = t.done ? '✔' : 'Marcar';
    markBtn.setAttribute('aria-pressed', t.done ? 'true' : 'false');
    markBtn.onclick = async (e) => {
      e.stopPropagation();
      t.done = !t.done;
      // quando marcar como concluída, garantir que notificado não irá disparar novamente
      if (t.done) t.notified = true;
      await saveAndRender();
    };

    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Excluir tarefa?')) return;
      DATA.tasks = DATA.tasks.filter(x => x.id !== t.id);
      await saveAndRender();
    };

    article.onclick = () => {
      lastTriggeredTask = t;
      showOverlay(t);
    };

    wrap.appendChild(node);
  });
}

/* --- save / add --- */
async function saveAndRender() {
  if (!CURRENT || !DATA) return;
  saveUserData(CURRENT, DATA);
  renderSubjects();
  renderTasks();
  setStatus('salvo local');
}

async function addTaskFromForm() {
  const title = (el('title')?.value || '').trim();
  if (!title) return alert('Coloque um título');
  const description = el('description') ? (el('description').value || '').trim() : '';
  const subjectId = el('subject') ? el('subject').value : (DATA.subjects && DATA.subjects[0] ? DATA.subjects[0].id : '');
  const date = el('date') ? el('date').value : '';
  const time = el('time') ? el('time').value : '';
  const durationMin = Number(el('duration')?.value) || 30;
  const t = { id: uid('t'), title, description, subjectId, date, time, durationMin, done: false, notified: false };
  DATA.tasks.push(t);
  if (el('title')) el('title').value = '';
  if (el('description')) el('description').value = '';
  if (el('duration')) el('duration').value = '';
  await saveAndRender();
}

/* --- audio / visuals / notifications --- */

async function playBeepSequence() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try { await ctx.resume(); } catch (e) { /* ignore */ }
    }
    const now = ctx.currentTime;
    const notes = [880, 988, 1047];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + i * 0.12);
      g.gain.linearRampToValueAtTime(0.12, now + i * 0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.12);
      o.stop(now + i * 0.12 + 0.14);
    });
  } catch (e) {
    console.warn('playBeepSequence error', e);
  }
}

function ringBellVisual() {
  const bell = el('bell');
  if (!bell) return;
  bell.classList.remove('ring');
  void bell.offsetWidth;
  bell.classList.add('ring');
  const onEnd = () => {
    bell.classList.remove('ring');
    bell.removeEventListener('animationend', onEnd);
  };
  bell.addEventListener('animationend', onEnd);
}

function confettiBurst() {
  const colors = ['#ff6b9a', '#6bf2a1', '#7c5cff', '#ffd86b', '#00d1b2'];
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${20 + Math.random() * 60}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    document.body.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }
}

function showOverlay(task) {
  const overlay = el('overlay');
  if (!overlay) return;
  el('overlayTitle').textContent = task.title || 'Notificação';
  el('overlayTime').textContent = (task.date ? task.date + ' ' : '') + (task.time || '');
  el('overlayDescription').value = task.description || '';
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  lastTriggeredTask = task;
  setTimeout(() => el('overlayClose')?.focus(), 120);
}
function hideOverlay() {
  const overlay = el('overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

/* --- notifications permission helpers --- */
function requestNotificationPermissionIfNeeded() {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  if (Notification.permission === 'denied') return Promise.resolve('denied');
  return Notification.requestPermission();
}

function showNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, renotify: true });
    n.onclick = () => {
      try { window.focus(); } catch (e) { }
    };
  } catch (e) {
    console.warn('showNotification failed', e);
  }
}

/* --- alarm logic --- */

function parseTaskTimestamp(task) {
  // Return millisecond timestamp (local) or NaN
  if (!task || !task.date) return NaN;
  const parts = task.date.split('-').map(x => Number(x));
  if (parts.length < 3 || parts.some(isNaN)) return NaN;
  let hh = 0, mm = 0, ss = 0;
  if (task.time) {
    const t = task.time.split(':').map(x => Number(x));
    if (!isNaN(t[0])) hh = t[0];
    if (!isNaN(t[1])) mm = t[1];
    if (!isNaN(t[2])) ss = t[2] || 0;
  }
  return new Date(parts[0], parts[1] - 1, parts[2], hh, mm, ss).getTime();
}

function triggerAlarm(task) {
  if (!task || task.notified) return;
  task.notified = true;
  // evitar retrigger se usuário marcou como concluída pouco depois
  if (task.done) { saveAndRender(); return; }
  saveAndRender();
  ringBellVisual();
  playBeepSequence();
  confettiBurst();
  showOverlay(task);
  showNotification('Hora da tarefa', `${task.title} ${task.date || ''} ${task.time || ''}`);
  try {
    if (window.speechSynthesis) {
      const m = new SpeechSynthesisUtterance(`${task.title} agora`);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(m);
    }
  } catch (e) { /* ignore */ }
}

function checkAlarms() {
  try {
    if (!DATA || !Array.isArray(DATA.tasks)) return;
    const now = Date.now();
    DATA.tasks.forEach(t => {
      if (!t.date) return; // sem data não tem horário exato
      const target = parseTaskTimestamp(t);
      if (isNaN(target)) return;
      const diff = target - now; // positivo => future, negative => past
      // disparar se dentro de ±60s
      if (diff >= -60 * 1000 && diff <= 60 * 1000 && !t.notified && !t.done) {
        triggerAlarm(t);
      }
      // se passou mais de 5 minutos e ainda não notificado, marcar para não repetir
      if (diff < -5 * 60 * 1000 && !t.notified) {
        t.notified = true;
        saveUserData(CURRENT, DATA);
      }
    });
  } catch (e) {
    console.error('checkAlarms error', e);
  }
}

function addMinutesToTaskTime(task, minutes) {
  const newDate = new Date(Date.now() + minutes * 60 * 1000);
  const yyyy = newDate.getFullYear();
  const mm = pad(newDate.getMonth() + 1);
  const dd = pad(newDate.getDate());
  const hh = pad(newDate.getHours());
  const min = pad(newDate.getMinutes());
  task.date = `${yyyy}-${mm}-${dd}`;
  task.time = `${hh}:${min}`;
  task.notified = false;
  saveAndRender();
}

/* --- jsonbin sync / import / export --- */
async function syncToJsonBin() {
  if (!JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY) return alert('JSONBin não configurado');
  try {
    const url = `${JSONBIN_BASE}/${JSONBIN_BIN_ID}`;
    const res = await fetch(url, { headers: { 'X-Master-Key': JSONBIN_MASTER_KEY } });
    if (!res.ok) throw new Error(res.statusText || res.status);
    const payload = await res.json();
    const record = payload.record || {};
    record['user_' + CURRENT] = DATA;
    const put = await fetch(url, { method: 'PUT', headers: { 'X-Master-Key': JSONBIN_MASTER_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
    if (!put.ok) throw new Error(put.statusText || put.status);
    setStatus('sincronizado');
  } catch (e) {
    alert('Sync falhou: ' + e.message);
  }
}
async function pullFromJsonBin() {
  if (!JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY) return alert('JSONBin não configurado');
  try {
    const url = `${JSONBIN_BASE}/${JSONBIN_BIN_ID}`;
    const res = await fetch(url, { headers: { 'X-Master-Key': JSONBIN_MASTER_KEY } });
    if (!res.ok) throw new Error(res.statusText || res.status);
    const payload = await res.json();
    const record = payload.record || {};
    const remote = record['user_' + CURRENT];
    if (remote) {
      DATA = remote;
      saveUserData(CURRENT, DATA);
      renderSubjects();
      renderTasks();
      setStatus('baixado');
    } else {
      alert('Nada no bin para seu usuário');
    }
  } catch (e) {
    alert('Pull falhou: ' + e.message);
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estudafacil_${(new Date()).toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!parsed || typeof parsed !== 'object') throw new Error('JSON inválido');
      if (!confirm('Importar este arquivo substituirá seus dados atuais. Continuar?')) return;
      DATA = parsed;
      saveUserData(CURRENT, DATA);
      renderSubjects();
      renderTasks();
      setStatus('importado');
      alert('Importação concluída');
    } catch (e) {
      alert('Import falhou: ' + e.message);
    }
  };
  reader.onerror = () => alert('Erro lendo o arquivo');
  reader.readAsText(file, 'utf-8');
}

function clearDoneTasks() {
  DATA.tasks = (DATA.tasks || []).filter(t => !t.done);
  saveAndRender();
}

/* --- UI wiring --- */
function setStatus(t) {
  const s = el('status');
  if (s) s.textContent = t;
}

function wireUI() {
  // Register
  el('btnRegister').onclick = async () => {
    const u = (el('username')?.value || '').trim();
    const p = el('password')?.value || '';
    try {
      await register(u, p);
      el('authMsg').textContent = 'Registrado — faça login';
    } catch (e) {
      el('authMsg').textContent = 'Erro: ' + e.message;
    }
  };

  // Login
  el('btnLogin').onclick = async () => {
    const u = (el('username')?.value || '').trim();
    const p = el('password')?.value || '';
    try {
      const id = await login(u, p);
      CURRENT = id;
      DATA = loadUserData(CURRENT);
      el('who').textContent = u;
      el('auth').classList.add('hidden');
      el('auth').setAttribute('aria-hidden', 'true');
      el('app').classList.remove('hidden');
      el('app').setAttribute('aria-hidden', 'false');
      renderSubjects();
      renderTasks();
      setStatus('logado');
      setTimeout(() => { el('title')?.focus(); }, 120);
      // pedir permissão de notificação após login para melhorar a UX
      requestNotificationPermissionIfNeeded().then(p => { if (p === 'granted') setStatus('notificações permitidas'); });
    } catch (e) {
      el('authMsg').textContent = 'Erro: ' + e.message;
    }
  };

  // Logout
  el('btnLogout').onclick = () => {
    logout();
    CURRENT = null;
    DATA = null;
    el('auth').classList.remove('hidden');
    el('auth').setAttribute('aria-hidden', 'false');
    el('app').classList.add('hidden');
    el('app').setAttribute('aria-hidden', 'true');
    setStatus('desconectado');
    setTimeout(() => el('username')?.focus(), 120);
  };

  // Add task
  el('addBtn').onclick = addTaskFromForm;

  // Overlay controls
  el('overlayClose').onclick = hideOverlay;
  $$('.snooze').forEach(btn => {
    btn.onclick = () => {
      if (!lastTriggeredTask) return;
      const m = Number(btn.getAttribute('data-min')) || 5;
      addMinutesToTaskTime(lastTriggeredTask, m);
      hideOverlay();
      setStatus(`adiado ${m} min`);
    };
  });

  // Bell
  el('bell').onclick = async () => {
    await requestNotificationPermissionIfNeeded();
    if (lastTriggeredTask) {
      ringBellVisual();
      playBeepSequence();
      showOverlay(lastTriggeredTask);
    } else {
      const test = { title: 'Nenhuma notificação ativa', description: 'Ainda não há tarefas no momento.', date: '', time: '' };
      ringBellVisual();
      playBeepSequence();
      showOverlay(test);
    }
  };

  // restore session if present
  const cur = localStorage.getItem(LS_CURRENT);
  if (cur) {
    CURRENT = cur;
    DATA = loadUserData(CURRENT);
    const users = loadUsers();
    const u = users.find(x => x.id === CURRENT);
    el('who').textContent = u ? u.username : 'Usuário';
    el('auth').classList.add('hidden');
    el('auth').setAttribute('aria-hidden', 'true');
    el('app').classList.remove('hidden');
    el('app').setAttribute('aria-hidden', 'false');
    renderSubjects();
    renderTasks();
    setStatus('restaurado');
  } else {
    setStatus('pronto');
    el('auth').classList.remove('hidden');
    el('auth').setAttribute('aria-hidden', 'false');
    el('app').classList.add('hidden');
    el('app').setAttribute('aria-hidden', 'true');
  }

  // alarm check
  setInterval(checkAlarms, 10 * 1000);
  setTimeout(checkAlarms, 1000);

  // search
  el('search')?.addEventListener('input', (e) => {
    currentSearch = e.target.value.trim();
    renderTasks();
  });

  // filters
  $$('.filter').forEach(f => {
    f.addEventListener('click', () => {
      $$('.filter').forEach(x => x.classList.remove('active'));
      f.classList.add('active');
      currentFilter = f.getAttribute('data-filter') || 'all';
      renderTasks();
    });
  });

  // actions
  el('clearDone').onclick = clearDoneTasks;
  el('exportBtn').onclick = exportData;
  el('importBtn').onclick = () => el('importFile')?.click();

  // import file input safe binding
  const importFileEl = el('importFile');
  if (importFileEl) {
    importFileEl.addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      handleImportFile(file);
      ev.target.value = '';
    });
  }

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOverlay();
  });

  // sync buttons (if exist)
  const btnSync = el('btnSync');
  if (btnSync) {
    btnSync.onclick = async () => {
      if (!CURRENT) return alert('Faça login para sincronizar');
      if (!confirm('Deseja sincronizar seus dados atuais no JSONBin?')) return;
      await syncToJsonBin();
    };
  }
  const btnPull = el('btnPull');
  if (btnPull) {
    btnPull.onclick = async () => {
      if (!CURRENT) return alert('Faça login para baixar dados');
      if (!confirm('Deseja baixar os dados do JSONBin e substituir os locais?')) return;
      await pullFromJsonBin();
    };
  }
}

wireUI();

/* --- debug helpers --- */
window._debug = { loadUsers, loadUserData, saveUserData, checkAlarms, DATA, syncToJsonBin, pullFromJsonBin };
