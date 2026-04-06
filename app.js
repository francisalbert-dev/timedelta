const STORAGE_KEY = "delta-activity-timer-v1";
const EXPORT_VERSION = 1;

const defaultState = {
  activities: [
    { id: crypto.randomUUID(), name: "Exercise", type: "good" },
    { id: crypto.randomUUID(), name: "Reading", type: "good" },
    { id: crypto.randomUUID(), name: "Doomscrolling", type: "bad" },
    { id: crypto.randomUUID(), name: "Gaming", type: "bad" }
  ],
  logs: [],
  activeTimer: null
};

let state = loadState();
let tickHandle = null;
let deferredInstallPrompt = null;

const goodActivitiesEl = document.querySelector("#good-activities");
const badActivitiesEl = document.querySelector("#bad-activities");
const mainGoodTimersEl = document.querySelector("#main-good-timers");
const mainBadTimersEl = document.querySelector("#main-bad-timers");
const activityTemplate = document.querySelector("#activity-template");
const timerTemplate = document.querySelector("#timer-template");
const logTemplate = document.querySelector("#log-template");
const dashboardTemplate = document.querySelector("#dashboard-template");
const historyTemplate = document.querySelector("#history-template");
const trendTemplate = document.querySelector("#trend-template");
const manualActivityEl = document.querySelector("#manual-activity");
const logListEl = document.querySelector("#log-list");
const dashboardGridEl = document.querySelector("#dashboard-grid");
const historyGridEl = document.querySelector("#history-grid");
const trendGridEl = document.querySelector("#trend-grid");
const goodTotalEl = document.querySelector("#good-total");
const badTotalEl = document.querySelector("#bad-total");
const deltaTotalEl = document.querySelector("#delta-total");
const deltaHintEl = document.querySelector("#delta-hint");
const mainDeltaTotalEl = document.querySelector("#main-delta-total");
const mainDeltaHintEl = document.querySelector("#main-delta-hint");
const activeTitleEl = document.querySelector("#active-title");
const activeMetaEl = document.querySelector("#active-meta");
const activeClockEl = document.querySelector("#active-clock");
const addActivityForm = document.querySelector("#add-activity-form");
const manualLogForm = document.querySelector("#manual-log-form");
const clearLogsButton = document.querySelector("#clear-logs");
const manualStartInput = document.querySelector("#manual-start");
const manualSubmitButton = manualLogForm.querySelector('button[type="submit"]');
const installButton = document.querySelector("#install-button");
const installMessage = document.querySelector("#install-message");
const exportButton = document.querySelector("#export-button");
const importFileInput = document.querySelector("#import-file");
const transferMessage = document.querySelector("#transfer-message");
const tabButtons = [...document.querySelectorAll(".tab-button")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];

manualStartInput.value = toDateTimeLocal(new Date());

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.tabTarget;
    tabButtons.forEach((item) => item.classList.toggle("active", item === button));
    tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.tabPanel === target));
  });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      installMessage.textContent = "This app still works in the browser, but offline install support could not be enabled here.";
    }
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
  installMessage.textContent = "This browser can install the app. Tap the button to add it to your home screen.";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
  installMessage.textContent = "Installed. You can now open it from your home screen like an app.";
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

