/* script.js — com overlay full-screen que mostra título + descrição e snooze */

/* ====== CONFIG (JSONBin opcionais) ====== */
const JSONBIN_BIN_ID = '68f2dc8c43b1c97be96dfc5c';
const JSONBIN_MASTER_KEY = '$2a$10$3LMKVXiRGejkqgkKPn1PLue3gId0dWY/xN2fjHq1RCtx8UPYZicfq';
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';

const LS_USERS = 'ef_users';
const LS_CURRENT = 'ef_current';
const LS_PREFIX = 'ef_user_';

/* ====== HELPERS ====== */
const $ = (s)=>document.querySelector(s);
const el = (id)=>document.getElementById(id);
function uid(prefix='id'){ return prefix + Math.random().toString(36).slice(2,9); }
function setStatus(t){ $('#status').textContent = t; }
function pad(n){ return String(n).padStart(2,'0'); }

/* ====== HASH (SHA-256) ====== */
async function hashPassword(password){
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ====== Storage ====== */
function loadUsers(){ try{ return JSON.parse(localStorage.getItem(LS_USERS) || '[]'); } catch { return []; } }
function saveUsers(u){ localStorage.setItem(LS_USERS, JSON.stringify(u)); }
function loadUserData(id){
  const k = LS_PREFIX + id;
  try{ return JSON.parse(localStorage.getItem(k) || 'null') || { subjects:[{id:'s1',name:'Matemática',color:'#7c5cff'},{id:'s2',name:'Português',color:'#00d1b2'}], tasks:[], settings:{notifications:true,studySessionMinutes:50} }; }catch{ return {subjects:[],tasks:[],settings:{}}; }
}
function saveUserData(id,data){ localStorage.setItem(LS_PREFIX + id, JSON.stringify(data)); }

/* ====== AUTH ====== */
async function register(username,password){ if(!username||!password) throw new Error('Preencha usuário e senha'); const users=loadUsers(); if(users.find(u=>u.username.toLowerCase()===username.toLowerCase())) throw new Error('Usuário já existe'); const hash=await hashPassword(password); const id=uid('u'); users.push({id,username,hash}); saveUsers(users); saveUserData(id, loadUserData(id)); return id; }
async function login(username,password){ const users=loadUsers(); const user=users.find(u=>u.username.toLowerCase()===username.toLowerCase()); if(!user) throw new Error('Usuário não encontrado'); const h=await hashPassword(password); if(h!==user.hash) throw new Error('Senha inválida'); localStorage.setItem(LS_CURRENT,user.id); return user.id; }
function logout(){ localStorage.removeItem(LS_CURRENT); }

/* ====== APP STATE ====== */
let CURRENT = null;
let DATA = null;
let lastTriggeredTask = null;

/* ====== RENDER ====== */
function renderSubjects(){
  const sel = el('subject');
  sel.innerHTML = '';
  DATA.subjects.forEach(s=>{ const opt = document.createElement('option'); opt.value=s.id; opt.textContent=s.name; sel.appendChild(opt); });
}
function renderTasks(){
  const wrap = el('tasks'); wrap.innerHTML = '';
  const sorted = DATA.tasks.slice().sort((a,b)=> ((a.date||'')+(a.time||'')) > ((b.date||'')+(b.time||'')) ? 1:-1 );
  sorted.forEach(t=>{
    if(typeof t.notified === 'undefined') t.notified = false;
    const div = document.createElement('div'); div.className='task';
    const descPreview = t.description ? (' — ' + (t.description.length>60? t.description.slice(0,60)+'…': t.description)) : '';
    div.innerHTML = `<div><strong>${t.title}</strong><div class="small muted">${t.date||''} ${t.time||''}${descPreview}</div></div>
      <div>
        <button class="btn alt">${t.done? '✔':'Marcar'}</button>
        <button class="btn alt">Excluir</button>
      </div>`;
    const [markBtn, delBtn] = div.querySelectorAll('button');
    markBtn.onclick = async ()=>{ t.done = !t.done; await saveAndRender(); };
    delBtn.onclick = async ()=>{ DATA.tasks = DATA.tasks.filter(x=>x.id!==t.id); await saveAndRender(); };
    wrap.appendChild(div);
  });
}

/* ====== SAVE ====== */
async function saveAndRender(){ if(!CURRENT) return; saveUserData(CURRENT, DATA); renderTasks(); setStatus('salvo local'); }

/* ====== FORM ====== */
async function addTaskFromForm(){
  const title = el('title').value.trim(); if(!title) return alert('Coloque um título');
  const description = el('description').value.trim();
  const subjectId = el('subject').value; const date = el('date').value; const time = el('time').value;
  const durationMin = Number(el('duration').value) || 30;
  const t = { id: uid('t'), title, description, subjectId, date, time, durationMin, done:false, notified:false };
  DATA.tasks.push(t);
  el('title').value=''; el('description').value=''; el('duration').value='';
  await saveAndRender();
}

/* ====== AUDIO + BELL VISUAL ====== */
function playBeepSequence(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const notes = [880, 988, 1047];
    notes.forEach((freq,i)=>{
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(ctx.destination);
      o.start(now + i*0.12);
      g.gain.linearRampToValueAtTime(0.12, now + i*0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i*0.12 + 0.12);
      o.stop(now + i*0.12 + 0.14);
    });
  }catch(e){ console.warn('Audio failed', e); }
}
function ringBellVisual(){
  const bell = el('bell');
  if(!bell) return;
  bell.classList.remove('ring');
  void bell.offsetWidth;
  bell.classList.add('ring');
}

