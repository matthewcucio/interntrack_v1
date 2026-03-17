// =====================================================
// NAVBAR — scroll effect + mobile menu
// =====================================================
const nav = document.getElementById('land-nav');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

function toggleMobileMenu() {
  document.getElementById('mobile-menu').classList.toggle('open');
}

function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
}

// =====================================================
// SCROLL REVEAL
// =====================================================
const observer = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.12 }
);

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// =====================================================
// ANIMATED COUNTERS
// =====================================================
function animateCounter(el, target, suffix = '', decimals = 0) {
  const duration = 1800;
  const step = 16;
  const steps = duration / step;
  let current = 0;

  const timer = setInterval(() => {
    current += target / steps;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = current.toFixed(decimals) + suffix;
  }, step);
}

const counterObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const val = parseFloat(el.dataset.count);
    const suf = el.dataset.suffix || '';
    const dec = parseInt(el.dataset.decimals) || 0;
    animateCounter(el, val, suf, dec);
    counterObserver.unobserve(el);
  });
}, { threshold: 0.5 });

document.querySelectorAll('[data-count]').forEach(el => counterObserver.observe(el));

// =====================================================
// SMOOTH SCROLL
// =====================================================
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      closeMobileMenu();
    }
  });
});

// =====================================================
// AUTH — Firebase or demo mode
// =====================================================
let authMode = 'signin'; // 'signin' | 'signup'

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  document.getElementById('auth-title').textContent     = isSignup ? 'Create your account' : 'Welcome back';
  document.getElementById('auth-sub').textContent       = isSignup ? 'Start tracking your internship hours' : 'Sign in to continue tracking';
  document.getElementById('auth-submit-btn').textContent = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('auth-toggle-text').textContent = isSignup ? 'Already have an account? ' : "Don't have an account? ";
  document.getElementById('auth-toggle-action').textContent = isSignup ? 'Sign in' : 'Sign up';
  document.getElementById('name-field').style.display  = isSignup ? 'block' : 'none';
  clearAuthError();
}

function toggleAuthMode() {
  setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('show');
}

function clearAuthError() {
  document.getElementById('auth-error').classList.remove('show');
}

function setLoading(loading) {
  const submitBtn = document.getElementById('auth-submit-btn');
  const googleBtn = document.getElementById('btn-google');
  submitBtn.disabled = loading;
  googleBtn.disabled = loading;
  submitBtn.textContent = loading
    ? 'Please wait...'
    : (authMode === 'signup' ? 'Create Account' : 'Sign In');
}

// Google Sign In
async function signInWithGoogle() {
  if (!FIREBASE_CONFIGURED) {
    // Demo mode: go straight to app
    window.location.href = 'app.html';
    return;
  }
  clearAuthError();
  setLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
    window.location.href = 'app.html';
  } catch (err) {
    setLoading(false);
    showAuthError(friendlyError(err.code));
  }
}

// Email + Password Submit
async function handleAuthSubmit(e) {
  e.preventDefault();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email || !password) {
    showAuthError('Please fill in all fields.');
    return;
  }

  if (!FIREBASE_CONFIGURED) {
    // Demo mode: go straight to app without auth
    window.location.href = 'app.html';
    return;
  }

  clearAuthError();
  setLoading(true);

  try {
    if (authMode === 'signup') {
      await firebase.auth().createUserWithEmailAndPassword(email, password);
      const name = document.getElementById('auth-name').value.trim();
      if (name) {
        await firebase.auth().currentUser.updateProfile({ displayName: name });
      }
    } else {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    }
    window.location.href = 'app.html';
  } catch (err) {
    setLoading(false);
    showAuthError(friendlyError(err.code));
  }
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found':        'No account found with that email.',
    'auth/wrong-password':        'Incorrect password. Please try again.',
    'auth/email-already-in-use':  'An account with this email already exists.',
    'auth/weak-password':         'Password must be at least 6 characters.',
    'auth/invalid-email':         'Please enter a valid email address.',
    'auth/popup-closed-by-user':  'Sign-in popup was closed.',
    'auth/network-request-failed':'Network error. Check your connection.',
    'auth/too-many-requests':     'Too many attempts. Please try again later.',
    'auth/invalid-credential':    'Incorrect email or password.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// =====================================================
// INIT
// =====================================================
window.addEventListener('DOMContentLoaded', () => {
  // Show setup warning if Firebase is not configured
  if (!FIREBASE_CONFIGURED) {
    document.getElementById('setup-warning').classList.add('show');
  }

  // If already logged in, go straight to app
  if (FIREBASE_CONFIGURED) {
    firebase.auth().onAuthStateChanged(user => {
      if (user) window.location.href = 'app.html';
    });
  }

  // Auth form
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
});
