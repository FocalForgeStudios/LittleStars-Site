/* ===================================================================
   app.js — Little Stars Enrichment (client-facing site)
   =================================================================== */

// ---------- header scroll state ----------
const header = document.getElementById('siteHeader');
window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 40), {passive:true});

// ---------- mobile menu ----------
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
burger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('open')));

// ---------- scroll reveal ----------
const revealEls = document.querySelectorAll('.reveal, .stop-card');
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, {threshold:0.15});
revealEls.forEach(el => io.observe(el));

// ---------- FAQ accordion ----------
document.querySelectorAll('.faq-item').forEach(item => {
  const q = item.querySelector('.faq-q');
  const a = item.querySelector('.faq-a');
  const setH = () => { a.style.maxHeight = item.classList.contains('open') ? a.scrollHeight + 'px' : '0px'; };
  setH();
  q.addEventListener('click', () => { item.classList.toggle('open'); setH(); });
});
window.addEventListener('resize', () => {
  document.querySelectorAll('.faq-item.open .faq-a').forEach(a => a.style.maxHeight = a.scrollHeight + 'px');
});

// ---------- traveling van along the route path (unchanged loved animation) ----------
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const path = document.getElementById('routePath');
const van = document.getElementById('vanIcon');
const stopsEls = document.querySelectorAll('.route-stop');

function fallbackVanPosition() {
  if (van) { van.style.left = '10%'; van.style.top = '6%'; }
}

if (path && van && !reduceMotion) {
  try {
    const pathLen = path.getTotalLength();
    const stopProgress = [0.05, 0.42, 0.72, 0.95];
    let t = 0;
    const speed = 0.00022;

    function animateVan(ts){
      try {
        if(!animateVan.last) animateVan.last = ts;
        const dt = ts - animateVan.last;
        animateVan.last = ts;
        t += speed * dt;
        if (t > 1) t = 0;
        const pt = path.getPointAtLength(t * pathLen);
        const svg = path.closest('svg');
        if (!svg) { fallbackVanPosition(); return; } // path detached/removed — stop animating, don't throw
        const box = svg.getBoundingClientRect();
        const xPct = pt.x / 400;
        const yPct = pt.y / 480;
        van.style.left = (xPct * box.width) + 'px';
        van.style.top = (yPct * box.height) + 'px';

        stopProgress.forEach((p, i) => {
          const el = stopsEls[i];
          if (!el) return;
          if (Math.abs(t - p) < 0.035) el.classList.add('lit');
          else if (t < p - 0.05 || t > p + 0.1) el.classList.remove('lit');
        });

        requestAnimationFrame(animateVan);
      } catch (e) {
        // animation frame failed (e.g. path geometry unavailable mid-animation) — fail quietly
        // to a static position instead of throwing and breaking unrelated scripts below this one
        fallbackVanPosition();
      }
    }
    requestAnimationFrame(animateVan);
  } catch (e) {
    // path wasn't ready/laid out (e.g. getTotalLength threw) — show the van statically instead
    fallbackVanPosition();
  }
} else if (van) {
  fallbackVanPosition();
}

// ---------- ambient sparkles in hero ----------
const heroEl = document.querySelector('.hero');
if (heroEl && !reduceMotion) {
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    const size = 2 + Math.random() * 3;
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.left = Math.random() * 100 + '%';
    s.style.bottom = (Math.random() * 30) + '%';
    s.style.animation = `floatSpark ${6 + Math.random() * 6}s linear ${Math.random() * 8}s infinite`;
    heroEl.appendChild(s);
  }
}

/* ===================================================================
   CURRENCY DISPLAY (UGX + USD shown together at all times)
   =================================================================== */
// fill in USD equivalents on static pricing tables on load
document.querySelectorAll('[data-ugx]').forEach(el => {
  const ugx = parseInt(el.dataset.ugx, 10);
  const usdSpan = el.querySelector('.usd-line');
  if (usdSpan) usdSpan.textContent = `≈ ${fmtUSD(ugxToUsd(ugx))} USD`;
});

/* ===================================================================
   PACKAGE BUILDER — tiers, add-ons, per-child roster sub-forms
   =================================================================== */