/* ====== OVERLAY UI ====== */
function showOverlay(task){
  const overlay = el('overlay');
  el('overlayTitle').textContent = task.title || 'Notificação';
  el('overlayTime').textContent = (task.date? task.date + ' ' : '') + (task.time || '');
  el('overlayDescription').value = task.description || '';
  overlay.classList.remove('hidden');
  // store lastTriggeredTask
  lastTriggeredTask = task;
  // focus overlay for accessibility
  setTimeout(()=> el('overlayClose').focus(), 100);
}
function hideOverlay(){ el('overlay').classList.add('hidden'); }

/* ====== Notification (browser + overlay) ====== */
if('Notification' in window && Notification.permission === 'default'){
  Notification.requestPermission().then(()=>{/*ignored*/});
}
function showNotification(title,body){
  if('Notification' in window && Notification.permission === 'granted'){
    const n = new Notification(title, { body, renotify:true });
    try{ n.onclick = ()=> window.focus(); }catch(e){}
  } else {
    // fallback: no blocking alert to keep UX nicer — but we'll also show overlay
    // alert(title + '\n' + body);
  }
}

/* ====== Trigger alarm ====== */
function triggerAlarm(task){
  if(task.notified) return;
  task.notified = true;
  saveAndRender();
  ringBellVisual();
  playBeepSequence();
  showOverlay(task);
  showNotification('Hora da tarefa', `${task.title} ${task.date||''} ${task.time||''}`);
  try{
    if(window.speechSynthesis){
      const m = new SpeechSynthesisUtterance(`${task.title} agora`);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(m);
    }
  }catch(e){}
}

/* ====== Check alarms periodically ====== */
function checkAlarms(){
  if(!DATA || !Array.isArray(DATA.tasks)) return;
  const now = Date.now();
  DATA.tasks.forEach(t=>{
    if(!t.date || !t.time) return;
    const iso = `${t.date}T${t.time}:00`;
    const target = new Date(iso).getTime();
    if(isNaN(target)) return;
    const diff = now - target;
    if(Math.abs(diff) <= 60*1000 && !t.notified && !t.done){
      triggerAlarm(t);
    }
    if(diff > 5*60*1000 && !t.notified){
      t.notified = true;
      saveUserData(CURRENT, DATA);
    }
  });
}

/* ====== Snooze (adicionar minutos) ====== */
function addMinutesToTaskTime(task, minutes){
  // compute new time based on current time + minutes
  const newDate = new Date(Date.now() + minutes*60*1000);
  const yyyy = newDate.getFullYear();
  const mm = pad(newDate.getMonth()+1);
  const dd = pad(newDate.getDate());
  const hh = pad(newDate.getHours());
  const min = pad(newDate.getMinutes());
  task.date = `${yyyy}-${mm}-${dd}`;
  task.time = `${hh}:${min}`;
  task.notified = false; // allow to trigger again
  saveAndRender();
}

