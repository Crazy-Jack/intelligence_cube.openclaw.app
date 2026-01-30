const DEFAULT_FUNCTION_REGION = 'us-central1';

const getFunctionUrl = () => {
  if (window.CLAWDBOT_FUNCTION_URL) return window.CLAWDBOT_FUNCTION_URL;
  const projectId = firebaseConfig.projectId || 'i3-testnet';
  return `https://${DEFAULT_FUNCTION_REGION}-${projectId}.cloudfunctions.net/triggerTerraformApply`;
};

const firebaseConfig = {
  apiKey: 'AIzaSyCYdWqXjUfNbUAMWlcm8neZQGTBTA63pfM',
  authDomain: 'i3-testnet.firebaseapp.com',
  projectId: 'i3-testnet',
  storageBucket: 'i3-testnet.firebasestorage.app',
  messagingSenderId: '892139814159',
  appId: '1:892139814159:web:4df8548eef1d9bd9a1927a',
  measurementId: 'G-KCDG3D1FCC'
};

let authInitPromise = null;

async function initFirebaseAuth() {
  if (window.firebaseAuth) return window.firebaseAuth;
  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
    const { initializeApp } = await import(
      'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js'
    );
    const { getAuth } = await import(
      'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js'
    );
    const app = window.firebaseApp || initializeApp(firebaseConfig);
    const auth = getAuth(app);
    window.firebaseApp = app;
    window.firebaseAuth = auth;
    return auth;
  })();

  return authInitPromise;
}

function sanitizeName(value) {
  const lowered = String(value || '').toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9-]/g, '-');
  const collapsed = replaced.replace(/-+/g, '-');
  return collapsed.replace(/^-+|-+$/g, '');
}

function setStatus(message, type = '') {
  const statusEl = document.getElementById('createStatus');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `clawdbot-status ${type}`.trim();
}

function setLoginState(isLoggedIn) {
  const loginPrompt = document.getElementById('loginPrompt');
  const createSection = document.getElementById('createSection');
  if (!loginPrompt || !createSection) return;
  loginPrompt.classList.toggle('hidden', isLoggedIn);
  createSection.classList.toggle('hidden', !isLoggedIn);
}

async function bindAuthState() {
  const auth = await initFirebaseAuth();
  const { onAuthStateChanged } = await import(
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js'
  );

  onAuthStateChanged(auth, (user) => {
    setLoginState(Boolean(user));
  });
}

async function handleCreateDeployment() {
  const auth = await initFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    setStatus('Please sign in with Google first.', 'error');
    setLoginState(false);
    return;
  }

  const input = document.getElementById('deploymentName');
  const rawName = input ? input.value.trim() : '';
  const sanitized = sanitizeName(rawName);
  if (!sanitized) {
    setStatus('Enter a name (letters, numbers, hyphens).', 'error');
    return;
  }

  const button = document.getElementById('createDeploymentBtn');
  if (button) button.disabled = true;
  setStatus('Triggering build...', '');

  try {
    const token = await user.getIdToken(true);
    const response = await fetch(getFunctionUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: sanitized })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error || 'Trigger failed. Please try again.';
      setStatus(message, 'error');
      return;
    }

    const buildUrl = payload?.build?.logUrl;
    if (buildUrl) {
      setStatus(`Build started: ${buildUrl}`, 'success');
    } else {
      setStatus('Build started successfully.', 'success');
    }
  } catch (error) {
    setStatus('Failed to trigger build. Please retry.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindAuthState().catch((error) => console.warn('Auth init failed:', error));
  const button = document.getElementById('createDeploymentBtn');
  if (button) button.addEventListener('click', handleCreateDeployment);
});
