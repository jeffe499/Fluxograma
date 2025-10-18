const JSONBIN_BIN_ID = '68f2dc8c43b1c97be96dfc5c';
const JSONBIN_MASTER_KEY = '$2a$10$3LMKVXiRGejkqgkKPn1PLue3gId0dWY/xN2fjHq1RCtx8UPYZicfq';
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';

const LS_USERS = 'ef_users';
const LS_CURRENT = 'ef_current';
const LS_PREFIX = 'ef_user_';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const el = (id) => document.getElementById(id);

function uid(prefix = 'id') {
  return prefix + Math.random().toString(36).slice(2, 9);
}
function pad(n) {
  return String(n).padStart(2, '0');
}
async function hashPassword(password) {
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(LS_USERS) || '[]');
  } catch {
    return [];
  }
}
function saveUsers(u) {
  localStorage.setItem(LS_USERS, JSON.stringify(u));
}
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
  } catch {
    return { subjects: [], tasks: [], settings: {} };
  }
}
function saveUserData(id, data) {
  localStorage.setItem(LS_PREFIX + id, JSON.stringify(data));
}

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
function logout() {
  localStorage.removeItem(LS_CURRENT);
}

let CURRENT = null;
let DATA = null;
let lastTriggeredTask = null;
let currentFilter = 'all';
let currentSearch = '';

