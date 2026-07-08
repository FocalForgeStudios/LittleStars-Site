/* =====================================================================
   auth.js — Parent Portal authentication

   Handles the Sign In / Create Account tabs and the password / magic
   link toggle, then dispatches 'lse:authChanged' whenever the signed-in
   state changes so app.js can render (or tear down) the portal
   dashboard without this file needing to know anything about rosters,
   bookings, etc.
   ===================================================================== */

const portalLoginEl = document.getElementById('portalLogin');
const portalSignedInEl = document.getElementById('portalSignedIn');
const portalAuthForm = document.getElementById('portalAuthForm');
const portalAuthError = document.getElementById('portalAuthError');
const portalAuthSuccess = document.getElementById('portalAuthSuccess');
const portalFullNameInput = document.getElementById('portalFullName');
const portalPhoneInput = document.getElementById('portalPhone');
const portalEmailInput = document.getElementById('portalEmail');
const portalPasswordInput = document.getElementById('portalPassword');
const portalAuthSubmit = document.getElementById('portalAuthSubmit');

let authMode = 'signin';     // 'signin' | 'signup'
let useMagicLink = false;

function clearAuthMessages() {
  portalAuthError.classList.remove('show'); portalAuthError.textContent = '';
  portalAuthSuccess.classList.remove('show'); portalAuthSuccess.textContent = '';
}

function updateAuthFormUI() {
  clearAuthMessages();
  portalFullNameInput.style.display = authMode === 'signup' ? 'block' : 'none';
  portalFullNameInput.required = authMode === 'signup';
  // Phone is optional even on signup — Andrew wanted it available but never mandatory.
  portalPhoneInput.style.display = authMode === 'signup' ? 'block' : 'none';
  portalPasswordInput.style.display = useMagicLink ? 'none' : 'block';
  portalPasswordInput.required = !useMagicLink;
  if (useMagicLink) {
    portalAuthSubmit.textContent = 'Send me a sign-in link';
  } else {
    portalAuthSubmit.textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
  }
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    authMode = tab.dataset.mode;
    updateAuthFormUI();
  });
});

document.getElementById('portalUsePassword').addEventListener('click', () => {
  useMagicLink = false;
  document.getElementById('portalUsePassword').classList.add('active');
  document.getElementById('portalUseMagicLink').classList.remove('active');
  updateAuthFormUI();
});
document.getElementById('portalUseMagicLink').addEventListener('click', () => {
  useMagicLink = true;
  document.getElementById('portalUseMagicLink').classList.add('active');
  document.getElementById('portalUsePassword').classList.remove('active');
  updateAuthFormUI();
});

portalAuthForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthMessages();
  const email = portalEmailInput.value.trim();
  const password = portalPasswordInput.value;
  const fullName = portalFullNameInput.value.trim();
  const phone = portalPhoneInput.value.trim();

  portalAuthSubmit.disabled = true;
  const originalText = portalAuthSubmit.textContent;
  portalAuthSubmit.textContent = 'Please wait…';

  try {
    if (useMagicLink) {
      const { error } = await LSData.signInWithMagicLink(email);
      if (error) throw error;
      portalAuthSuccess.textContent = 'Check your email for a sign-in link.';
      portalAuthSuccess.classList.add('show');
      return;
    }
    if (authMode === 'signup') {
      if (!fullName) { throw new Error('Please enter your full name.'); }
      const { error } = await LSData.signUpWithPassword(email, password, fullName, phone);
      if (error) throw error;
      portalAuthSuccess.textContent = 'Account created! If email confirmation is on, check your inbox — otherwise you\'re signed in now.';
      portalAuthSuccess.classList.add('show');
      await routeAuthState();
    } else {
      const { error } = await LSData.signInWithPassword(email, password);
      if (error) throw error;
      await routeAuthState();
    }
  } catch (err) {
    portalAuthError.textContent = err.message || 'Something went wrong. Please try again.';
    portalAuthError.classList.add('show');
  } finally {
    portalAuthSubmit.disabled = false;
    portalAuthSubmit.textContent = originalText;
  }
});

document.getElementById('portalSignOutBtn').addEventListener('click', async () => {
  await LSData.signOut();
  await routeAuthState();
});

// ---------- routing: show login box or dashboard based on real session ----------
async function routeAuthState() {
  const session = await LSData.getSession();
  if (session) {
    portalLoginEl.style.display = 'none';
    portalSignedInEl.style.display = 'block';
  } else {
    portalLoginEl.style.display = 'block';
    portalSignedInEl.style.display = 'none';
  }
  document.dispatchEvent(new CustomEvent('lse:authChanged', { detail: { signedIn: !!session } }));
}

updateAuthFormUI();
routeAuthState();

// Keep the portal in sync if the user signs in/out via a magic-link redirect in another tab.
supabase.auth.onAuthStateChange(() => { routeAuthState(); });