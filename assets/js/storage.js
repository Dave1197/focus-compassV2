// assets/js/storage.js
// ─────────────────────────────────────────────────────────────
// Focus Compass — Storage Module
// Single source of truth. All data lives here.
// No other file should call localStorage directly.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'focusCompass_v1';

const DEFAULT_STATE = {
  settings: {
    theme: 'dark',
    habits: [
      'Morning pages',
      'Exercise',
      'Read 30 min',
      'No phone first hour',
      'Cold shower'
    ],
    avoiding: '',
    quotes: '',
    pomodoroGoalHours: 7,
    workMin: 30,
    breakMin: 5,
    longBreakMin: 25,
    longBreakAfter: 4
  },
  today: {
    date: null,           // 'YYYY-MM-DD' — set on first use
    habits: {},           // { habitName: true|false }
    pomodoros: 0,         // completed count today
    timerState: null,     // active timer snapshot (see setPomodoroState)
    feel: 0,              // 1–5, 0 = not set
    fear: 0               // 1–5, 0 = not set
  },
  history: []             // archived day records, max 365
};

// ─────────────────────────────────────────────────────────────
// Storage API
// ─────────────────────────────────────────────────────────────
const Storage = {

  _data: null,

  // ── Bootstrap ────────────────────────────────────────────

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this._data = raw
        ? JSON.parse(raw)
        : this._deepClone(DEFAULT_STATE);
    } catch (e) {
      console.warn('[Storage] Corrupt data, resetting.', e);
      this._data = this._deepClone(DEFAULT_STATE);
    }
    this._migrateLegacy();   // future-proof: handle old schema versions
    this._checkDailyReset(); // auto-archive yesterday if new day
    this.save();
    return this;
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      console.error('[Storage] Save failed — localStorage full?', e);
    }
    return this;
  },

  // ── Daily Reset Logic ─────────────────────────────────────

  _checkDailyReset() {
    const today = this._todayStr();
    const stored = this._data.today?.date;

    if (!stored) {
      // First ever launch
      this._initToday(today);
    } else if (stored !== today) {
      // New day — archive yesterday, reset today
      this._archiveDay(stored);
      this._initToday(today);
    }
    // Same day — do nothing, preserve all progress
  },

  _archiveDay(date) {
    const t = this._data.today;
    const record = {
      date,
      habits:      { ...t.habits },
      pomodoros:   t.pomodoros || 0,
      hoursWorked: Math.round(((t.pomodoros || 0) * 30 / 60) * 100) / 100,
      feel:        t.feel || 0,
      fear:        t.fear || 0,
      avoiding:    this._data.settings.avoiding || '',
      quotes:      this._data.settings.quotes   || ''
    };
    this._data.history.push(record);
    // Cap at 365 days
    if (this._data.history.length > 365) {
      this._data.history = this._data.history.slice(-365);
    }
  },

  _initToday(date) {
    const freshHabits = {};
    (this._data.settings.habits || []).forEach(h => {
      freshHabits[h] = false;
    });
    this._data.today = {
      date,
      habits:      freshHabits,
      pomodoros:   0,
      timerState:  null,
      feel:        0,
      fear:        0
    };
  },

  // ── Getters ───────────────────────────────────────────────

  getTheme()            { return this._data.settings.theme || 'dark'; },
  getSettings()         { return this._data.settings; },
  getToday()            { return this._data.today; },
  getHistory()          { return this._data.history; },

  getHabitsList()       { return this._data.settings.habits || []; },
  getTodayHabits()      { return this._data.today.habits || {}; },
  getAvoiding()         { return this._data.settings.avoiding || ''; },
  getQuotes()           { return this._data.settings.quotes || ''; },

  getPomodoroCount()    { return this._data.today.pomodoros || 0; },
  getPomodoroState()    { return this._data.today.timerState || null; },
  getPomodoroGoal()     { return this._data.settings.pomodoroGoalHours || 7; },
  getPomodoroSettings() {
    const s = this._data.settings;
    return {
      workMin:        s.workMin        || 30,
      breakMin:       s.breakMin       || 5,
      longBreakMin:   s.longBreakMin   || 25,
      longBreakAfter: s.longBreakAfter || 4
    };
  },

  getFeel()             { return this._data.today.feel || 0; },
  getFear()             { return this._data.today.fear || 0; },

  // ── Setters ───────────────────────────────────────────────

  setTheme(theme) {
    this._data.settings.theme = theme;
    return this.save();
  },

  setAvoiding(text) {
    this._data.settings.avoiding = String(text).trim();
    return this.save();
  },

  setQuotes(text) {
    this._data.settings.quotes = String(text).trim();
    return this.save();
  },

  // ── Habits List (persistent — never auto-reset) ───────────

  addHabit(name) {
    const n = String(name).trim();
    if (!n) return { ok: false, error: 'Name is empty' };
    if (this._data.settings.habits.includes(n))
      return { ok: false, error: 'Already exists' };

    this._data.settings.habits.push(n);
    this._data.today.habits[n] = false; // add to today unchecked
    this.save();
    return { ok: true };
  },

  removeHabit(name) {
    this._data.settings.habits =
      this._data.settings.habits.filter(h => h !== name);
    delete this._data.today.habits[name];
    return this.save();
  },

  editHabit(oldName, newName) {
    const n = String(newName).trim();
    if (!n || this._data.settings.habits.includes(n)) return false;

    const idx = this._data.settings.habits.indexOf(oldName);
    if (idx === -1) return false;

    this._data.settings.habits[idx] = n;
    // Preserve checkbox state under new name
    this._data.today.habits[n] = this._data.today.habits[oldName] || false;
    delete this._data.today.habits[oldName];
    this.save();
    return true;
  },

  reorderHabits(orderedArray) {
    this._data.settings.habits = orderedArray;
    return this.save();
  },

  // ── Daily Habit Checkboxes ────────────────────────────────

  toggleHabit(name) {
    if (!this._data.today.habits.hasOwnProperty(name)) return null;
    this._data.today.habits[name] = !this._data.today.habits[name];
    this.save();
    return this._data.today.habits[name]; // returns new state
  },

  // Reset button — clears today's checkboxes only
  resetTodayHabits() {
    Object.keys(this._data.today.habits).forEach(k => {
      this._data.today.habits[k] = false;
    });
    return this.save();
  },

  // ── Pomodoro ──────────────────────────────────────────────

  // timerState shape:
  // {
  //   phase: 'work' | 'break' | 'longBreak' | 'idle',
  //   startTime: timestamp (ms),      // when current phase began
  //   pausedAt: timestamp | null,     // if paused
  //   pausedElapsed: number,          // ms already elapsed before pause
  //   pomodorosThisSession: number    // resets each long break
  // }

  setPomodoroState(state) {
    this._data.today.timerState = state;
    return this.save();
  },

  completedPomodoro() {
    this._data.today.pomodoros = (this._data.today.pomodoros || 0) + 1;
    this.save();
    return this._data.today.pomodoros;
  },

  resetPomodoros() {
    this._data.today.pomodoros = 0;
    this._data.today.timerState = null;
    return this.save();
  },

  // ── Feel & Fear ───────────────────────────────────────────

  setFeel(value) {
    const v = Math.max(1, Math.min(5, parseInt(value, 10)));
    this._data.today.feel = v;
    return this.save();
  },

  setFear(value) {
    const v = Math.max(1, Math.min(5, parseInt(value, 10)));
    this._data.today.fear = v;
    return this.save();
  },

  // ── Dashboard / History Queries ───────────────────────────

  // Returns history records for last N days
  getHistoryRange(days) {
    if (!days) return this._data.history;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return this._data.history.filter(r => r.date >= cutoffStr);
  },

  // Per-habit check rate across a date range
  getHabitStats(days) {
    const records = this.getHistoryRange(days);
    const stats   = {};

    this._data.settings.habits.forEach(h => {
      stats[h] = { checked: 0, total: 0, rate: 0 };
    });

    records.forEach(record => {
      Object.entries(record.habits || {}).forEach(([h, done]) => {
        if (!stats[h]) stats[h] = { checked: 0, total: 0, rate: 0 };
        stats[h].total++;
        if (done) stats[h].checked++;
      });
    });

    // Compute completion rate
    Object.keys(stats).forEach(h => {
      const s = stats[h];
      s.rate = s.total > 0 ? Math.round((s.checked / s.total) * 100) : 0;
    });

    return stats;
  },

  // Daily pomodoro + hours series for charting
  getPomodoroSeries(days) {
    return this.getHistoryRange(days).map(r => ({
      date:       r.date,
      pomodoros:  r.pomodoros,
      hours:      r.hoursWorked
    }));
  },

  // Feel + Fear series for charting
  getMoodSeries(days) {
    return this.getHistoryRange(days)
      .filter(r => r.feel > 0 || r.fear > 0)
      .map(r => ({
        date: r.date,
        feel: r.feel,
        fear: r.fear
      }));
  },

  // ── Data Portability ──────────────────────────────────────

  exportJSON() {
    return JSON.stringify(this._data, null, 2);
  },

  importJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      // Basic schema guard
      if (!parsed.settings || !parsed.today || !Array.isArray(parsed.history))
        return { ok: false, error: 'Invalid data format' };
      this._data = parsed;
      this.save();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  nukeAll() {
    localStorage.removeItem(STORAGE_KEY);
    this._data = this._deepClone(DEFAULT_STATE);
    this.save();
  },

  // ── Internal Utilities ────────────────────────────────────

  _todayStr() {
    return new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  },

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Placeholder for future schema migrations
  _migrateLegacy() {
    // v1: nothing to migrate yet
    // Example for future: if (!this._data.settings.workMin) this._data.settings.workMin = 30;
  }

};

// Auto-load on script parse
Storage.load();