function renderSubjects() {
  const sel = el('subject');
  sel.innerHTML = '';
  DATA.subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  const legend = el('subjectLegend');
  legend.innerHTML = '';
  DATA.subjects.forEach(s => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="dot" style="background:${s.color}"></span><span class="name">${s.name}</span>`;
    legend.appendChild(item);
  });
}

function matchesFilter(t) {
  if (currentSearch) {
    const needle = currentSearch.toLowerCase();
    if (!(t.title.toLowerCase().includes(needle) || (t.description || '').toLowerCase().includes(needle))) return false;
  }
  if (currentFilter === 'all') return true;
  if (currentFilter === 'upcoming') {
    if (t.done) return false;
    if (!t.date && !t.time) return true;
    const iso = `${t.date || ''}T${t.time || '00:00'}:00`;
    const target = new Date(iso).getTime();
    return isNaN(target) ? true : target >= Date.now();
  }
  if (currentFilter === 'done') return !!t.done;
  return true;
}

function renderTasks() {
  const wrap = el('tasks');
  wrap.innerHTML = '';
  const sorted = DATA.tasks.slice().sort((a, b) => {
    const ka = (a.date || '') + (a.time || '') + (a.title || '');
    const kb = (b.date || '') + (b.time || '') + (b.title || '');
    return ka > kb ? 1 : -1;
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
    const subj = DATA.subjects.find(s => s.id === t.subjectId);
    dot.style.background = subj ? subj.color : '#ccc';
    titleEl.textContent = t.title;
    const descPreview = t.description ? (' — ' + (t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description)) : '';
    metaEl.textContent = `${t.date || ''} ${t.time || ''}${descPreview}`;
    if (t.done) article.classList.add('done');
    markBtn.textContent = t.done ? '✔' : 'Marcar';
    markBtn.setAttribute('aria-pressed', t.done ? 'true' : 'false');
    markBtn.onclick = async () => {
      t.done = !t.done;
      await saveAndRender();
    };
    delBtn.onclick = async () => {
      DATA.tasks = DATA.tasks.filter(x => x.id !== t.id);
      await saveAndRender();
    };
    article.onclick = (e) => {
      if (e.target === markBtn || e.target === delBtn) return;
      lastTriggeredTask = t;
      showOverlay(t);
    };
    wrap.appendChild(node);
  });
}

async function saveAndRender() {
  if (!CURRENT) return;
  saveUserData(CURRENT, DATA);
  renderSubjects();
  renderTasks();
  setStatus('salvo local');
}

async function addTaskFromForm() {
  const title = el('title').value.trim();
  if (!title) return alert('Coloque um título');
  const description = el('description') ? el('description').value.trim() : '';
  const subjectId = el('subject').value;
  const date = el('date').value;
  const time = el('time').value;
  const durationMin = Number(el('duration').value) || 30;
  const t = { id: uid('t'), title, description, subjectId, date, time, durationMin, done: false, notified: false };
  DATA.tasks.push(t);
  el('title').value = '';
  if (el('description')) el('description').value = '';
  el('duration').value = '';
  await saveAndRender();
}

function playBeepSequence() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
  } catch (e) { console.warn('Audio failed', e); }
}
function ringBellVisual() {
  const bell = el('bell');
  if (!bell) return;
  bell.classList.remove('ring');
  void bell.offsetWidth;
  bell.classList.add('ring');
  bell.addEventListener('animationend', () => bell.classList.remove('ring'), { once: true });
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
  el('overlayTitle').textContent = task.title || 'Notificação';
  el('overlayTime').textContent = (task.date ? task.date + ' ' : '') + (task.time || '');
  el('overlayDescription').value = task.description || '';
  overlay.classList.remove('hidden');
  lastTriggeredTask = task;
  setTimeout(() => el('overlayClose').focus(), 100);
}
function hideOverlay() {
  el('overlay').classList.add('hidden');
}

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().then(() => { });
}
function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, { body, renotify: true });
    try { n.onclick = () => window.focus(); } catch (e) { }
  }
}

function triggerAlarm(task) {
  if (task.notified) return;
  task.notified = true;
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
  } catch (e) { }
}

function checkAlarms() {
  if (!DATA || !Array.isArray(DATA.tasks)) return;
  const now = Date.now();
  DATA.tasks.forEach(t => {
    if (!t.date || !t.time) return;
    const iso = `${t.date}T${t.time}:00`;
    const target = new Date(iso).getTime();
    if (isNaN(target)) return;
    const diff = now - target;
    if (Math.abs(diff) <= 60 * 1000 && !t.notified && !t.done) {
      triggerAlarm(t);
    }
    if (diff > 5 * 60 * 1000 && !t.notified) {
      t.notified = true;
      saveUserData(CURRENT, DATA);
    }
  });
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

function setStatus(t) {
  const s = el('status');
  if (s) s.textContent = t;
}

function exportData() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estudafacil_export_${(new Date()).toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importDataFromPrompt() {
  const txt = prompt('Cole o JSON para importar (substitui os dados atuais)');
  if (!txt) return;
  try {
    const parsed = JSON.parse(txt);
    if (!parsed || typeof parsed !== 'object') throw new Error('JSON inválido');
    DATA = parsed;
    saveUserData(CURRENT, DATA);
    renderSubjects();
    renderTasks();
    setStatus('importado');
  } catch (e) {
    alert('Import falhou: ' + e.message);
  }
}

function clearDoneTasks() {
  DATA.tasks = DATA.tasks.filter(t => !t.done);
  saveAndRender();
}

function wireUI() {
  el('btnRegister').onclick = async () => {
    const u = el('username').value.trim();
    const p = el('password').value;
    try {
      await register(u, p);
      el('authMsg').textContent = 'Registrado — faça login';
    } catch (e) {
      el('authMsg').textContent = 'Erro: ' + e.message;
    }
  };
  el('btnLogin').onclick = async () => {
  const u = el('username').value.trim();
  const p = el('password').value;
  try {
    const id = await login(u, p);
    CURRENT = id;
    DATA = loadUserData(CURRENT);
    el('who').textContent = u;

    // esconder a área de auth e marcar aria-hidden
    el('auth').classList.add('hidden');
    el('auth').setAttribute('aria-hidden', 'true');

    // mostrar a app e marcar aria-hidden
    el('app').classList.remove('hidden');
    el('app').setAttribute('aria-hidden', 'false');

    // render UI
    renderSubjects();
    renderTasks();
    setStatus('logado');

    // foco no campo principal da app para melhorar UX
    setTimeout(() => {
      const first = el('title') || el('addBtn');
      if (first) first.focus();
    }, 120);
  } catch (e) {
    el('authMsg').textContent = 'Erro: ' + e.message;
  }
};

 el('btnLogout').onclick = () => {
  logout();
  CURRENT = null;
  DATA = null;

  // mostrar auth, esconder app
  el('auth').classList.remove('hidden');
  el('auth').setAttribute('aria-hidden', 'false');

  el('app').classList.add('hidden');
  el('app').setAttribute('aria-hidden', 'true');

  setStatus('desconectado');

  // foco no usuário para login rápido
  setTimeout(() => {
    el('username')?.focus();
  }, 80);
};


  el('addBtn').onclick = addTaskFromForm;

  el('btnSync').onclick = async () => {
    const ok = confirm('OK = enviar; Cancel = baixar');
    if (ok) await syncToJsonBin();
    else await pullFromJsonBin();
  };

  el('overlayClose').onclick = hideOverlay;
  $$('.snooze').forEach(btn => {
    btn.onclick = () => {
      if (lastTriggeredTask) {
        const m = Number(btn.getAttribute('data-min')) || 5;
        addMinutesToTaskTime(lastTriggeredTask, m);
        hideOverlay();
        setStatus(`adiado ${m} min`);
      }
    };
  });

  el('bell').onclick = () => {
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


  setInterval(checkAlarms, 10 * 1000);
  setTimeout(checkAlarms, 1000);

  el('search').addEventListener('input', (e) => {
    currentSearch = e.target.value.trim();
    renderTasks();
  });
  $$('.filter').forEach(f => {
    f.addEventListener('click', () => {
      $$('.filter').forEach(x => x.classList.remove('active'));
      f.classList.add('active');
      currentFilter = f.getAttribute('data-filter') || 'all';
      renderTasks();
    });
  });

  el('clearDone').onclick = clearDoneTasks;
  el('exportBtn').onclick = exportData;
  el('importBtn').onclick = importDataFromPrompt;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOverlay();
  });
}

wireUI();

window._debug = { loadUsers, loadUserData, saveUserData, checkAlarms, DATA };
