/* =====================================================================
   data.js — Supabase data layer (PUBLIC / PARENT SITE)

   Every function here is async and talks to Supabase. RLS policies on
   the server guarantee a parent only ever sees their own children,
   bookings, payments and chat thread — there is no client-side
   filtering to "trust"; the database itself enforces it.
   ===================================================================== */
const LSData = (() => {

  // ---------- auth ----------
  async function getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  async function getProfile() {
    const session = await getSession();
    if (!session) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (error) { console.error('getProfile failed:', error); return null; }
    return data;
  }

  async function signUpWithPassword(email, password, fullName, phone) {
    return supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, phone: phone || null } }
    });
  }

  async function signInWithPassword(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function signInWithMagicLink(email) {
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });
  }

  async function signOut() {
    return supabase.auth.signOut();
  }

  async function updateFullName(fullName) {
    const session = await getSession();
    if (!session) return { error: new Error('Not signed in') };
    return supabase.from('profiles').update({ full_name: fullName }).eq('id', session.user.id);
  }

  // ---------- children ----------
  async function getChildren() {
    const { data, error } = await supabase.from('children').select('*').order('created_at');
    if (error) { console.error('getChildren failed:', error); return []; }
    return data;
  }

  async function addChild(child) {
    const session = await getSession();
    if (!session) return { error: new Error('Not signed in') };
    const { data, error } = await supabase.from('children').insert({
      parent_id: session.user.id,
      name: child.name,
      age: child.age || null,
      notes: child.notes || null,
      parent_contact: child.parentContact || null
    }).select().single();
    return { data, error };
  }

  async function removeChild(id) {
    return supabase.from('children').delete().eq('id', id);
  }

  // ---------- bookings ----------
  async function getBookings() {
    const { data, error } = await supabase.from('bookings').select('*').order('date_time');
    if (error) { console.error('getBookings failed:', error); return []; }
    // map snake_case columns back to the camelCase shape the UI code expects
    return data.map(rowToBooking);
  }

  function rowToBooking(b) {
    return {
      id: b.id, childId: b.child_id, childName: b.child_name, package: b.package,
      dateTime: b.date_time, durationMins: b.duration_mins, mode: b.mode, status: b.status
    };
  }

  async function addBooking(b) {
    const session = await getSession();
    if (!session) return { error: new Error('Not signed in') };
    const { data, error } = await supabase.from('bookings').insert({
      parent_id: session.user.id,
      child_id: b.childId,
      child_name: b.childName,
      package: b.package,
      date_time: b.dateTime,
      duration_mins: b.durationMins || 60,
      mode: b.mode || 'online',
      status: 'upcoming'
    }).select().single();
    // server-side trigger auto-creates the matching reminder for the provider dashboard
    return { data: data ? rowToBooking(data) : null, error };
  }

  // ---------- payments ----------
  async function getPayments() {
    const { data, error } = await supabase.from('payments').select('*').order('date', { ascending: false });
    if (error) { console.error('getPayments failed:', error); return []; }
    return data.map(p => ({ id: p.id, date: p.date, desc: p.description, amountUGX: Number(p.amount_ugx) }));
  }

  // ---------- chat ----------
  async function getOrCreateThread() {
    const session = await getSession();
    if (!session) return null;
    let { data: thread } = await supabase
      .from('chat_threads').select('*').eq('parent_id', session.user.id).maybeSingle();
    if (!thread) {
      const profile = await getProfile();
      const { data: created, error } = await supabase
        .from('chat_threads')
        .insert({ parent_id: session.user.id, parent_name: profile?.full_name || 'Parent' })
        .select().single();
      if (error) { console.error('getOrCreateThread failed:', error); return null; }
      thread = created;
    }
    const { data: messages } = await supabase
      .from('chat_messages').select('*').eq('thread_id', thread.id).order('created_at');
    return { id: thread.id, parentName: thread.parent_name, messages: (messages || []).map(m => ({ sender: m.sender, text: m.text, time: new Date(m.created_at).getTime() })) };
  }

  async function pushMessage(threadId, sender, text) {
    return supabase.from('chat_messages').insert({ thread_id: threadId, sender, text });
  }

  // ---------- package requests (Build a Package → "Send Quote") ----------
  // Works whether or not the visitor is signed in: signed-in parents attach
  // their real parent_id + child_id; a signed-out visitor's request is still
  // saved (parent_id left null) so the provider sees it in the dashboard,
  // it just isn't tied to an account.
  async function addPackageRequest(req) {
    const session = await getSession();
    const profile = session ? await getProfile() : null;
    const { data, error } = await supabase.from('package_requests').insert({
      parent_id: session ? session.user.id : null,
      parent_name: profile?.full_name || req.parentName || 'Website visitor',
      child_id: req.childId || null,
      child_name: req.childName,
      plan_name: req.planName,
      addons: req.addons || [],
      total_ugx: req.totalUGX,
      status: 'new'
    }).select().single();
    return { data, error };
  }

  async function getMyPackageRequests() {
    const { data, error } = await supabase.from('package_requests').select('*').order('created_at', { ascending: false });
    if (error) { console.error('getMyPackageRequests failed:', error); return []; }
    return data.map(rowToPackageRequest);
  }

  function rowToPackageRequest(r) {
    return {
      id: r.id, childId: r.child_id, childName: r.child_name, planName: r.plan_name,
      addons: r.addons, totalUGX: Number(r.total_ugx), status: r.status, createdAt: r.created_at
    };
  }

  // ---------- realtime ----------
  function subscribeToThread(threadId, onInsert) {
    const channel = supabase.channel(`chat:${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
        payload => onInsert(payload.new))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }

  return {
    getSession, getProfile, signUpWithPassword, signInWithPassword, signInWithMagicLink, signOut, updateFullName,
    getChildren, addChild, removeChild,
    getBookings, addBooking,
    getPayments,
    getOrCreateThread, pushMessage, subscribeToThread,
    addPackageRequest, getMyPackageRequests
  };
})();

/* ---------- FX rate (mock, would come from an API in production) ---------- */
const FX_UGX_PER_USD = 3800;
function ugxToUsd(ugx) { return Math.round((ugx / FX_UGX_PER_USD) * 100) / 100; }
function fmtUSD(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function fmtUGX(n) { return n.toLocaleString('en-US'); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function futureISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(16, 0, 0, 0);
  return d.toISOString();
}