const fmt = n => n.toLocaleString('en-US');
let tier = {name:'None', price:0};
const addonState = {bible:0, bookclub:0, homework:0};
const addonNames = {bible:'Bible Study', bookclub:'Book Club', homework:'Homework Support'};
// per-addon child roster: { bible: [{name,age,notes}], ... }
const addonChildren = {bible:[], bookclub:[], homework:[]};

const tierOpts = document.querySelectorAll('.tier-opt');
tierOpts.forEach(opt => {
  opt.addEventListener('click', () => {
    tierOpts.forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    const labelMap = {none:'None', daily:'Daily plan', weekly:'Weekly plan', monthly:'Monthly plan'};
    tier = {name: labelMap[opt.dataset.tier], price: parseInt(opt.dataset.price,10)};
    recalc();
  });
});

function renderChildRoster(key) {
  const roster = document.querySelector(`.child-roster[data-roster="${key}"]`);
  if (!roster) return;
  const kids = addonChildren[key];
  roster.classList.toggle('open', kids.length > 0);
  roster.innerHTML = kids.map((kid, i) => `
    <div class="child-card">
      <input type="text" placeholder="Child's full name" value="${kid.name || ''}" data-field="name" data-idx="${i}">
      <input type="number" min="1" max="18" placeholder="Age" value="${kid.age || ''}" data-field="age" data-idx="${i}">
      <input type="text" placeholder="Allergies / special needs (optional)" value="${kid.notes || ''}" data-field="notes" data-idx="${i}">
      <button type="button" class="rm-child" title="Remove this child" data-idx="${i}">✕</button>
    </div>`).join('');

  roster.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.idx, 10);
      addonChildren[key][i][inp.dataset.field] = inp.value;
      recalc();
    });
  });
  roster.querySelectorAll('.rm-child').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      addonChildren[key].splice(i, 1);
      const step = document.querySelector(`.stepper[data-addon="${key}"]`);
      addonState[key] = addonChildren[key].length;
      step.querySelector('.count').textContent = addonState[key];
      renderChildRoster(key);
      recalc();
    });
  });
}

document.querySelectorAll('.stepper').forEach(step => {
  const key = step.dataset.addon;
  const countEl = step.querySelector('.count');
  step.querySelector('.inc').addEventListener('click', () => {
    addonState[key] = Math.min(addonState[key]+1, 12);
    countEl.textContent = addonState[key];
    // "+" registers another child for this session — slide open a sub-form for their details
    addonChildren[key].push({name:'', age:'', notes:''});
    renderChildRoster(key);
    recalc();
  });
  step.querySelector('.dec').addEventListener('click', () => {
    if (addonState[key] === 0) return;
    addonState[key] = Math.max(addonState[key]-1, 0);
    countEl.textContent = addonState[key];
    addonChildren[key].pop();
    renderChildRoster(key);
    recalc();
  });
});

const amountWrap = document.getElementById('amountWrap');
function recalc(){
  const addonTotal = Object.keys(addonState).reduce((sum,k) => {
    const priceEl = document.querySelector(`.stepper[data-addon="${k}"]`);
    return sum + addonState[k] * parseInt(priceEl.dataset.price,10);
  }, 0);
  const total = tier.price + addonTotal;

  document.getElementById('totalAmt').textContent = fmt(total);
  document.getElementById('lineTier').textContent = tier.name;
  document.getElementById('lineTierAmt').textContent = fmt(tier.price);
  document.getElementById('lineAddonsAmt').textContent = fmt(addonTotal);

  const usdTotalEl = document.getElementById('totalAmtUSD');
  if (usdTotalEl) usdTotalEl.textContent = `≈ ${fmtUSD(ugxToUsd(total))} USD`;

  amountWrap.classList.remove('bump');
  requestAnimationFrame(() => amountWrap.classList.add('bump'));
  setTimeout(() => amountWrap.classList.remove('bump'), 260);

  const addonSummary = Object.entries(addonState).filter(([k,v]) => v > 0).map(([k,v]) => `${v}x ${addonNames[k]}`).join(', ');
  const msgLines = [
    `Hi Little Stars Enrichment, I'd like to build this package:`,
  ];
  if (tier.price > 0) msgLines.push(`- Core plan: ${tier.name} (${fmt(tier.price)} UGX)`);
  if (addonSummary) msgLines.push(`- Add-ons: ${addonSummary}`);
  // include named children where provided, so the provider isn't stuck with "Unknown Children"
  Object.entries(addonChildren).forEach(([k, kids]) => {
    kids.filter(c => c.name).forEach(c => {
      msgLines.push(`  • ${addonNames[k]}: ${c.name}${c.age ? ', age ' + c.age : ''}${c.notes ? ' (' + c.notes + ')' : ''}`);
    });
  });
  msgLines.push(`Estimated total: ${fmt(total)} UGX (≈ ${fmtUSD(ugxToUsd(total))} USD)`);
  msgLines.push(`Could you confirm availability for my child?`);
  document.getElementById('sendWaBtn').href = `https://wa.me/256704383497?text=${encodeURIComponent(msgLines.join('\n'))}`;
}
recalc();

