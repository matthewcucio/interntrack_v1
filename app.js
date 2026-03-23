// =====================================================
// AUTH GUARD
// =====================================================
// currentUser is set by the auth listener below before the app inits.
// STORE_KEY is scoped per user so each account has its own data.
let currentUser          = null;
let STORE_KEY            = 'interntrack_data'; // overwritten once user is known
let firestoreUnsubscribe = null;               // real-time listener handle

function signOutUser() {
  if (firestoreUnsubscribe) { firestoreUnsubscribe(); firestoreUnsubscribe = null; }
  if (STORE_KEY === 'interntrack_data_guest') {
    window.location.href = 'index.html';
    return;
  }
  if (FIREBASE_CONFIGURED) {
    firebase.auth().signOut().then(() => { window.location.href = 'index.html'; });
  } else {
    window.location.href = 'index.html';
  }
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function updateNavbarUser() {
  const userInfoEl   = document.getElementById('user-info');
  const avatarEl     = document.getElementById('user-avatar');
  const initialsEl   = document.getElementById('user-initials');
  const emailEl      = document.getElementById('user-email');

  if (!userInfoEl) return;

  const isGuest = STORE_KEY === 'interntrack_data_guest';

  if (isGuest) {
    // Show a generic "guest" indicator
    userInfoEl.classList.remove('hidden');
    userInfoEl.classList.add('flex');
    if (initialsEl) initialsEl.textContent = 'G';
    if (emailEl) { emailEl.textContent = 'Guest'; emailEl.classList.remove('hidden'); }
    return;
  }

  if (currentUser) {
    userInfoEl.classList.remove('hidden');
    userInfoEl.classList.add('flex');

    if (currentUser.photoURL && avatarEl) {
      avatarEl.src = currentUser.photoURL;
      avatarEl.classList.remove('hidden');
      if (initialsEl) initialsEl.style.display = 'none';
    } else if (initialsEl) {
      initialsEl.textContent = getInitials(currentUser.displayName || currentUser.email);
    }
    if (emailEl) {
      emailEl.textContent = currentUser.displayName || currentUser.email || '';
      emailEl.classList.remove('hidden');
    }
  }
  updateMobileNavAvatar();
}

async function initApp() {
  // Apply saved theme (also set by the inline script in app.html, but set here as fallback)
  const savedTheme = localStorage.getItem('interntrack_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  updateNavbarUser();

  // For signed-in users: start a real-time Firestore listener.
  // The first snapshot loads data; every subsequent snapshot (triggered by
  // any device saving) re-renders the current view automatically.
  if (FIREBASE_CONFIGURED && currentUser) {
    await new Promise((resolve) => {
      let firstSnapshot = true;

      if (firestoreUnsubscribe) firestoreUnsubscribe(); // clear any stale listener

      firestoreUnsubscribe = firebase.firestore()
        .collection('users')
        .doc(currentUser.uid)
        .onSnapshot(
          (doc) => {
            firestoreStatus = 'ok';

            if (doc.exists) {
              // Cloud data arrived — update local cache
              localStorage.setItem(STORE_KEY, JSON.stringify(doc.data()));
            } else if (firstSnapshot) {
              // No cloud doc yet — push local data up so other devices get it
              const local = loadData();
              if (local) saveToCloud(local);
            }

            firstSnapshot = false;
            resolve(); // unblocks initApp() on first snapshot

            // For subsequent snapshots (real-time updates from other devices):
            // re-render whatever view is currently open
            if (currentView === 'dashboard') renderDashboard();
            if (currentView === 'calendar')  renderCalendar();
            if (currentView === 'settings')  renderSettings();
          },
          (err) => {
            firestoreStatus = err.code === 'permission-denied' ? 'unconfigured' : 'error';
            console.error('[InternTrack] Firestore listener error:', err.code, err.message);
            resolve(); // still let the app load using localStorage
          }
        );
    });
  }

  const loading = document.getElementById('auth-loading');
  if (loading) loading.style.display = 'none';
  checkOnboarding();
  showView('dashboard');
}

// =====================================================
// PROFILE MODAL
// =====================================================
function openProfile() {
  const isGuest = STORE_KEY === 'interntrack_data_guest';

  // Guest notice
  const guestNotice = document.getElementById('profile-guest-notice');
  const editForm    = document.getElementById('profile-edit-form');
  if (guestNotice) guestNotice.classList.toggle('hidden', !isGuest);
  if (editForm)    editForm.style.display = isGuest ? 'none' : 'block';

  // Avatar
  const avatarImg      = document.getElementById('profile-avatar-img');
  const avatarInitials = document.getElementById('profile-avatar-initials');
  const displayName    = document.getElementById('profile-display-name');
  const emailDisplay   = document.getElementById('profile-email-display');
  const nameInput      = document.getElementById('profile-name-input');
  const emailInput     = document.getElementById('profile-email-input');

  if (isGuest) {
    if (avatarInitials) avatarInitials.textContent = 'G';
    if (displayName)    displayName.textContent     = 'Guest User';
    if (emailDisplay)   emailDisplay.textContent    = 'Not signed in';
  } else if (currentUser) {
    if (currentUser.photoURL && avatarImg) {
      avatarImg.src = currentUser.photoURL;
      avatarImg.classList.remove('hidden');
      if (avatarInitials) avatarInitials.style.display = 'none';
    } else if (avatarInitials) {
      avatarInitials.textContent = getInitials(currentUser.displayName || currentUser.email);
    }
    if (displayName)  displayName.textContent  = currentUser.displayName || 'No name set';
    if (emailDisplay) emailDisplay.textContent = currentUser.email || '';
    if (nameInput)    nameInput.value          = currentUser.displayName || '';
    if (emailInput)   emailInput.value         = currentUser.email || '';
  }

  document.getElementById('modal-profile').classList.remove('hidden');
}

function closeProfileOutside(e) {
  if (e.target.id === 'modal-profile') closeProfile();
}

function closeProfile() {
  document.getElementById('modal-profile').classList.add('hidden');
}

async function saveProfile() {
  if (!currentUser || !FIREBASE_CONFIGURED) return;
  const nameInput = document.getElementById('profile-name-input');
  const name = nameInput ? nameInput.value.trim() : '';

  try {
    await firebase.auth().currentUser.updateProfile({ displayName: name });
    currentUser = firebase.auth().currentUser;
    // Refresh profile modal display and navbar
    document.getElementById('profile-display-name').textContent = name || 'No name set';
    updateNavbarUser();
    closeProfile();
    showToast('Profile updated!');
  } catch (err) {
    showToast('Failed to update profile', 'error');
  }
}

// =====================================================
// DATA LAYER
// =====================================================
// STORE_KEY is set dynamically in the init block below

const PH_HOLIDAYS = {
  '2025-01-01': "New Year's Day",
  '2025-04-09': "Araw ng Kagitingan",
  '2025-04-17': "Maundy Thursday",
  '2025-04-18': "Good Friday",
  '2025-04-19': "Black Saturday",
  '2025-05-01': "Labor Day",
  '2025-06-12': "Independence Day",
  '2025-08-21': "Ninoy Aquino Day",
  '2025-08-25': "National Heroes Day",
  '2025-11-01': "All Saints' Day",
  '2025-11-02': "All Souls' Day",
  '2025-11-30': "Bonifacio Day",
  '2025-12-08': "Feast of the Immaculate Conception",
  '2025-12-24': "Christmas Eve",
  '2025-12-25': "Christmas Day",
  '2025-12-30': "Rizal Day",
  '2025-12-31': "New Year's Eve",
  '2026-01-01': "New Year's Day",
  '2026-04-02': "Maundy Thursday",
  '2026-04-03': "Good Friday",
  '2026-04-04': "Black Saturday",
  '2026-04-09': "Araw ng Kagitingan",
  '2026-05-01': "Labor Day",
  '2026-06-12': "Independence Day",
  '2026-08-21': "Ninoy Aquino Day",
  '2026-08-31': "National Heroes Day",
  '2026-11-01': "All Saints' Day",
  '2026-11-02': "All Souls' Day",
  '2026-11-30': "Bonifacio Day",
  '2026-12-08': "Feast of the Immaculate Conception",
  '2026-12-24': "Christmas Eve",
  '2026-12-25': "Christmas Day",
  '2026-12-30': "Rizal Day",
  '2026-12-31': "New Year's Eve",
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveData(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  saveToCloud(data); // fire-and-forget — UI stays instant
}

// =====================================================
// THEME
// =====================================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('interntrack_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
  renderSettings();
}

// =====================================================
// FIRESTORE CLOUD SYNC
// =====================================================
// 'ok' | 'error' | 'unconfigured' | null (unknown yet)
let firestoreStatus = null;

function saveToCloud(data) {
  if (!FIREBASE_CONFIGURED || !currentUser) return;
  firebase.firestore().collection('users').doc(currentUser.uid).set(data)
    .then(() => { firestoreStatus = 'ok'; })
    .catch(e => {
      firestoreStatus = 'error';
      console.error('[InternTrack] Firestore write failed:', e.code, e.message);
    });
}

async function manualSync() {
  if (!FIREBASE_CONFIGURED || !currentUser) {
    showToast('Sign in to enable cloud sync', 'warning');
    return;
  }
  const data = getData();
  if (!data) { showToast('Nothing to sync', 'warning'); return; }
  showToast('Syncing…');
  try {
    await firebase.firestore().collection('users').doc(currentUser.uid).set(data);
    firestoreStatus = 'ok';
    showToast('Synced! Data is now in the cloud.');
    renderSettings(); // refresh status card
  } catch (e) {
    firestoreStatus = 'error';
    console.error('[InternTrack] Manual sync failed:', e.code, e.message);
    showToast(`Sync failed: ${e.code || e.message}`, 'error');
    renderSettings();
  }
}

function getData() {
  let data = loadData();
  if (!data) {
    data = {
      settings: {
        requiredHours: 486,
        startDate: '',
        companyName: 'Designblue Philippines Inc.',
      },
      logs: {},
    };
  }
  return data;
}

// =====================================================
// CALCULATIONS
// =====================================================
function calcRenderedHours(logs) {
  return Object.values(logs).reduce((sum, log) => {
    if (!log.isLeave && !log.isHoliday && log.hoursRendered) sum += log.hoursRendered;
    return sum;
  }, 0);
}

function calcHoursFromTimes(timeIn, timeOut, lunchIncluded) {
  if (!timeIn || !timeOut) return null;
  const [ih, im] = timeIn.split(':').map(Number);
  const [oh, om] = timeOut.split(':').map(Number);
  let raw = (oh * 60 + om - ih * 60 - im) / 60;
  if (raw <= 0) return null;
  if (!lunchIncluded) raw -= 1;
  return Math.max(0, Math.round(raw * 100) / 100);
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function toDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayStr() {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

// =====================================================
// TOAST NOTIFICATIONS
// =====================================================
let toastTimer = null;

function showToast(msg, type = 'success') {
  const existing = document.getElementById('toast-el');
  if (existing) existing.remove();
  if (toastTimer) clearTimeout(toastTimer);

  const t = document.createElement('div');
  t.id = 'toast-el';
  t.className = 'toast';

  const color =
    type === 'success' ? '#22C55E' :
    type === 'warning' ? '#F59E0B' :
    '#EF4444';

  t.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
      <span>${msg}</span>
    </div>`;

  document.body.appendChild(t);

  toastTimer = setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// =====================================================
// ONBOARDING
// =====================================================
function checkOnboarding() {
  const data = loadData();
  if (!data || !data.settings || !data.settings.requiredHours) {
    document.getElementById('modal-onboarding').classList.remove('hidden');
    const today = new Date();
    document.getElementById('ob-start').value = toDateStr(
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate()
    );
  }
}

function saveOnboarding() {
  const company =
    document.getElementById('ob-company').value.trim() || '';
  const hours = parseInt(document.getElementById('ob-hours').value);
  const start = document.getElementById('ob-start').value;

  if (!hours || hours < 1) {
    showToast('Please enter your required hours', 'error');
    return;
  }
  if (!start) {
    showToast('Please enter your start date', 'error');
    return;
  }

  const data = getData();
  data.settings = { requiredHours: hours, startDate: start, companyName: company };
  saveData(data);

  document.getElementById('modal-onboarding').classList.add('hidden');
  showToast("Profile saved! Let's start tracking.");
  showView('dashboard');
}

// =====================================================
// VIEW ROUTING
// =====================================================
let currentView = 'dashboard';
let calYear, calMonth;
let multiSelectMode = false;
let selectedDates   = new Set();

function showView(view) {
  currentView = view;
  ['dashboard', 'calendar', 'settings'].forEach(v => {
    document.getElementById(`view-${v}`).classList.add('hidden');
    document.getElementById(`nav-${v}`)?.classList.remove('active');
    document.getElementById(`mnav-${v}`)?.classList.remove('active');
  });
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.getElementById(`nav-${view}`)?.classList.add('active');
  document.getElementById(`mnav-${view}`)?.classList.add('active');

  if (view === 'dashboard') renderDashboard();
  if (view === 'calendar')  renderCalendar();
  if (view === 'settings')  renderSettings();
}

// =====================================================
// DASHBOARD VIEW
// =====================================================
function renderDashboard() {
  const data = getData();
  const { settings, logs } = data;
  const required  = settings.requiredHours || 0;
  const rendered  = parseFloat(calcRenderedHours(logs).toFixed(2));
  const remaining = Math.max(0, parseFloat((required - rendered).toFixed(2)));
  const pct       = required > 0 ? Math.min(100, (rendered / required) * 100) : 0;

  const allLogDates = Object.keys(logs);
  const loggedDays  = allLogDates.filter(d => !logs[d].isLeave && !logs[d].isHoliday && logs[d].hoursRendered).length;
  const leaveDays   = allLogDates.filter(d => logs[d].isLeave).length;
  const avgHours    = loggedDays > 0 ? (rendered / loggedDays).toFixed(2) : '—';
  const recent      = allLogDates.sort((a, b) => b.localeCompare(a)).slice(0, 5);

  // Circular progress ring
  const r = 54;
  const C = 2 * Math.PI * r;
  const offset = C - (pct / 100) * C;

  const el = document.getElementById('view-dashboard');
  el.innerHTML = `
    <div class="space-y-6">

      <!-- Hero heading -->
      <div class="text-center mb-2">
        <h1 class="text-2xl font-bold text-white">InternTrack</h1>
        <p class="text-[#475569] text-sm">Powered by your hustle @ ${settings.companyName}</p>
      </div>

      <!-- Progress hero card -->
      <div class="card p-4 md:p-8">
        <div class="flex flex-col md:flex-row items-center gap-5 md:gap-8">

          <!-- Ring — responsive size -->
          <div class="relative flex-shrink-0" style="width:clamp(110px,30vw,140px);height:clamp(110px,30vw,140px)">
            <svg width="100%" height="100%" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="${r}" fill="none" stroke="#1e3a5f" stroke-width="10"/>
              <circle cx="70" cy="70" r="${r}" fill="none" stroke="#FF6B00" stroke-width="10"
                class="progress-ring-fill"
                stroke-dasharray="${C}"
                stroke-dashoffset="${offset}"
                style="transform-origin:center;transform:rotate(-90deg);filter:drop-shadow(0 0 8px #FF6B00)"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-2xl md:text-3xl font-black text-white">${pct.toFixed(0)}%</span>
              <span class="text-xs text-[#94A3B8]">complete</span>
            </div>
          </div>

          <!-- Hour stats -->
          <div class="flex-1 w-full grid grid-cols-1 gap-3">
            <div class="grid grid-cols-3 gap-2">
              <div class="card p-2 md:p-4 text-center">
                <p class="text-xs text-[#94A3B8] mb-1">Required</p>
                <p class="text-base md:text-xl font-bold text-white">${required}<span class="text-xs text-[#94A3B8]"> hrs</span></p>
              </div>
              <div class="card p-2 md:p-4 text-center border-[#22C55E]/30">
                <p class="text-xs text-[#94A3B8] mb-1">Rendered</p>
                <p class="text-base md:text-xl font-bold text-[#22C55E]">${rendered}<span class="text-xs text-[#94A3B8]"> hrs</span></p>
              </div>
              <div class="card p-2 md:p-4 text-center ${remaining === 0 ? 'border-[#22C55E]/30' : 'border-[#FF6B00]/30'}">
                <p class="text-xs text-[#94A3B8] mb-1">Remaining</p>
                <p class="text-base md:text-xl font-bold ${remaining === 0 ? 'text-[#22C55E]' : 'text-[#FF6B00]'}">${remaining}<span class="text-xs text-[#94A3B8]"> hrs</span></p>
              </div>
            </div>
            ${remaining === 0 ? `
              <div class="p-3 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/30 text-center text-sm text-[#22C55E] font-semibold">
                Internship hours complete! 🎉
              </div>` : ''}
          </div>
        </div>
      </div>

      <!-- Quick stats -->
      <div class="grid grid-cols-3 gap-2">
        <div class="card card-hover p-3 md:p-4 text-center" onclick="showView('calendar')">
          <p class="text-xl md:text-2xl font-bold text-white">${loggedDays}</p>
          <p class="text-xs text-[#94A3B8] mt-1">Days Logged</p>
        </div>
        <div class="card card-hover p-3 md:p-4 text-center" onclick="showView('calendar')">
          <p class="text-xl md:text-2xl font-bold text-[#F59E0B]">${leaveDays}</p>
          <p class="text-xs text-[#94A3B8] mt-1">On Leave</p>
        </div>
        <div class="card p-3 md:p-4 text-center">
          <p class="text-xl md:text-2xl font-bold text-[#94A3B8]">${avgHours}</p>
          <p class="text-xs text-[#94A3B8] mt-1">Avg Hrs/Day</p>
        </div>
      </div>

      <!-- CTA -->
      <div class="flex gap-2 justify-center">
        <button class="btn-primary px-6 py-3 text-sm flex-1 md:flex-none" onclick="showView('calendar')">
          Go to Calendar →
        </button>
        <button class="btn-secondary px-6 py-3 text-sm flex-1 md:flex-none" onclick="openDTRModal()">
          Export DTR 📄
        </button>
      </div>

      <!-- Recent activity -->
      <div class="card p-5">
        <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
          <svg class="w-4 h-4 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Recent Activity
        </h3>
        ${recent.length === 0 ? `
          <div class="text-center py-8">
            <div class="text-4xl mb-3">📅</div>
            <p class="text-[#94A3B8] text-sm">No logs yet</p>
            <p class="text-[#475569] text-xs mt-1">Click on a calendar date to start logging</p>
            <button class="btn-primary mt-4 text-sm px-6 py-2" onclick="showView('calendar')">Open Calendar</button>
          </div>
        ` : `
          <div class="space-y-3">
            ${recent.map(dateStr => {
              const log = logs[dateStr];
              const isHol = PH_HOLIDAYS[dateStr] || log.isHoliday;
              const label =
                log.isLeave ? '<span class="badge badge-leave">Leave</span>' :
                isHol ? `<span class="badge badge-holiday">${PH_HOLIDAYS[dateStr] || 'Holiday'}</span>` :
                log.hoursRendered ? `<span class="badge badge-logged">${log.hoursRendered} hrs</span>` : '';
              const [y, m, d] = dateStr.split('-').map(Number);
              const dt = new Date(y, m - 1, d);
              const dayName = dt.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
              return `
                <div class="activity-item flex items-center justify-between py-1">
                  <span class="text-sm text-[#94A3B8]">${dayName}</span>
                  <span>${label || '<span class="text-xs text-[#475569]">—</span>'}</span>
                </div>`;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

// =====================================================
// CALENDAR VIEW
// =====================================================
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function initCalendar() {
  const t = new Date();
  calYear  = t.getFullYear();
  calMonth = t.getMonth();
}

function renderCalendar() {
  if (!calYear) initCalendar();
  const data  = getData();
  const { logs } = data;
  const today = todayStr();

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();

  const cells = [];

  // Previous month filler
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, month: calMonth - 1, year: calYear, other: true });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: calMonth, year: calYear, other: false });
  }
  // Next month filler
  while (cells.length % 7 !== 0) {
    const extra = cells.length - firstDay - daysInMonth + 1;
    cells.push({ day: extra, month: calMonth + 1, year: calYear, other: true });
  }

  const el = document.getElementById('view-calendar');
  el.innerHTML = `
    <div class="space-y-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-white">${MONTHS[calMonth]} ${calYear}</h2>
        <div class="flex items-center gap-2">
          <button class="btn-secondary px-3 py-2 text-sm" onclick="calNav(-1)">‹ Prev</button>
          <button class="btn-secondary px-3 py-2 text-sm" onclick="calNav(0)">Today</button>
          <button class="btn-secondary px-3 py-2 text-sm" onclick="calNav(1)">Next ›</button>
          <button class="px-3 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${multiSelectMode
            ? 'bg-[#FF6B00] text-white shadow-[0_0_12px_rgba(255,107,0,0.5)]'
            : 'btn-secondary'}" onclick="toggleMultiSelect()">
            ${multiSelectMode ? '✕ Exit Select' : '⊞ Select Days'}
          </button>
        </div>
      </div>

      ${multiSelectMode ? `
      <div class="p-3 rounded-lg bg-[#FF6B00]/10 border border-[#FF6B00]/30 text-sm text-[#FF6B00] flex items-center justify-between">
        <span>Tap days to select. <strong>${selectedDates.size}</strong> day${selectedDates.size !== 1 ? 's' : ''} selected.</span>
        <div class="flex gap-2">
          ${selectedDates.size > 0 ? `
            <button onclick="clearSelection()" class="text-xs text-[#94A3B8] underline underline-offset-2">Clear</button>
            <button onclick="openBulkLog()" class="btn-primary text-xs px-3 py-1.5">Log Selected →</button>
          ` : ''}
        </div>
      </div>` : ''}

      <!-- Legend -->
      <div class="flex flex-wrap gap-3 text-xs text-[#94A3B8]">
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-[#FF6B00]/20 border border-[#FF6B00]/40 inline-block"></span>Holiday
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-[#F59E0B]/20 border border-[#F59E0B]/40 inline-block"></span>Leave
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-[#22C55E]/20 border border-[#22C55E]/40 inline-block"></span>Logged
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded border-2 border-[#FF6B00] inline-block"></span>Today
        </span>
        ${multiSelectMode ? `<span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-[#FF6B00]/30 border border-[#FF6B00] inline-block"></span>Selected
        </span>` : ''}
      </div>

      <!-- Grid -->
      <div class="card p-4">
        <div class="grid grid-cols-7 mb-2">
          ${DAYS.map(d => `<div class="text-center text-xs font-semibold text-[#475569] py-2">${d}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 gap-1">
          ${cells.map(cell => {
            const ds      = toDateStr(cell.year, cell.month + 1, cell.day);
            const log     = logs[ds] || {};
            const isToday = ds === today;
            const isPHol  = PH_HOLIDAYS[ds];
            const isFuture = ds > today;
            const isHol   = isPHol || log.isHoliday;
            const isLeave = log.isLeave;
            const isLogged = !isLeave && !isHol && log.hoursRendered;

            const isSelected = selectedDates.has(ds);

            let cls = 'cal-day bg-[#0A1628]';
            if (cell.other)    cls += ' other-month';
            else if (isToday)  cls += ' today';
            else if (isFuture) cls += ' future-day';

            if (!cell.other) {
              if (isSelected)        cls += ' selected-day';
              else if (isLeave)      cls += ' leave-day';
              else if (isHol)        cls += ' holiday-day';
              else if (isLogged)     cls += ' logged-day';
            }

            const onClick = cell.other ? '' :
              multiSelectMode
                ? `onclick="toggleDateSelection('${ds}')"`
                : `onclick="openDayLog('${ds}')"`;

            return `
              <div class="${cls}" ${onClick}>
                <span class="text-xs font-bold ${isToday ? 'text-[#FF6B00]' : 'text-[#94A3B8]'} leading-none">${cell.day}</span>
                ${isHol && !cell.other && !isSelected ? `<span class="badge badge-holiday mt-0.5" style="font-size:8px;padding:1px 4px">${isPHol ? isPHol.split(' ').slice(0,2).join(' ') : 'Holiday'}</span>` : ''}
                ${isLeave && !cell.other && !isSelected ? `<span class="badge badge-leave mt-0.5" style="font-size:8px;padding:1px 4px">Leave</span>` : ''}
                ${isLogged && !cell.other && !isSelected ? `<span class="text-[#22C55E] mt-auto" style="font-size:9px;font-weight:700">${log.hoursRendered}h</span>` : ''}
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function calNav(dir) {
  if (dir === 0) {
    const t = new Date();
    calYear  = t.getFullYear();
    calMonth = t.getMonth();
  } else {
    calMonth += dir;
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0;  calYear++; }
  }
  renderCalendar();
}

// =====================================================
// MULTI-SELECT
// =====================================================
function toggleMultiSelect() {
  multiSelectMode = !multiSelectMode;
  if (!multiSelectMode) selectedDates.clear();
  renderCalendar();
}

function toggleDateSelection(dateStr) {
  if (selectedDates.has(dateStr)) {
    selectedDates.delete(dateStr);
  } else {
    selectedDates.add(dateStr);
  }
  renderCalendar();
}

function clearSelection() {
  selectedDates.clear();
  renderCalendar();
}

// =====================================================
// BULK LOG MODAL
// =====================================================
let bulkDlState = { isLeave: false, isHoliday: false, lunchIncluded: false };

function openBulkLog() {
  if (selectedDates.size === 0) return;
  bulkDlState = { isLeave: false, isHoliday: false, lunchIncluded: false };

  const count = selectedDates.size;
  document.getElementById('bulklog-title').textContent    = `Log ${count} Day${count !== 1 ? 's' : ''}`;
  document.getElementById('bulklog-subtitle').textContent = `Same entry applied to all ${count} selected dates`;

  document.getElementById('bl-timein').value  = '';
  document.getElementById('bl-timeout').value = '';
  document.getElementById('btoggle-leave').classList.remove('on');
  document.getElementById('btoggle-holiday').classList.remove('on');
  document.getElementById('btoggle-lunch').classList.remove('on');

  calcBulkHours();
  updateBulkTimeSectionVisibility();
  document.getElementById('modal-bulklog').classList.remove('hidden');
}

function closeBulkLogOutside(e) {
  if (e.target.id === 'modal-bulklog') closeBulkLog();
}

function closeBulkLog() {
  document.getElementById('modal-bulklog').classList.add('hidden');
}

function updateBulkTimeSectionVisibility() {
  const disabled = bulkDlState.isLeave || bulkDlState.isHoliday;
  const section  = document.getElementById('bulklog-timesection');
  section.style.opacity       = disabled ? '0.35' : '1';
  section.style.pointerEvents = disabled ? 'none'  : 'auto';
}

function toggleBulkLeave() {
  bulkDlState.isLeave = !bulkDlState.isLeave;
  document.getElementById('btoggle-leave').classList.toggle('on', bulkDlState.isLeave);
  updateBulkTimeSectionVisibility();
}

function toggleBulkHoliday() {
  bulkDlState.isHoliday = !bulkDlState.isHoliday;
  document.getElementById('btoggle-holiday').classList.toggle('on', bulkDlState.isHoliday);
  updateBulkTimeSectionVisibility();
}

function toggleBulkLunch() {
  bulkDlState.lunchIncluded = !bulkDlState.lunchIncluded;
  document.getElementById('btoggle-lunch').classList.toggle('on', bulkDlState.lunchIncluded);
  calcBulkHours();
}

function calcBulkHours() {
  const ti = document.getElementById('bl-timein').value;
  const to = document.getElementById('bl-timeout').value;
  const h  = calcHoursFromTimes(ti, to, bulkDlState.lunchIncluded);
  const el = document.getElementById('bulk-hours-value');
  if (h === null || h === undefined) {
    el.textContent = '—'; el.style.color = '#475569';
  } else {
    el.textContent = `${h} hrs`; el.style.color = '#22C55E';
  }
}

function saveBulkLog() {
  const ti    = document.getElementById('bl-timein').value;
  const to    = document.getElementById('bl-timeout').value;
  const hours = calcHoursFromTimes(ti, to, bulkDlState.lunchIncluded);

  const data = getData();
  selectedDates.forEach(dateStr => {
    data.logs[dateStr] = {
      isLeave:       bulkDlState.isLeave,
      isHoliday:     bulkDlState.isHoliday,
      lunchIncluded: bulkDlState.lunchIncluded,
      timeIn:        ti  || null,
      timeOut:       to  || null,
      hoursRendered: (!bulkDlState.isLeave && !bulkDlState.isHoliday && hours != null) ? hours : 0,
    };
  });
  saveData(data);

  const count = selectedDates.size;
  const msg =
    bulkDlState.isLeave   ? `Leave marked for ${count} days!` :
    bulkDlState.isHoliday ? `Holiday marked for ${count} days!` :
    `Logged ${hours ?? 0} hrs × ${count} days!`;
  showToast(msg);

  closeBulkLog();
  multiSelectMode = false;
  selectedDates.clear();
  renderCalendar();
  if (currentView === 'dashboard') renderDashboard();
}

// =====================================================
// DAY LOG MODAL
// =====================================================
let currentDayLogDate = null;
let dlState = { isLeave: false, isHoliday: false, lunchIncluded: false };

function openDayLog(dateStr) {
  currentDayLogDate = dateStr;
  const data   = getData();
  const log    = data.logs[dateStr] || {};
  const isPHol = PH_HOLIDAYS[dateStr];

  dlState = {
    isLeave:       !!log.isLeave,
    isHoliday:     !!(log.isHoliday || isPHol),
    lunchIncluded: !!log.lunchIncluded,
  };

  document.getElementById('daylog-title').textContent    = formatDate(dateStr);
  document.getElementById('daylog-subtitle').textContent = isPHol
    ? '🇵🇭 Philippine Holiday'
    : 'Click time fields to log hours';

  const notice = document.getElementById('daylog-holiday-notice');
  if (isPHol) {
    notice.classList.remove('hidden');
    document.getElementById('daylog-holiday-name').textContent = `Philippine Holiday: ${isPHol}`;
  } else {
    notice.classList.add('hidden');
  }

  document.getElementById('toggle-leave').classList.toggle('on', dlState.isLeave);
  document.getElementById('toggle-holiday').classList.toggle('on', dlState.isHoliday);
  document.getElementById('toggle-lunch').classList.toggle('on', dlState.lunchIncluded);

  document.getElementById('dl-timein').value  = log.timeIn  || '';
  document.getElementById('dl-timeout').value = log.timeOut || '';

  updateTimeSectionVisibility();
  calcHours();

  document.getElementById('modal-daylog').classList.remove('hidden');
}

function closeDayLogOutside(e) {
  if (e.target.id === 'modal-daylog') closeDayLog();
}

function closeDayLog() {
  document.getElementById('modal-daylog').classList.add('hidden');
  currentDayLogDate = null;
}

function updateTimeSectionVisibility() {
  const disabled = dlState.isLeave || dlState.isHoliday;
  const section  = document.getElementById('daylog-timesection');
  section.style.opacity       = disabled ? '0.35' : '1';
  section.style.pointerEvents = disabled ? 'none'  : 'auto';
}

function toggleLeave() {
  dlState.isLeave = !dlState.isLeave;
  document.getElementById('toggle-leave').classList.toggle('on', dlState.isLeave);
  updateTimeSectionVisibility();
}

function toggleHoliday() {
  dlState.isHoliday = !dlState.isHoliday;
  document.getElementById('toggle-holiday').classList.toggle('on', dlState.isHoliday);
  updateTimeSectionVisibility();
}

function toggleLunch() {
  dlState.lunchIncluded = !dlState.lunchIncluded;
  document.getElementById('toggle-lunch').classList.toggle('on', dlState.lunchIncluded);
  calcHours();
}

function calcHours() {
  const ti = document.getElementById('dl-timein').value;
  const to = document.getElementById('dl-timeout').value;
  const h  = calcHoursFromTimes(ti, to, dlState.lunchIncluded);
  const el = document.getElementById('hours-value');

  if (h === null || h === undefined) {
    el.textContent  = '—';
    el.style.color  = '#475569';
  } else {
    el.textContent  = `${h} hrs`;
    el.style.color  = '#22C55E';
  }
}

function saveDayLog() {
  if (!currentDayLogDate) return;

  const ti    = document.getElementById('dl-timein').value;
  const to    = document.getElementById('dl-timeout').value;
  const hours = calcHoursFromTimes(ti, to, dlState.lunchIncluded);

  const entry = {
    isLeave:       dlState.isLeave,
    isHoliday:     dlState.isHoliday,
    lunchIncluded: dlState.lunchIncluded,
    timeIn:        ti || null,
    timeOut:       to || null,
    hoursRendered: (!dlState.isLeave && !dlState.isHoliday && hours != null) ? hours : 0,
  };

  const data = getData();
  data.logs[currentDayLogDate] = entry;
  saveData(data);

  closeDayLog();

  const msg =
    dlState.isLeave   ? 'Leave marked!' :
    dlState.isHoliday ? 'Holiday marked!' :
    `Log saved! ${hours ?? 0} hrs`;
  showToast(msg);

  if (currentView === 'calendar')  renderCalendar();
  if (currentView === 'dashboard') renderDashboard();
}

function clearDayLog() {
  if (!currentDayLogDate) return;
  const data = getData();
  delete data.logs[currentDayLogDate];
  saveData(data);
  closeDayLog();
  showToast('Log cleared', 'warning');
  if (currentView === 'calendar')  renderCalendar();
  if (currentView === 'dashboard') renderDashboard();
}

// =====================================================
// SETTINGS VIEW
// =====================================================
function renderSettings() {
  const data = getData();
  const { settings } = data;
  const el = document.getElementById('view-settings');

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  el.innerHTML = `
    <div class="max-w-lg mx-auto space-y-5">
      <h2 class="text-xl font-bold text-white">Settings</h2>

      <!-- Appearance -->
      <div class="card p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold text-white">Appearance</p>
            <p class="text-xs text-[#94A3B8] mt-0.5">Light mode for a brighter look</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-[#94A3B8]">${currentTheme === 'light' ? '☀️ Light' : '🌙 Dark'}</span>
            <button class="toggle-btn ${currentTheme === 'light' ? 'on' : ''}" onclick="toggleTheme()" title="Toggle light/dark mode"></button>
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="font-semibold text-white text-sm uppercase tracking-wide text-[#94A3B8]">Internship Profile</h3>
        <div>
          <label class="block text-sm font-medium text-[#94A3B8] mb-1.5">Company Name</label>
          <input id="s-company" class="input-field" type="text" value="${settings.companyName || ''}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-[#94A3B8] mb-1.5">Total Required Hours</label>
          <input id="s-hours" class="input-field" type="number" value="${settings.requiredHours || ''}" min="1" />
        </div>
        <div>
          <label class="block text-sm font-medium text-[#94A3B8] mb-1.5">Internship Start Date</label>
          <input id="s-start" class="input-field" type="date" value="${settings.startDate || ''}" />
        </div>
        <button class="btn-primary w-full py-2.5 text-sm" onclick="saveSettings()">Save Changes</button>
      </div>

      ${FIREBASE_CONFIGURED && currentUser ? `
      <div class="card p-6 space-y-4 ${firestoreStatus === 'ok' ? 'border-[#22C55E]/30' : firestoreStatus === 'unconfigured' || firestoreStatus === 'error' ? 'border-[#EF4444]/30' : ''}">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-white text-sm uppercase tracking-wide text-[#94A3B8]">Cloud Sync</h3>
          <span class="text-xs font-semibold px-2 py-1 rounded-full ${
            firestoreStatus === 'ok'           ? 'bg-[#22C55E]/20 text-[#22C55E]' :
            firestoreStatus === 'unconfigured' ? 'bg-[#EF4444]/20 text-[#EF4444]' :
            firestoreStatus === 'error'        ? 'bg-[#F59E0B]/20 text-[#F59E0B]' :
                                                 'bg-[#475569]/20 text-[#94A3B8]'
          }">
            ${ firestoreStatus === 'ok'           ? '● Active' :
               firestoreStatus === 'unconfigured' ? '● Not set up' :
               firestoreStatus === 'error'        ? '● Error' :
                                                    '● Checking…' }
          </span>
        </div>

        <p class="text-xs text-[#94A3B8]">
          Signed in as <strong class="text-white">${currentUser.email || currentUser.displayName || 'Google Account'}</strong>.
        </p>

        ${firestoreStatus === 'unconfigured' ? `
        <div class="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#94A3B8] space-y-1.5">
          <p class="font-semibold text-[#EF4444]">Firestore database not set up yet</p>
          <p>1. Go to <strong class="text-white">console.firebase.google.com</strong> → your project</p>
          <p>2. Left sidebar → <strong class="text-white">Build → Firestore Database</strong></p>
          <p>3. Click <strong class="text-white">Create database</strong> → Production mode → Done</p>
          <p>4. Click the <strong class="text-white">Rules</strong> tab → paste this → Publish:</p>
          <pre class="bg-[#060E1E] p-2 rounded text-[10px] text-[#22C55E] overflow-x-auto mt-1">rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null
        &amp;&amp; request.auth.uid == userId;
    }
  }
}</pre>
          <p>5. Come back here and click <strong class="text-white">Sync Now</strong>.</p>
        </div>` : ''}

        <button class="btn-secondary w-full py-2.5 text-sm" onclick="manualSync()">↑ Sync Local Data to Cloud Now</button>
      </div>` : ''}

      <div class="card p-6 space-y-3 border-[#EF4444]/20">
        <h3 class="font-semibold text-[#EF4444] text-sm uppercase tracking-wide">Danger Zone</h3>
        <p class="text-xs text-[#94A3B8]">
          This will permanently delete all your logged data and settings. This action cannot be undone.
        </p>
        <button class="btn-danger w-full py-2.5 text-sm" onclick="confirmReset()">Reset All Data</button>
      </div>

      <div class="card p-5 text-center">
        <p class="text-xs text-[#94A3B8]">InternTrack — Your personal internship hour tracker</p>
        <p class="text-xs text-[#475569] mt-1">${FIREBASE_CONFIGURED && currentUser ? 'Logs synced to cloud via Firestore' : 'Hour logs are saved locally in your browser'}</p>
      </div>
    </div>
  `;
}

function saveSettings() {
  const company = document.getElementById('s-company').value.trim();
  const hours   = parseInt(document.getElementById('s-hours').value);
  const start   = document.getElementById('s-start').value;

  if (!hours || hours < 1) {
    showToast('Enter valid required hours', 'error');
    return;
  }

  const data = getData();
  data.settings = {
    companyName:   company || data.settings.companyName,
    requiredHours: hours,
    startDate:     start,
  };
  saveData(data);
  showToast('Settings saved!');
}

function confirmReset() {
  if (confirm('Are you sure you want to reset ALL data? This cannot be undone.')) {
    localStorage.removeItem(STORE_KEY);
    if (FIREBASE_CONFIGURED && currentUser) {
      firebase.firestore().collection('users').doc(currentUser.uid).delete()
        .catch(e => console.warn('[InternTrack] Firestore delete failed', e));
    }
    showToast('All data cleared', 'warning');
    setTimeout(() => { location.reload(); }, 1000);
  }
}

// =====================================================
// DTR EXPORT
// =====================================================
function openDTRModal() {
  const now = new Date();
  document.getElementById('dtr-month').value = now.getMonth() + 1;
  document.getElementById('dtr-year').value  = now.getFullYear();

  // Pre-fill name from profile
  const name = currentUser?.displayName || '';
  document.getElementById('dtr-name').value = name;

  updateDTRPreview();

  // Update preview when month/year changes
  document.getElementById('dtr-month').onchange = updateDTRPreview;
  document.getElementById('dtr-year').onchange  = updateDTRPreview;

  document.getElementById('modal-dtr').classList.remove('hidden');
}

function closeDTROutside(e) {
  if (e.target.id === 'modal-dtr') closeDTRModal();
}

function closeDTRModal() {
  document.getElementById('modal-dtr').classList.add('hidden');
}

function updateDTRPreview() {
  const month = parseInt(document.getElementById('dtr-month').value);
  const year  = parseInt(document.getElementById('dtr-year').value);
  const data  = getData();
  const logs  = data.logs || {};

  const daysInMonth = new Date(year, month, 0).getDate();
  let totalHours = 0, loggedDays = 0, leaveDays = 0, holidayDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = toDateStr(year, month, d);
    const log = logs[ds];
    if (!log) continue;
    if (log.isLeave)   { leaveDays++;   continue; }
    if (log.isHoliday || PH_HOLIDAYS[ds]) { holidayDays++; continue; }
    if (log.hoursRendered) { totalHours += log.hoursRendered; loggedDays++; }
  }

  document.getElementById('dtr-preview').innerHTML = `
    <div class="grid grid-cols-2 gap-2 text-center">
      <div><p class="text-white font-bold text-base">${loggedDays}</p><p>Days Logged</p></div>
      <div><p class="text-[#22C55E] font-bold text-base">${totalHours.toFixed(2)}</p><p>Hours Rendered</p></div>
      <div><p class="text-[#F59E0B] font-bold text-base">${leaveDays}</p><p>Leave Days</p></div>
      <div><p class="text-[#FF6B00] font-bold text-base">${holidayDays}</p><p>Holidays</p></div>
    </div>`;
}

function generateDTR() {
  const month    = parseInt(document.getElementById('dtr-month').value);
  const year     = parseInt(document.getElementById('dtr-year').value);
  const fullName = document.getElementById('dtr-name').value.trim() || 'Intern';
  const data     = getData();
  const settings = data.settings || {};
  const logs     = data.logs || {};

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const monthName   = MONTHS[month - 1];
  const daysInMonth = new Date(year, month, 0).getDate();
  const WEEKDAYS    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // ── Header ──
  doc.setFillColor(15, 31, 61);
  doc.rect(0, 0, 210, 40, 'F');

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('DAILY TIME RECORD', 105, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('InternTrack — Internship Hour Tracker', 105, 22, { align: 'center' });

  // ── Info block ──
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Name:', 14, 50);
  doc.text('Company:', 14, 57);
  doc.text('Month / Year:', 120, 50);
  doc.text('Required Hours:', 120, 57);

  doc.setFont('helvetica', 'normal');
  doc.text(fullName,                          35, 50);
  doc.text(settings.companyName || '—',       35, 57);
  doc.text(`${monthName} ${year}`,            152, 50);
  doc.text(`${settings.requiredHours || '—'} hrs`, 152, 57);

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 61, 196, 61);

  // ── Table ──
  const rows = [];
  let monthTotal = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds      = toDateStr(year, month, d);
    const log     = logs[ds] || {};
    const isPHol  = PH_HOLIDAYS[ds];
    const weekday = WEEKDAYS[new Date(year, month - 1, d).getDay()];
    const isSun   = new Date(year, month - 1, d).getDay() === 0;
    const isSat   = new Date(year, month - 1, d).getDay() === 6;

    let timeIn = '—', timeOut = '—', hrs = '—', remarks = '';

    if (log.isLeave) {
      remarks = 'Leave';
    } else if (log.isHoliday || isPHol) {
      remarks = isPHol || 'Holiday';
    } else if (isSun) {
      remarks = 'Rest Day';
    } else if (log.timeIn) {
      timeIn  = log.timeIn;
      timeOut = log.timeOut || '—';
      hrs     = log.hoursRendered ? `${log.hoursRendered}` : '—';
      if (log.lunchIncluded) remarks = 'w/ lunch';
      monthTotal += log.hoursRendered || 0;
    }

    rows.push([
      d,
      weekday,
      timeIn,
      timeOut,
      hrs,
      remarks,
    ]);
  }

  doc.autoTable({
    head: [['Day', 'Weekday', 'Time In', 'Time Out', 'Hours', 'Remarks']],
    body: rows,
    startY: 65,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, halign: 'center', textColor: [30, 30, 30] },
    headStyles: { fillColor: [255, 107, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 24 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 20 },
      5: { cellWidth: 50, halign: 'left' },
    },
    didParseCell(data) {
      if (data.section === 'head') return;
      const remarks = data.row.raw[5];
      if (data.column.index === 5 || data.column.index === 4 || data.column.index === 1) {
        if (remarks === 'Leave')                               data.cell.styles.fillColor = [254, 243, 199];
        else if (remarks && remarks !== 'w/ lunch' && remarks !== 'Rest Day') data.cell.styles.fillColor = [255, 237, 213];
        else if (remarks === 'Rest Day')                       data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  // ── Totals ──
  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Hours Rendered: ${monthTotal.toFixed(2)} hrs`, 14, finalY);

  // ── Signature lines ──
  const sigY = Math.min(finalY + 20, 265);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('Certified correct:', 14, sigY);
  doc.line(14, sigY + 14, 90, sigY + 14);
  doc.text('Intern Signature / Date', 14, sigY + 19);

  doc.text('Verified by:', 120, sigY);
  doc.line(120, sigY + 14, 196, sigY + 14);
  doc.text('Supervisor Signature / Date', 120, sigY + 19);

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated by InternTrack • ${new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}`, 105, 290, { align: 'center' });

  doc.save(`DTR_${fullName.replace(/\s+/g, '_')}_${monthName}_${year}.pdf`);
  closeDTRModal();
  showToast(`DTR exported for ${monthName} ${year}!`);
}

// Also update mobile nav avatar initial when user is known
function updateMobileNavAvatar() {
  const el = document.getElementById('mnav-avatar');
  if (!el) return;
  if (currentUser?.photoURL) {
    el.innerHTML = `<img src="${currentUser.photoURL}" class="w-full h-full object-cover rounded-full" />`;
  } else {
    el.textContent = getInitials(currentUser?.displayName || currentUser?.email || 'G');
  }
}

// =====================================================
// INIT — Firebase auth guard
// =====================================================
window.addEventListener('DOMContentLoaded', () => {
  // Guest mode: user clicked "Skip login" on the landing page
  const isGuest = sessionStorage.getItem('interntrack_guest') === '1';
  if (isGuest) {
    sessionStorage.removeItem('interntrack_guest');
    STORE_KEY = 'interntrack_data_guest';
    initApp();
    return;
  }

  if (FIREBASE_CONFIGURED) {
    // Wait for Firebase to resolve auth state before showing app
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        currentUser = user;
        STORE_KEY   = `interntrack_data_${user.uid}`;
      } else {
        // Not logged in and not a guest — redirect to landing page
        window.location.href = 'index.html';
        return;
      }
      initApp();
    });
  } else {
    // Firebase not configured — run in local-only mode, no auth required
    STORE_KEY = 'interntrack_data';
    initApp();
  }
});
