// =====================================================
// DATA LAYER
// =====================================================
const STORE_KEY = 'interntrack_data';

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
    document.getElementById('ob-company').value.trim() ||
    'Designblue Philippines Inc.';
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

function showView(view) {
  currentView = view;
  ['dashboard', 'calendar', 'settings'].forEach(v => {
    document.getElementById(`view-${v}`).classList.add('hidden');
    document.getElementById(`nav-${v}`)?.classList.remove('active');
  });
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.getElementById(`nav-${view}`)?.classList.add('active');

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
      <div class="card p-6 md:p-8">
        <div class="flex flex-col md:flex-row items-center gap-8">

          <!-- Ring -->
          <div class="relative flex-shrink-0">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="${r}" fill="none" stroke="#1e3a5f" stroke-width="10"/>
              <circle cx="70" cy="70" r="${r}" fill="none" stroke="#FF6B00" stroke-width="10"
                class="progress-ring-fill"
                stroke-dasharray="${C}"
                stroke-dashoffset="${offset}"
                style="transform-origin:center;transform:rotate(-90deg);filter:drop-shadow(0 0 8px #FF6B00)"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-3xl font-black text-white">${pct.toFixed(0)}%</span>
              <span class="text-xs text-[#475569]">complete</span>
            </div>
          </div>

          <!-- Hour stats -->
          <div class="flex-1 w-full grid grid-cols-1 gap-4">
            <div class="grid grid-cols-3 gap-3">
              <div class="card p-4 text-center">
                <p class="text-xs text-[#475569] mb-1">Required</p>
                <p class="text-xl font-bold text-white">${required}<span class="text-xs text-[#475569]"> hrs</span></p>
              </div>
              <div class="card p-4 text-center border-[#22C55E]/30">
                <p class="text-xs text-[#475569] mb-1">Rendered</p>
                <p class="text-xl font-bold text-[#22C55E]">${rendered}<span class="text-xs text-[#475569]"> hrs</span></p>
              </div>
              <div class="card p-4 text-center ${remaining === 0 ? 'border-[#22C55E]/30' : 'border-[#FF6B00]/30'}">
                <p class="text-xs text-[#475569] mb-1">Remaining</p>
                <p class="text-xl font-bold ${remaining === 0 ? 'text-[#22C55E]' : 'text-[#FF6B00]'}">${remaining}<span class="text-xs text-[#475569]"> hrs</span></p>
              </div>
            </div>
            ${remaining === 0 ? `
              <div class="p-3 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/30 text-center text-sm text-[#22C55E] font-semibold">
                Internship hours complete!
              </div>` : ''}
          </div>
        </div>
      </div>

      <!-- Quick stats -->
      <div class="grid grid-cols-3 gap-3">
        <div class="card card-hover p-4 text-center" onclick="showView('calendar')">
          <p class="text-2xl font-bold text-white">${loggedDays}</p>
          <p class="text-xs text-[#475569] mt-1">Days Logged</p>
        </div>
        <div class="card card-hover p-4 text-center" onclick="showView('calendar')">
          <p class="text-2xl font-bold text-[#F59E0B]">${leaveDays}</p>
          <p class="text-xs text-[#475569] mt-1">Days on Leave</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-[#94A3B8]">${avgHours}</p>
          <p class="text-xs text-[#475569] mt-1">Avg Hrs / Day</p>
        </div>
      </div>

      <!-- CTA -->
      <div class="text-center">
        <button class="btn-primary px-8 py-3 text-sm" onclick="showView('calendar')">
          Go to Calendar →
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
        </div>
      </div>

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

            let cls = 'cal-day bg-[#0A1628]';
            if (cell.other)  cls += ' other-month';
            else if (isToday)  cls += ' today';
            else if (isFuture) cls += ' future-day';

            if (!cell.other) {
              if (isLeave)      cls += ' leave-day';
              else if (isHol)   cls += ' holiday-day';
              else if (isLogged) cls += ' logged-day';
            }

            const onClick = cell.other ? '' : `onclick="openDayLog('${ds}')"`;

            return `
              <div class="${cls}" ${onClick}>
                <span class="text-xs font-bold ${isToday ? 'text-[#FF6B00]' : 'text-[#94A3B8]'} leading-none">${cell.day}</span>
                ${isPHol && !cell.other  ? `<span class="badge badge-holiday mt-0.5" style="font-size:8px;padding:1px 4px">${isPHol.split(' ')[0]}</span>` : ''}
                ${isLeave && !cell.other ? `<span class="badge badge-leave mt-0.5" style="font-size:8px;padding:1px 4px">Leave</span>` : ''}
                ${isLogged && !cell.other ? `<span class="text-[#22C55E] mt-auto" style="font-size:9px;font-weight:700">${log.hoursRendered}h</span>` : ''}
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

  el.innerHTML = `
    <div class="max-w-lg mx-auto space-y-5">
      <h2 class="text-xl font-bold text-white">Settings</h2>

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

      <div class="card p-6 space-y-3 border-[#EF4444]/20">
        <h3 class="font-semibold text-[#EF4444] text-sm uppercase tracking-wide">Danger Zone</h3>
        <p class="text-xs text-[#475569]">
          This will permanently delete all your logged data and settings. This action cannot be undone.
        </p>
        <button class="btn-danger w-full py-2.5 text-sm" onclick="confirmReset()">Reset All Data</button>
      </div>

      <div class="card p-5 text-center">
        <p class="text-xs text-[#475569]">InternTrack — Built for Designblue Philippines Inc. interns</p>
        <p class="text-xs text-[#2d4a6e] mt-1">All data stored locally in your browser</p>
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
    showToast('All data cleared', 'warning');
    setTimeout(() => { location.reload(); }, 1000);
  }
}

// =====================================================
// INIT
// =====================================================
window.addEventListener('DOMContentLoaded', () => {
  checkOnboarding();
  showView('dashboard');
});