/* ===================================================================
   BOOKING & SCHEDULING — international online sessions w/ timezone

   Children selectable here are the parent's REAL roster (the same
   children records shown in the Parent Portal below), not the names
   typed into the package builder above. The builder is just a quote
   tool; the portal is the single source of truth for actual children
   used in bookings — this was the central bug in the old version.
   =================================================================== */
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
  const childSelect = document.getElementById('bookChild');
  const tzOut = document.getElementById('tzOutput');
  const dateInput = document.getElementById('bookDate');
  const timeInput = document.getElementById('bookTime');
  const localTzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById('detectedTz').textContent = localTzName;

  let myChildrenCache = [];

  async function populateChildSelect() {
    const session = await LSData.getSession();
    const submitBtn = bookingForm.querySelector('button[type="submit"]');
    if (!session) {
      childSelect.innerHTML = `<option value="">Sign in to the Parent Portal first</option>`;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '🔒 Sign in below to book a session'; }
      return;
    }
    myChildrenCache = await LSData.getChildren();
    if (!myChildrenCache.length) {
      childSelect.innerHTML = `<option value="">No children registered yet</option>`;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '➕ Add a child in the Parent Portal first'; }
    } else {
      childSelect.innerHTML = myChildrenCache.map(k => `<option value="${k.id}">${k.name}</option>`).join('');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '📅 Confirm Booking'; }
    }
  }
  populateChildSelect();
  // refresh whenever sign-in state changes or a child is added/removed in the portal
  document.addEventListener('lse:authChanged', populateChildSelect);
  document.addEventListener('lse:childrenChanged', populateChildSelect);

  function updateTzPreview() {
    if (!dateInput.value || !timeInput.value) { tzOut.innerHTML = ''; return; }
    // session time entered is assumed East Africa Time (EAT, UTC+3) — the provider's local zone
    const eatISO = `${dateInput.value}T${timeInput.value}:00+03:00`;
    const d = new Date(eatISO);
    if (isNaN(d.getTime())) { tzOut.innerHTML = ''; return; }
    const eatStr = d.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour:'2-digit', minute:'2-digit', weekday:'short', month:'short', day:'numeric' });
    const localStr = d.toLocaleString('en-US', { timeZone: localTzName, hour:'2-digit', minute:'2-digit', weekday:'short', month:'short', day:'numeric' });
    tzOut.innerHTML = `
      <div class="tz-row"><span class="lbl">Provider time (EAT)</span><span class="val">${eatStr}</span></div>
      <div class="tz-row"><span class="lbl">Your time (${localTzName})</span><span class="val">${localStr}</span></div>`;
  }
  dateInput.addEventListener('change', updateTzPreview);
  timeInput.addEventListener('change', updateTzPreview);

  async function renderBookingList() {
    const list = document.getElementById('bookingList');
    const session = await LSData.getSession();
    if (!session) { list.innerHTML = `<div class="empty-state">Sign in to the Parent Portal to see your bookings.</div>`; return; }
    const bookings = (await LSData.getBookings()).sort((a,b) => (new Date(a.dateTime).getTime() || Infinity) - (new Date(b.dateTime).getTime() || Infinity));
    if (!bookings.length) { list.innerHTML = `<div class="empty-state">No sessions booked yet.</div>`; return; }
    list.innerHTML = bookings.map(b => {
      const d = new Date(b.dateTime);
      const local = d.toLocaleString('en-US', { timeZone: localTzName, hour:'2-digit', minute:'2-digit', weekday:'short', month:'short', day:'numeric' });
      return `
      <div class="booking-item">
        <div class="top">
          <div><div class="child">${b.childName}</div><div class="pkg">${b.package}</div></div>
          <span class="status-pill ${b.status}">${b.status}</span>
        </div>
        <div class="when">🕓 ${local} (your time) · 💻 ${b.mode}</div>
      </div>`;
    }).join('');
  }
  renderBookingList();
  document.addEventListener('lse:authChanged', renderBookingList);
  document.addEventListener('lse:childrenChanged', renderBookingList);

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kid = myChildrenCache.find(k => k.id === childSelect.value);
    if (!kid) { alert('Please add a child first in your Parent Portal (scroll down to "Your Account").'); return; }
    if (!dateInput.value || !timeInput.value) { alert('Please choose a date and time.'); return; }
    const pkg = document.getElementById('bookPackage').value;
    const eatISO = `${dateInput.value}T${timeInput.value}:00+03:00`;
    const submitBtn = bookingForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const { error } = await LSData.addBooking({
      childId: kid.id, childName: kid.name, package: pkg,
      dateTime: new Date(eatISO).toISOString(), durationMins: 60, mode: 'online'
    });
    submitBtn.disabled = false;
    if (error) { alert('Could not book that session: ' + error.message); return; }
    await renderBookingList();
    bookingForm.reset();
    tzOut.innerHTML = '';
    alert(`Session booked for ${kid.name}! You'll see it in your Parent Portal and we'll remind the team to prepare.`);
  });
}

