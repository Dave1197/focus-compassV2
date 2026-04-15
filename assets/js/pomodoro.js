/* assets/js/pomodoro.js */
/* ═══════════════════════════════════════════════════════════
   FOCUS COMPASS — Pomodoro Timer Engine
   
   Phases:  work (30m) → break (5m) → [×4] → longBreak (25m)
   Goal:    7 hours/day = 14 pomodoros
   
   Key design: uses Date.now() deltas, NOT interval counting.
   Timer survives page refresh, tab switch, phone lock screen.
   Depends on: storage.js (must load first)
   ═══════════════════════════════════════════════════════════ */

const Pomodoro = (() => {

  // ── Constants ───────────────────────────────────────────
  const PHASES = {
    work:      'work',
    break:     'break',
    longBreak: 'longBreak',
    idle:      'idle'
  };

  const PHASE_LABELS = {
    work:      'Focus Time',
    break:     'Short Break',
    longBreak: 'Long Break',
    idle:      'Ready'
  };

  // SVG ring circumference: 2π × r (r = 110)
  const RING_CIRCUMFERENCE = 2 * Math.PI * 110; // ≈ 691.15

  // ── State ────────────────────────────────────────────────
  let _ticker        = null;   // setInterval handle
  let _phase         = PHASES.idle;
  let _startTime     = null;   // Date.now() when current phase began
  let _pausedAt      = null;   // Date.now() when paused (null = running)
  let _pausedElapsed = 0;      // ms accumulated before current pause
  let _sessionCount  = 0;      // pomodoros completed this session (for long break logic)
  let _isRunning     = false;

  // ── DOM refs ─────────────────────────────────────────────
  let _ringProgress  = null;
  let _timeDisplay   = null;
  let _sessionLabel  = null;
  let _phaseLabel    = null;
  let _dotsWrap      = null;
  let _btnMain       = null;
  let _btnSkip       = null;
  let _btnReset      = null;
  let _statPomodoros = null;
  let _statHours     = null;
  let _statGoalPct   = null;
  let _goalFill      = null;
  let _goalHeader    = null;

  // ── Initialise ───────────────────────────────────────────
  function init() {
    _ringProgress  = document.getElementById('pomo-ring-progress');
    _timeDisplay   = document.getElementById('pomo-time-display');
    _sessionLabel  = document.getElementById('pomo-session-count');
    _phaseLabel    = document.getElementById('pomo-phase-label');
    _dotsWrap      = document.getElementById('pomo-dots');
    _btnMain       = document.getElementById('btn-pomo-main');
    _btnSkip       = document.getElementById('btn-pomo-skip');
    _btnReset      = document.getElementById('btn-pomo-reset');
    _statPomodoros = document.getElementById('pomo-stat-pomodoros');
    _statHours     = document.getElementById('pomo-stat-hours');
    _statGoalPct   = document.getElementById('pomo-stat-goal-pct');
    _goalFill      = document.getElementById('pomo-goal-fill');
    _goalHeader    = document.getElementById('pomo-goal-header-val');

    _bindControls();
    _restoreState();   // resume if timer was running before page close
    _renderStats();
    _requestNotificationPermission();
  }

  // ── Restore persisted timer state ────────────────────────
  function _restoreState() {
    const saved = Storage.getPomodoroState();

    if (!saved || saved.phase === PHASES.idle) {
      _setIdle();
      return;
    }

    // Restore internal state
    _phase         = saved.phase;
    _startTime     = saved.startTime;
    _pausedAt      = saved.pausedAt;
    _pausedElapsed = saved.pausedElapsed || 0;
    _sessionCount  = saved.pomodorosThisSession || 0;

    if (_pausedAt) {
      // Was paused — just render the frozen frame
      _isRunning = false;
      const elapsed = _pausedElapsed + (_pausedAt - _startTime);
      _renderFrame(elapsed);
      _renderPhaseUI();
      _setMainBtnState('paused');
    } else {
      // Was running — resume
      _isRunning = true;
      _startTicker();
      _renderPhaseUI();
      _setMainBtnState('running');
    }

    _renderDots();
  }

  // ── Bind control buttons ─────────────────────────────────
  function _bindControls() {

    // Play / Pause main button
    _btnMain?.addEventListener('click', () => {
      if (!_isRunning && _phase === PHASES.idle) {
        _startPhase(PHASES.work);
      } else if (_isRunning) {
        _pause();
      } else {
        _resume();
      }
    });

    // Skip to next phase
    _btnSkip?.addEventListener('click', () => {
      if (_phase === PHASES.idle) return;
      UI.confirm({
        title:   'Skip this phase?',
        message: _phase === PHASES.work
          ? 'Skipping work phase — pomodoro won\'t be counted.'
          : 'Skip to next focus session?',
        confirm: 'Skip',
        danger:  false,
        onConfirm() {
          _phase === PHASES.work
            ? _advancePhase(false)   // skip work → don't count
            : _advancePhase(true);   // skip break → fine
        }
      });
    });

    // Reset timer
    _btnReset?.addEventListener('click', () => {
      if (_phase === PHASES.idle) return;
      UI.confirm({
        title:   'Reset timer?',
        message: 'Current session progress will be cleared.',
        confirm: 'Reset',
        danger:  true,
        onConfirm: _fullReset
      });
    });
  }

  // ── Start a phase ────────────────────────────────────────
  function _startPhase(phase) {
    _phase         = phase;
    _startTime     = Date.now();
    _pausedAt      = null;
    _pausedElapsed = 0;
    _isRunning     = true;

    _saveState();
    _renderPhaseUI();
    _setMainBtnState('running');
    _startTicker();
    _renderDots();

    if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
  }

  // ── Pause ────────────────────────────────────────────────
  function _pause() {
    if (!_isRunning) return;
    _pausedAt  = Date.now();
    _isRunning = false;

    clearInterval(_ticker);
    _ticker = null;

    _saveState();
    _setMainBtnState('paused');
  }

  // ── Resume ───────────────────────────────────────────────
  function _resume() {
    if (_isRunning || !_pausedAt) return;

    // Absorb the pause duration into pausedElapsed
    _pausedElapsed += (_pausedAt - _startTime);
    _startTime  = Date.now();
    _pausedAt   = null;
    _isRunning  = true;

    _saveState();
    _setMainBtnState('running');
    _startTicker();
  }

  // ── Ticker — runs every 500ms ────────────────────────────
  function _startTicker() {
    clearInterval(_ticker);
    _ticker = setInterval(_tick, 1000);
    _tick(); // immediate first frame
  }

  function _tick() {
    if (!_isRunning) return;

    const elapsed    = _pausedElapsed + (Date.now() - _startTime);
    const totalMs    = _getPhaseDurationMs(_phase);
    const remaining  = Math.max(0, totalMs - elapsed);

    _renderFrame(elapsed);

    if (remaining <= 0) {
      _onPhaseComplete();
    }
  }

  // ── Render one timer frame ───────────────────────────────
  function _renderFrame(elapsedMs) {
    const totalMs   = _getPhaseDurationMs(_phase);
    const remaining = Math.max(0, totalMs - elapsedMs);
    const progress  = Math.min(1, elapsedMs / totalMs); // 0 → 1

    // Time display
    if (_timeDisplay) {
      _timeDisplay.textContent = _formatTime(remaining);

    }

    // SVG ring — dashoffset goes from CIRCUMFERENCE (empty) → 0 (full)
    if (_ringProgress) {
      const offset = RING_CIRCUMFERENCE * (1 - progress);
      _ringProgress.style.strokeDashoffset = offset.toFixed(2);

      // Update stroke color per phase
      const colorMap = {
        [PHASES.work]:      'var(--color-phase-work)',
        [PHASES.break]:     'var(--color-phase-break)',
        [PHASES.longBreak]: 'var(--color-phase-longbreak)',
        [PHASES.idle]:      'var(--color-phase-work)'
      };
      _ringProgress.style.stroke = colorMap[_phase] || colorMap[PHASES.work];
    }

    // Goal fill pulse
    if (_goalFill && _phase === PHASES.work) {
      _goalFill.classList.add('active');
    }
  }

  // ── Phase complete ───────────────────────────────────────
  function _onPhaseComplete() {
    clearInterval(_ticker);
    _ticker    = null;
    _isRunning = false;

    if (_phase === PHASES.work) {
      // Count the completed pomodoro
      const total = Storage.completedPomodoro();
      _sessionCount++;

      _sendNotification('Pomodoro complete! 🎯', 'Time for a break. Well done.');
      if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 100]);

      _renderStats();
      _renderDots();

      // Decide: short break or long break
      const settings = Storage.getPomodoroSettings();
      const nextPhase = (_sessionCount % settings.longBreakAfter === 0)
        ? PHASES.longBreak
        : PHASES.break;

      UI.toast(
        nextPhase === PHASES.longBreak
          ? `🏆 ${_sessionCount} pomodoros! Time for a long break.`
          : `✅ Pomodoro ${total} done! Take a short break.`,
        'success'
      );

      _advancePhase(true, nextPhase);

    } else {
      // Break complete — go back to work
      _sendNotification('Break over 💪', 'Ready for the next focus session?');
      if (navigator.vibrate) navigator.vibrate([30, 20, 80]);

      UI.toast('Break done — back to work!', 'warning');
      _advancePhase(true, PHASES.work);
    }
  }

  // ── Advance to next phase ────────────────────────────────
  // counted = whether to count this as a completed pomodoro
  // targetPhase = explicit next phase (optional)
  function _advancePhase(counted, targetPhase) {
    const settings = Storage.getPomodoroSettings();

    let next;
    if (targetPhase) {
      next = targetPhase;
    } else if (_phase === PHASES.work) {
      next = (_sessionCount % settings.longBreakAfter === 0)
        ? PHASES.longBreak
        : PHASES.break;
    } else {
      next = PHASES.work;
    }

    // Auto-start next phase after a brief pause
    setTimeout(() => _startPhase(next), 1200);
  }

  // ── Full reset ───────────────────────────────────────────
  function _fullReset() {
    clearInterval(_ticker);
    _ticker        = null;
    _sessionCount  = 0;
    _setIdle();
    UI.toast('Timer reset', 'warning');
  }

  function _setIdle() {
    _phase         = PHASES.idle;
    _startTime     = null;
    _pausedAt      = null;
    _pausedElapsed = 0;
    _isRunning     = false;

    Storage.setPomodoroState({ phase: PHASES.idle });

    _renderPhaseUI();
    _setMainBtnState('idle');
    _renderDots();

    // Reset ring
    if (_ringProgress) {
      _ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE.toFixed(2);
    }

    // Reset display
    if (_timeDisplay) {
      const settings = Storage.getPomodoroSettings();
      _timeDisplay.textContent = _formatTime(settings.workMin * 60 * 1000);
    }

    _goalFill?.classList.remove('active');
  }

  // ── Render phase label + ring color ─────────────────────
  function _renderPhaseUI() {
    if (_phaseLabel) {
      _phaseLabel.textContent         = PHASE_LABELS[_phase] || 'Ready';
      _phaseLabel.dataset.phase       = _phase;
    }
    if (_sessionLabel) {
      _sessionLabel.textContent =
        _sessionCount > 0
          ? `Session ${_sessionCount + 1}`
          : 'Start your first session';
    }
  }

  // ── Render progress dots (4 dots = one cycle) ───────────
  function _renderDots() {
    if (!_dotsWrap) return;

    const settings    = Storage.getPomodoroSettings();
    const cycleSize   = settings.longBreakAfter; // default 4
    const doneInCycle = _sessionCount % cycleSize;

    let html = '';
    for (let i = 0; i < cycleSize; i++) {
      if (i < doneInCycle) {
        html += '<div class="pomo-dot done" aria-hidden="true"></div>';
      } else if (i === doneInCycle && _phase === PHASES.work && _isRunning) {
        html += '<div class="pomo-dot current" aria-hidden="true"></div>';
      } else {
        html += '<div class="pomo-dot" aria-hidden="true"></div>';
      }
    }
    _dotsWrap.innerHTML = html;
  }

  // ── Render stats cards + goal bar ───────────────────────
  function _renderStats() {
    const count      = Storage.getPomodoroCount();
    const goalHours  = Storage.getPomodoroGoal();
    const goalPomos  = goalHours * 2;    // 1 pomo = 30 min → 2/hr
    const hours      = (count * 0.5).toFixed(1);
    const goalPct    = Math.min(100, Math.round((count / goalPomos) * 100));

    if (_statPomodoros) _statPomodoros.textContent = count;
    if (_statHours)     _statHours.textContent     = hours;
    if (_statGoalPct)   _statGoalPct.textContent   = `${goalPct}%`;

    if (_goalFill) {
      _goalFill.style.width = `${goalPct}%`;
    }

    if (_goalHeader) {
      _goalHeader.textContent =
        `${hours}h / ${goalHours}h (${count} pomodoros)`;
    }
  }

  // ── Main button state ────────────────────────────────────
  function _setMainBtnState(state) {
    if (!_btnMain) return;

    const icons = {
      idle: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
               <polygon points="5,3 19,12 5,21"/>
             </svg>`,
      running: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>`,
      paused: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                 <polygon points="5,3 19,12 5,21"/>
               </svg>`
    };

    _btnMain.innerHTML  = icons[state] || icons.idle;
    _btnMain.setAttribute('aria-label',
      state === 'running' ? 'Pause timer' : 'Start timer'
    );
  }

  // ── Save current state to Storage ───────────────────────
  function _saveState() {
    Storage.setPomodoroState({
      phase:                _phase,
      startTime:            _startTime,
      pausedAt:             _pausedAt,
      pausedElapsed:        _pausedElapsed,
      pomodorosThisSession: _sessionCount
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  // Duration in ms for each phase
  function _getPhaseDurationMs(phase) {
    const s = Storage.getPomodoroSettings();
    const map = {
      [PHASES.work]:      s.workMin      * 60 * 1000,
      [PHASES.break]:     s.breakMin     * 60 * 1000,
      [PHASES.longBreak]: s.longBreakMin * 60 * 1000,
      [PHASES.idle]:      s.workMin      * 60 * 1000
    };
    return map[phase] || map[PHASES.work];
  }

  // Format ms → "MM:SS"
  function _formatTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ── Notification helpers ─────────────────────────────────
  function _requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      // Don't ask immediately — ask on first pomodoro start
    }
  }

  function _sendNotification(title, body) {
    // Request permission lazily on first trigger
    if (!('Notification' in window)) return;

    const send = () => {
      if (Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: './assets/images/logo.svg',
            badge: './assets/images/logo.svg',
            tag: 'focus-compass-pomo',
            renotify: true,
            silent: false
          });
        } catch (e) { /* ServiceWorker required on some platforms */ }
      }
    };

    if (Notification.permission === 'default') {
      Notification.requestPermission().then(send);
    } else {
      send();
    }
  }

  // ── Public: called when view becomes visible ─────────────
  // Re-renders everything to catch up if tab was backgrounded
  function onViewEnter() {
    if (_isRunning) {
      _tick();         // sync immediately
    }
    _renderStats();
    _renderDots();
  }

  // ── Public: get summary for Review view ─────────────────
  function getTodaySummary() {
    const count     = Storage.getPomodoroCount();
    const goalHours = Storage.getPomodoroGoal();
    const goalPomos = goalHours * 2;
    return {
      pomodoros:  count,
      hoursWorked: parseFloat((count * 0.5).toFixed(1)),
      goalHours,
      goalPomos,
      goalPct: Math.min(100, Math.round((count / goalPomos) * 100))
    };
  }

  // ── Public API ───────────────────────────────────────────
  return {
    init,
    onViewEnter,
    getTodaySummary,
    renderStats: _renderStats   // callable after manual storage changes
  };

})();