exportButton.addEventListener("click", () => {
  const payload = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `delta-timer-backup-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
  transferMessage.textContent = "Backup exported. Move that JSON file to another device and import it there.";
});

importFileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    state = sanitizeState(parsed?.state ?? parsed);
    saveState();
    render();
    transferMessage.textContent = "Import complete. Your activities and logs were loaded from the backup file.";
  } catch {
    transferMessage.textContent = "Import failed. Please choose a valid backup JSON file from this app.";
  } finally {
    importFileInput.value = "";
  }
});

addActivityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(addActivityForm);
  const name = String(formData.get("name")).trim();
  const type = String(formData.get("type"));

  if (!name) {
    return;
  }

  state.activities.push({
    id: crypto.randomUUID(),
    name,
    type: type === "bad" ? "bad" : "good"
  });

  addActivityForm.reset();
  document.querySelector("#new-activity-type").value = "good";
  persistAndRender();
});

manualLogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(manualLogForm);
  const activityId = String(formData.get("activityId"));
  const start = new Date(String(formData.get("start")));
  const durationMinutes = Number(formData.get("duration"));
  const activity = state.activities.find((item) => item.id === activityId);

  if (!activity || Number.isNaN(start.getTime()) || durationMinutes <= 0) {
    return;
  }

  const end = new Date(start.getTime() + durationMinutes * 60_000);

  state.logs.unshift({
    id: crypto.randomUUID(),
    activityId: activity.id,
    activityName: activity.name,
    type: activity.type,
    start: start.toISOString(),
    end: end.toISOString(),
    source: "manual"
  });

  manualLogForm.reset();
  manualStartInput.value = toDateTimeLocal(new Date());
  document.querySelector("#manual-duration").value = "30";
  persistAndRender();
});

clearLogsButton.addEventListener("click", () => {
  if (!window.confirm("Remove all saved logs?")) {
    return;
  }

  state.logs = [];
  persistAndRender();
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultState);
    }

    return sanitizeState(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function sanitizeState(value) {
  const activities = Array.isArray(value?.activities)
    ? value.activities
        .filter((item) => item && typeof item.name === "string")
        .map((item) => ({
          id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
          name: item.name.trim() || "Activity",
          type: item.type === "bad" ? "bad" : "good"
        }))
    : structuredClone(defaultState.activities);

  const activityIds = new Set(activities.map((item) => item.id));

  const logs = Array.isArray(value?.logs)
    ? value.logs
        .filter((log) => log && typeof log.start === "string" && typeof log.end === "string")
        .map((log) => ({
          id: typeof log.id === "string" && log.id ? log.id : crypto.randomUUID(),
          activityId: typeof log.activityId === "string" ? log.activityId : "",
          activityName: typeof log.activityName === "string" ? log.activityName : "Activity",
          type: log.type === "bad" ? "bad" : "good",
          start: new Date(log.start).toISOString(),
          end: new Date(log.end).toISOString(),
          source: log.source === "timer" ? "timer" : "manual"
        }))
        .filter((log) => activityIds.has(log.activityId) && new Date(log.end).getTime() > new Date(log.start).getTime())
    : [];

  const activeTimer = value?.activeTimer && typeof value.activeTimer.activityId === "string" && typeof value.activeTimer.startedAt === "string"
    ? {
        activityId: value.activeTimer.activityId,
        startedAt: value.activeTimer.startedAt
      }
    : null;

  return {
    activities: activities.length ? activities : structuredClone(defaultState.activities),
    logs,
    activeTimer: activeTimer && activityIds.has(activeTimer.activityId) ? activeTimer : null
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistAndRender() {
  saveState();
  render();
}

function render() {
  renderMainTimers();
  renderActivities();
  renderManualOptions();
  renderLogs();
  renderSummary();
  renderDashboard();
  renderHistory();
  renderTrends();
  renderActiveTimer();
}

function renderActivities() {
  goodActivitiesEl.innerHTML = "";
  badActivitiesEl.innerHTML = "";

  const goodActivities = state.activities.filter((activity) => activity.type === "good");
  const badActivities = state.activities.filter((activity) => activity.type === "bad");

  renderActivityGroup(goodActivitiesEl, goodActivities, "No good activities yet.");
  renderActivityGroup(badActivitiesEl, badActivities, "No bad activities yet.");
}

function renderMainTimers() {
  mainGoodTimersEl.innerHTML = "";
  mainBadTimersEl.innerHTML = "";

  renderTimerGroup(
    mainGoodTimersEl,
    state.activities.filter((activity) => activity.type === "good"),
    "No good timers yet. Add one in Manage."
  );
  renderTimerGroup(
    mainBadTimersEl,
    state.activities.filter((activity) => activity.type === "bad"),
    "No bad timers yet. Add one in Manage."
  );
}

function renderTimerGroup(container, activities, emptyMessage) {
  if (!activities.length) {
    container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  activities.forEach((activity) => {
    const fragment = timerTemplate.content.cloneNode(true);
    const typeEl = fragment.querySelector(".timer-type");
    const nameEl = fragment.querySelector(".timer-name");
    const toggleButton = fragment.querySelector(".timer-toggle");
    const isActive = state.activeTimer?.activityId === activity.id;

    typeEl.textContent = capitalize(activity.type);
    nameEl.textContent = activity.name;
    toggleButton.textContent = isActive ? "Off" : "On";
    toggleButton.classList.add(activity.type, isActive ? "active" : "idle");
    toggleButton.addEventListener("click", () => toggleTimer(activity.id));

    container.append(fragment);
  });
}

function renderActivityGroup(container, activities, emptyMessage) {
  if (!activities.length) {
    container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  activities.forEach((activity) => {
    const fragment = activityTemplate.content.cloneNode(true);
    const nameInput = fragment.querySelector(".activity-name-input");
    const typeSelect = fragment.querySelector(".activity-type-select");
    const toggleButton = fragment.querySelector(".toggle-button");
    const deleteButton = fragment.querySelector(".delete-button");
    const isActive = state.activeTimer?.activityId === activity.id;

    nameInput.value = activity.name;
    typeSelect.value = activity.type;
    toggleButton.textContent = isActive ? "Off" : "On";
    toggleButton.classList.add(activity.type);
    toggleButton.classList.toggle("active", isActive);

    nameInput.addEventListener("change", () => {
      activity.name = nameInput.value.trim() || activity.name;
      updateLogSnapshots(activity.id, activity.name, activity.type);
      persistAndRender();
    });

    typeSelect.addEventListener("change", () => {
      activity.type = typeSelect.value === "bad" ? "bad" : "good";
      updateLogSnapshots(activity.id, activity.name, activity.type);
      persistAndRender();
    });

    toggleButton.addEventListener("click", () => {
      toggleTimer(activity.id);
    });

    deleteButton.addEventListener("click", () => {
      if (state.activeTimer?.activityId === activity.id) {
        stopTimer();
      }
      state.activities = state.activities.filter((item) => item.id !== activity.id);
      state.logs = state.logs.filter((log) => log.activityId !== activity.id);
      persistAndRender();
    });

    container.append(fragment);
  });
}

function renderManualOptions() {
  manualActivityEl.innerHTML = "";
  manualSubmitButton.disabled = state.activities.length === 0;

  state.activities.forEach((activity) => {
    const option = document.createElement("option");
    option.value = activity.id;
    option.textContent = `${capitalize(activity.type)}: ${activity.name}`;
    manualActivityEl.append(option);
  });

  if (!state.activities.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add an activity first";
    manualActivityEl.append(option);
  }
}

function renderLogs() {
  logListEl.innerHTML = "";

  if (!state.logs.length) {
    logListEl.innerHTML = `<p class="empty-state">No logs yet. Start a timer or add time manually.</p>`;
    return;
  }

  state.logs
    .slice(0, 12)
    .forEach((log) => {
      const fragment = logTemplate.content.cloneNode(true);
      const title = fragment.querySelector(".log-title");
      const meta = fragment.querySelector(".log-meta");
      const duration = fragment.querySelector(".log-duration");
      const removeButton = fragment.querySelector(".delete-log-button");
      const start = new Date(log.start);
      const end = new Date(log.end);
      const durationMs = end.getTime() - start.getTime();

      title.textContent = `${capitalize(log.type)}: ${log.activityName}`;
      meta.textContent = `${formatDate(start)} - ${log.source === "manual" ? "Manual entry" : "Timed session"}`;
      duration.textContent = formatDuration(durationMs);
      removeButton.addEventListener("click", () => {
        state.logs = state.logs.filter((item) => item.id !== log.id);
        persistAndRender();
      });

      fragment.querySelector(".log-item").style.borderLeft = `6px solid ${log.type === "good" ? "var(--good)" : "var(--bad)"}`;
      logListEl.append(fragment);
    });
}

function renderSummary() {
  const totals = calculateTotals();
  const delta = totals.good - totals.bad;

  goodTotalEl.textContent = formatDuration(totals.good);
  badTotalEl.textContent = formatDuration(totals.bad);
  deltaTotalEl.textContent = formatSignedDuration(delta);
  mainDeltaTotalEl.textContent = formatSignedDuration(delta);

  if (delta > 0) {
    deltaHintEl.textContent = "You are ahead on good time.";
    mainDeltaHintEl.textContent = "Good time is ahead.";
  } else if (delta < 0) {
    deltaHintEl.textContent = "Bad time is currently ahead.";
    mainDeltaHintEl.textContent = "Bad time is ahead.";
  } else {
    deltaHintEl.textContent = "Good and bad are balanced.";
    mainDeltaHintEl.textContent = "Good and bad are balanced.";
  }
}

function renderDashboard() {
  dashboardGridEl.innerHTML = "";

  getCurrentDashboardPeriods().forEach((period) => {
    const stats = calculatePeriodStats(period.start, period.end);
    const fragment = dashboardTemplate.content.cloneNode(true);

    fragment.querySelector(".dashboard-label").textContent = period.label;
    fragment.querySelector(".dashboard-title").textContent = period.title;
    fragment.querySelector(".dashboard-range").textContent = period.rangeLabel;
    fragment.querySelector(".dashboard-good").textContent = formatDuration(stats.good);
    fragment.querySelector(".dashboard-bad").textContent = formatDuration(stats.bad);
    fragment.querySelector(".dashboard-delta").textContent = formatSignedDuration(stats.delta);

    const breakdownEl = fragment.querySelector(".dashboard-breakdown");
    renderActivityBreakdown(breakdownEl, stats.activities, "No activity logged in this period yet.");

    dashboardGridEl.append(fragment);
  });
}

function renderHistory() {
  historyGridEl.innerHTML = "";

  getHistoricalPeriods().forEach((period) => {
    const stats = calculatePeriodStats(period.start, period.end);
    const fragment = historyTemplate.content.cloneNode(true);

    fragment.querySelector(".history-group").textContent = period.group;
    fragment.querySelector(".history-title").textContent = period.title;
    fragment.querySelector(".history-range").textContent = period.rangeLabel;
    fragment.querySelector(".history-good").textContent = formatDuration(stats.good);
    fragment.querySelector(".history-bad").textContent = formatDuration(stats.bad);
    fragment.querySelector(".history-delta").textContent = formatSignedDuration(stats.delta);
    historyGridEl.append(fragment);
  });
}

function renderTrends() {
  trendGridEl.innerHTML = "";

  getTrendGroups().forEach((group) => {
    const fragment = trendTemplate.content.cloneNode(true);
    fragment.querySelector(".trend-group").textContent = group.group;
    fragment.querySelector(".trend-title").textContent = group.title;
    const chartEl = fragment.querySelector(".trend-chart");
    const statsByPeriod = group.periods.map((period) => ({
      label: period.label,
      stats: calculatePeriodStats(period.start, period.end)
    }));
    const maxMagnitude = Math.max(1, ...statsByPeriod.map((item) => Math.abs(item.stats.delta)));

    statsByPeriod.forEach((item) => {
      const row = document.createElement("article");
      const width = Math.max(4, Math.round((Math.abs(item.stats.delta) / maxMagnitude) * 100));
      const color = item.stats.delta >= 0 ? "var(--good)" : "var(--bad)";

      row.className = "trend-row";
      row.innerHTML = `
        <div class="trend-meta">
          <p class="trend-label">${escapeHtml(item.label)}</p>
          <p class="trend-value">${formatSignedDuration(item.stats.delta)}</p>
        </div>
        <div class="trend-bar-track">
          <div class="trend-bar-fill" style="width:${width}%; background:${color};"></div>
        </div>
      `;
      chartEl.append(row);
    });

    trendGridEl.append(fragment);
  });
}

function renderActivityBreakdown(container, activities, emptyMessage) {
  if (!activities.length) {
    container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  activities.forEach((activity) => {
    const row = document.createElement("article");
    row.className = "breakdown-row";
    row.innerHTML = `
      <div>
        <p class="breakdown-name">${escapeHtml(activity.name)}</p>
        <p class="breakdown-meta">${capitalize(activity.type)} activity</p>
      </div>
      <p class="breakdown-duration">${formatDuration(activity.durationMs)}</p>
    `;
    row.style.borderLeft = `6px solid ${activity.type === "good" ? "var(--good)" : "var(--bad)"}`;
    container.append(row);
  });
}

function renderActiveTimer() {
  if (!state.activeTimer) {
    activeTitleEl.textContent = "No timer running";
    activeMetaEl.textContent = "Start a timer from one of your activities below.";
    activeClockEl.textContent = "00:00:00";
    stopTicking();
    return;
  }

  const activity = state.activities.find((item) => item.id === state.activeTimer.activityId);
  const startedAt = new Date(state.activeTimer.startedAt);
  const elapsedMs = Date.now() - startedAt.getTime();

  if (!activity) {
    state.activeTimer = null;
    persistAndRender();
    return;
  }

  activeTitleEl.textContent = activity.name;
  activeMetaEl.textContent = `${capitalize(activity.type)} activity - Started ${formatDate(startedAt)}`;
  activeClockEl.textContent = formatClock(elapsedMs);
  startTicking();
}

function calculateTotals() {
  const totals = { good: 0, bad: 0 };

  state.logs.forEach((log) => {
    const start = new Date(log.start);
    const end = new Date(log.end);
    const durationMs = Math.max(0, end.getTime() - start.getTime());

    if (log.type === "bad") {
      totals.bad += durationMs;
    } else {
      totals.good += durationMs;
    }
  });

  if (state.activeTimer) {
    const activity = state.activities.find((item) => item.id === state.activeTimer.activityId);
    if (activity) {
      const elapsedMs = Math.max(0, Date.now() - new Date(state.activeTimer.startedAt).getTime());
      if (activity.type === "bad") {
        totals.bad += elapsedMs;
      } else {
        totals.good += elapsedMs;
      }
    }
  }

  return totals;
}

function calculatePeriodStats(start, end) {
  const stats = {
    good: 0,
    bad: 0,
    delta: 0,
    activities: []
  };
  const activityMap = new Map();

  getSessions().forEach((session) => {
    const overlapMs = getOverlapMs(session.start, session.end, start, end);
    if (overlapMs <= 0) {
      return;
    }

    if (session.type === "bad") {
      stats.bad += overlapMs;
    } else {
      stats.good += overlapMs;
    }

    const current = activityMap.get(session.activityId) ?? {
      name: session.activityName,
      type: session.type,
      durationMs: 0
    };

    current.name = session.activityName;
    current.type = session.type;
    current.durationMs += overlapMs;
    activityMap.set(session.activityId, current);
  });

  stats.delta = stats.good - stats.bad;
  stats.activities = [...activityMap.values()].sort((left, right) => right.durationMs - left.durationMs);
  return stats;
}

function toggleTimer(activityId) {
  if (state.activeTimer?.activityId === activityId) {
    stopTimer();
    return;
  }

  startTimer(activityId);
}

function startTimer(activityId) {
  if (state.activeTimer?.activityId === activityId) {
    return;
  }

  if (state.activeTimer) {
    stopTimer();
  }

  state.activeTimer = {
    activityId,
    startedAt: new Date().toISOString()
  };

  persistAndRender();
}

function getSessions() {
  const sessions = state.logs.map((log) => ({
    activityId: log.activityId,
    activityName: log.activityName,
    type: log.type,
    start: new Date(log.start),
    end: new Date(log.end)
  }));

  if (state.activeTimer) {
    const activity = state.activities.find((item) => item.id === state.activeTimer.activityId);
    if (activity) {
      sessions.push({
        activityId: activity.id,
        activityName: activity.name,
        type: activity.type,
        start: new Date(state.activeTimer.startedAt),
        end: new Date()
      });
    }
  }

  return sessions;
}

function stopTimer() {
  if (!state.activeTimer) {
    return;
  }

  const activity = state.activities.find((item) => item.id === state.activeTimer.activityId);
  const start = new Date(state.activeTimer.startedAt);
  const end = new Date();

  if (activity && end.getTime() > start.getTime()) {
    state.logs.unshift({
      id: crypto.randomUUID(),
      activityId: activity.id,
      activityName: activity.name,
      type: activity.type,
      start: start.toISOString(),
      end: end.toISOString(),
      source: "timer"
    });
  }

  state.activeTimer = null;
  persistAndRender();
}

function updateLogSnapshots(activityId, name, type) {
  state.logs = state.logs.map((log) => {
    if (log.activityId !== activityId) {
      return log;
    }

    return {
      ...log,
      activityName: name,
      type
    };
  });
}

function startTicking() {
  if (tickHandle) {
    return;
  }

  tickHandle = window.setInterval(() => {
    renderMainTimers();
    renderSummary();
    renderDashboard();
    renderHistory();
    renderTrends();
    renderActiveTimer();
  }, 1000);
}

function stopTicking() {
  if (!tickHandle) {
    return;
  }

  window.clearInterval(tickHandle);
  tickHandle = null;
}

function formatDuration(durationMs) {
  const totalMinutes = Math.round(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function formatSignedDuration(durationMs) {
  return `${durationMs >= 0 ? "+" : "-"}${formatDuration(Math.abs(durationMs))}`;
}

function formatClock(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatYear(date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric"
  }).format(date);
}

function toDateTimeLocal(date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCurrentDashboardPeriods() {
  const now = new Date();
  return [
    buildWeekPeriod(now, 0, "Current Week", "This week"),
    buildMonthPeriod(now, 0, "Current Month", "This month"),
    buildYearPeriod(now, 0, "Current Year", "This year")
  ];
}

function getHistoricalPeriods() {
  const now = new Date();
  return [
    buildWeekPeriod(now, 1, "Week History", "Last week"),
    buildWeekPeriod(now, 2, "Week History", "Two weeks ago"),
    buildMonthPeriod(now, 1, "Month History", "Last month"),
    buildMonthPeriod(now, 2, "Month History", "Two months ago"),
    buildYearPeriod(now, 1, "Year History", "Last year")
  ];
}

function getTrendGroups() {
  const now = new Date();
  return [
    {
      group: "Weekly Trend",
      title: "Last 8 weeks",
      periods: Array.from({ length: 8 }, (_, index) => buildWeekPeriod(now, 7 - index, "", ""))
        .map((period, index) => ({ ...period, label: index === 7 ? "This week" : period.rangeLabel }))
    },
    {
      group: "Monthly Trend",
      title: "Last 6 months",
      periods: Array.from({ length: 6 }, (_, index) => buildMonthPeriod(now, 5 - index, "", ""))
        .map((period) => ({ ...period, label: period.rangeLabel }))
    },
    {
      group: "Yearly Trend",
      title: "Last 5 years",
      periods: Array.from({ length: 5 }, (_, index) => buildYearPeriod(now, 4 - index, "", ""))
        .map((period) => ({ ...period, label: period.rangeLabel }))
    }
  ];
}

function buildWeekPeriod(baseDate, offset, label, title) {
  const currentStart = startOfWeek(baseDate);
  const start = addDays(currentStart, -7 * offset);
  const end = addDays(start, 7);
  return {
    group: label,
    label,
    title,
    start,
    end,
    rangeLabel: `${formatShortDate(start)} - ${formatShortDate(addDays(end, -1))}`
  };
}

function buildMonthPeriod(baseDate, offset, label, title) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth() - offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return {
    group: label,
    label,
    title,
    start,
    end,
    rangeLabel: formatMonthYear(start)
  };
}

function buildYearPeriod(baseDate, offset, label, title) {
  const start = new Date(baseDate.getFullYear() - offset, 0, 1);
  const end = new Date(start.getFullYear() + 1, 0, 1);
  return {
    group: label,
    label,
    title,
    start,
    end,
    rangeLabel: formatYear(start)
  };
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getOverlapMs(sessionStart, sessionEnd, rangeStart, rangeEnd) {
  const start = Math.max(sessionStart.getTime(), rangeStart.getTime());
  const end = Math.min(sessionEnd.getTime(), rangeEnd.getTime());
  return Math.max(0, end - start);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

render();