/* ===================================================================
   PARENT PORTAL — roster, classroom link, payment history

   Driven entirely by real Supabase auth state. auth.js owns showing/
   hiding the login box vs. the dashboard shell; this code only fills
   in the dashboard's contents once 'lse:authChanged' confirms a real
   session exists.
   =================================================================== */
async function renderPortal() {
  const session = await LSData.getSession();
  if (!session) return;
  const profile = await LSData.getProfile();
  const firstName = (profile?.full_name || session.user.email || 'there').split(' ')[0];
  document.getElementById('portalGreeting').textContent = `Welcome back, ${firstName}`;

  const kids = await LSData.getChildren();
  const rosterEl = document.getElementById('portalRoster');
  rosterEl.innerHTML = kids.length ? kids.map(k => `
    <div class="ritem"><b>${k.name}</b><span>Age ${k.age || '—'} · ${k.notes || 'No notes on file'}</span><button type="button" class="rm-child-portal" data-id="${k.id}" title="Remove" aria-label="Remove ${k.name}" style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:14px;">✕</button></div>
  `).join('') : `<div class="ritem">No children registered yet — add one below.</div>`;
  rosterEl.querySelectorAll('.rm-child-portal').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await LSData.removeChild(btn.dataset.id);
      if (error) { alert('Could not remove child: ' + error.message); return; }
      await renderPortal();
      document.dispatchEvent(new CustomEvent('lse:childrenChanged'));
    });
  });

  const bookings = (await LSData.getBookings()).filter(b => b.status === 'upcoming')
    .sort((a,b) => (new Date(a.dateTime).getTime() || Infinity) - (new Date(b.dateTime).getTime() || Infinity));
  const next = bookings[0];
  const classroomBtn = document.getElementById('classroomBtn');
  if (next) {
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const local = new Date(next.dateTime).toLocaleString('en-US', { timeZone: tzName, hour:'2-digit', minute:'2-digit', weekday:'short', month:'short', day:'numeric' });
    classroomBtn.disabled = false;
    classroomBtn.textContent = `🎥 Join ${next.package} — ${local}`;
    classroomBtn.onclick = () => window.open('https://meet.google.com/lse-bible-study', '_blank');
  } else {
    classroomBtn.disabled = true;
    classroomBtn.textContent = 'No upcoming session';
  }

  const ledgerEl = document.getElementById('portalLedger');
  const payments = await LSData.getPayments();
  ledgerEl.innerHTML = payments.length ? payments.map(p => `
    <div class="ledger-row"><span>${p.date} · ${p.desc}</span><span class="amt">${fmtUGX(p.amountUGX)} UGX <small style="opacity:.6;">(≈ ${fmtUSD(ugxToUsd(p.amountUGX))})</small></span></div>
  `).join('') : `<div class="ledger-row"><span>No payments recorded yet.</span></div>`;
}

