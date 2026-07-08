/* =====================================================================
   auth.js — Parent Portal authentication (PUBLIC SITE)

   Three fixes applied in this version:
   1. Sign-out now clears all form fields so old credentials never linger.
   2. After a successful sign-in, we check the profile role — if the
      account is a provider, they're signed out immediately with a clear
      message: this portal is for parents only, they should use the
      admin dashboard instead.
   3. Password / magic-link toggle and Sign In / Create Account tabs
      all still work exactly as before.
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

let authMode = 'signin';
let useMagicLink = false;

function clearAuthMessages() {
  portalAuthError.classList.remove('show'); portalAuthError.textContent = '';
  portalAuthSuccess.classList.remove('show'); portalAuthSuccess.textContent = '';
}

// Clears every input in the auth form so credentials never linger after
// sign-out. Called any time the portal transitions back to the logged-out
// state, regardless of how sign-out happened.
function clearAuthFields() {
  portalEmailInput.value = '';
  portalPasswordInput.value = '';
  portalFullNameInput.value = '';
  if (portalPhoneInput) portalPhoneInput.value = '';
  clearAuthMessages();
}

function updateAuthFormUI() {
  clearAuthMessages();
  portalFullNameInput.style.display = authMode === 'signup' ? 'block' : 'none';
  portalFullNameInput.required = authMode === 'signup';
  if (portalPhoneInput) portalPhoneInput.style.display = authMode === 'signup' ? 'block' : 'none';
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
  const phone = portalPhoneInput ? portalPhoneInput.value.trim() : '';

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
      if (!fullName) throw new Error('Please enter your full name.');
      const { error } = await LSData.signUpWithPassword(email, password, fullName, phone);
      if (error) throw error;
      portalAuthSuccess.textContent = 'Account created! If email confirmation is on, check your inbox.';
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
  clearAuthFields();
  await routeAuthState();
});

// ---------- routing: show login box or signed-in dashboard ----------
async function routeAuthState() {
  const session = await LSData.getSession();

  if (session) {
    // Block providers from using the parent portal — they have their own
    // admin dashboard for everything, and mixing the two would let a
    // provider see parent-only UI and create confusing data.
    const profile = await LSData.getProfile();
    if (profile && profile.role === 'provider') {
      await LSData.signOut();
      clearAuthFields();
      portalLoginEl.style.display = 'block';
      portalSignedInEl.style.display = 'none';
      portalAuthError.textContent =
        'This account is a provider account. Please use the Little Stars provider dashboard to sign in. ' +
        'The parent portal is for families only.';
      portalAuthError.classList.add('show');
      document.dispatchEvent(new CustomEvent('lse:authChanged', { detail: { signedIn: false } }));
      return;
    }

    portalLoginEl.style.display = 'none';
    portalSignedInEl.style.display = 'block';
  } else {
    // Signed out — make sure the form is clean for the next person.
    clearAuthFields();
    portalLoginEl.style.display = 'block';
    portalSignedInEl.style.display = 'none';
  }

  document.dispatchEvent(new CustomEvent('lse:authChanged', { detail: { signedIn: !!session } }));
}

updateAuthFormUI();
routeAuthState();

// Keep the portal in sync when a magic-link redirect fires in another tab.
supabase.auth.onAuthStateChange(() => { routeAuthState(); });