/* ====== OPTIONAL JSONBin (kept minimal) ====== */
async function syncToJsonBin(){ if(!JSONBIN_BIN_ID||!JSONBIN_MASTER_KEY) return alert('JSONBin não configurado'); try{ const url=`${JSONBIN_BASE}/${JSONBIN_BIN_ID}`; const res=await fetch(url,{ headers:{ 'X-Master-Key': JSONBIN_MASTER_KEY } }); if(!res.ok) throw new Error(res.status); const payload=await res.json(); const record=payload.record||{}; record['user_'+CURRENT]=DATA; const put=await fetch(url,{ method:'PUT', headers:{ 'X-Master-Key': JSONBIN_MASTER_KEY,'Content-Type':'application/json' }, body: JSON.stringify(record)}); if(!put.ok) throw new Error(put.status); setStatus('sincronizado'); }catch(e){ alert('Sync falhou: '+e.message); } }
async function pullFromJsonBin(){ if(!JSONBIN_BIN_ID||!JSONBIN_MASTER_KEY) return alert('JSONBin não configurado'); try{ const url=`${JSONBIN_BASE}/${JSONBIN_BIN_ID}`; const res=await fetch(url,{ headers:{ 'X-Master-Key': JSONBIN_MASTER_KEY } }); if(!res.ok) throw new Error(res.status); const payload=await res.json(); const record=payload.record||{}; const remote=record['user_'+CURRENT]; if(remote){ DATA = remote; saveUserData(CURRENT, DATA); renderSubjects(); renderTasks(); setStatus('baixado'); } else alert('Nada no bin'); }catch(e){ alert('Pull falhou: '+e.message); } }

/* ====== UI wiring ====== */
function initUI(){
  $('#btnRegister').onclick = async ()=>{
    const u = $('#username').value.trim(), p = $('#password').value;
    try{ await register(u,p); $('#authMsg').textContent='Registrado — faça login'; }catch(e){ $('#authMsg').textContent='Erro: '+e.message; }
  };
  $('#btnLogin').onclick = async ()=>{
    const u = $('#username').value.trim(), p = $('#password').value;
    try{ const id = await login(u,p); CURRENT = id; DATA = loadUserData(CURRENT); $('#who').textContent = u; $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden'); renderSubjects(); renderTasks(); setStatus('logado'); }catch(e){ $('#authMsg').textContent='Erro: '+e.message; }
  };
  $('#btnLogout').onclick = ()=>{ logout(); CURRENT=null; DATA=null; $('#auth').classList.remove('hidden'); $('#app').classList.add('hidden'); setStatus('desconectado'); };

  $('#addBtn').onclick = addTaskFromForm;
  $('#btnSync').onclick = async ()=>{ const ok = confirm('OK = enviar; Cancel = baixar'); if(ok) await syncToJsonBin(); else await pullFromJsonBin(); };

  // overlay controls
  $('#overlayClose').onclick = ()=> hideOverlay();
  $('#snooze5').onclick = ()=>{
    if(lastTriggeredTask){
      addMinutesToTaskTime(lastTriggeredTask, 5);
      hideOverlay();
      setStatus('adiado 5 min');
    }
  };

  // bell click: if lastTriggeredTask show overlay, else show a test overlay
  $('#bell').onclick = ()=>{
    if(lastTriggeredTask){
      ringBellVisual(); playBeepSequence(); showOverlay(lastTriggeredTask);
    } else {
      // fake test notification
      const test = { title:'Teste de notificação', description:'Este é um teste — clique Adiar para simular snooze.', date:'', time:'' };
      ringBellVisual(); playBeepSequence(); showOverlay(test);
    }
  };

  // restore session
  const cur = localStorage.getItem(LS_CURRENT);
  if(cur){ CURRENT = cur; DATA = loadUserData(CURRENT); const users = loadUsers(); const u = users.find(x=>x.id===CURRENT); $('#who').textContent = u ? u.username : 'Usuário'; $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden'); renderSubjects(); renderTasks(); setStatus('restaurado'); }
  else setStatus('pronto');

  // scheduled checks every 10s
  setInterval(checkAlarms, 10*1000);
  setTimeout(checkAlarms, 1000);
}

/* debug */
window._debug = { loadUsers, loadUserData, saveUserData, checkAlarms };

initUI();