document.addEventListener('lse:authChanged', (e) => {
  if (e.detail.signedIn) renderPortal();
});

const addChildForm = document.getElementById('addChildForm');
if (addChildForm) {
  addChildForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newChildName');
    const age = document.getElementById('newChildAge');
    const notes = document.getElementById('newChildNotes');
    if (!name.value.trim()) return;
    const submitBtn = addChildForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const { error } = await LSData.addChild({
      name: name.value.trim(),
      age: age.value ? parseInt(age.value, 10) : null,
      notes: notes.value.trim()
    });
    submitBtn.disabled = false;
    if (error) { alert('Could not add child: ' + error.message); return; }
    name.value = ''; age.value = ''; notes.value = '';
    await renderPortal();
    document.dispatchEvent(new CustomEvent('lse:childrenChanged'));
  });
}

/* ===================================================================
   LIVE CHAT WIDGET — talk to a service provider without leaving the site

   Each signed-in parent has exactly one thread (enforced by a unique
   constraint on chat_threads.parent_id in the database), found or
   created on demand. A visitor who isn't signed in is invited to open
   the Parent Portal first, since chat is tied to a real account now —
   no more "type any name to start a thread."
   =================================================================== */
(function setupChat(){
  const toggle = document.getElementById('chatToggle');
  const win = document.getElementById('chatWindow');
  if (!toggle || !win) return;
  const closeBtn = document.getElementById('chatClose');
  const body = document.getElementById('chatBody');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const nameField = document.getElementById('chatName');

  let currentThread = null;
  let unsubscribe = null;

  function escapeHTML(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  function renderMessages() {
    if (!currentThread) {
      body.innerHTML = `<div class="bubble them">Hi! Please sign in to the Parent Portal below first — that way our team always knows who they're chatting with. 🙂</div>`;
      return;
    }
    body.innerHTML = currentThread.messages.map(m => `
      <div class="bubble ${m.sender === 'parent' ? 'me' : 'them'}">
        ${escapeHTML(m.text)}
        <span class="t">${new Date(m.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      </div>`).join('');
    body.scrollTop = body.scrollHeight;
  }

  async function loadThreadIfSignedIn() {
    const session = await LSData.getSession();
    if (!session) { currentThread = null; if (unsubscribe) { unsubscribe(); unsubscribe = null; } renderMessages(); return; }
    const profile = await LSData.getProfile();
    nameField.value = profile?.full_name || session.user.email || '';
    nameField.disabled = true; // identity now comes from the account, not free text
    currentThread = await LSData.getOrCreateThread();
    if (currentThread && !unsubscribe) {
      unsubscribe = LSData.subscribeToThread(currentThread.id, (msg) => {
        currentThread.messages.push({ sender: msg.sender, text: msg.text, time: new Date(msg.created_at).getTime() });
        renderMessages();
      });
    }
    renderMessages();
  }

  document.addEventListener('lse:authChanged', loadThreadIfSignedIn);
  loadThreadIfSignedIn();

  toggle.addEventListener('click', () => {
    win.classList.toggle('open');
    if (win.classList.contains('open')) renderMessages();
  });
  closeBtn.addEventListener('click', () => win.classList.remove('open'));

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    if (!currentThread) { alert('Please sign in to the Parent Portal first so we know who\'s messaging.'); return; }
    input.value = '';
    const { error } = await LSData.pushMessage(currentThread.id, 'parent', text);
    if (error) { alert('Message failed to send: ' + error.message); return; }
    currentThread.messages.push({ sender: 'parent', text, time: Date.now() });
    renderMessages();
  }
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
})();
