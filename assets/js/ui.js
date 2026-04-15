/* assets/js/ui.js */
/* ═══════════════════════════════════════════════════════════
   FOCUS COMPASS — UI Module

   Handles:
   - View switching + bottom nav active state
   - Theme toggle (dark ↔ light) + persistence
   - Toast notification system
   - Bottom sheet (confirm + custom)
   - Confirm dialog (destructive actions)
   - Morning setup auto-save
   - Review screen full render
   - Header date + greeting
   Depends on: storage.js (must load first)
   ═══════════════════════════════════════════════════════════ */

const UI = (() => {

  // ── View registry ─────────────────────────────────────────
  const VIEWS = {
    morning:   'view-morning',
    habits:    'view-habits',
    pomodoro:  'view-pomodoro',
    review:    'view-review',
    dashboard: 'view-dashboard'
  };

  let _currentView   = 'morning';
  let _toastQueue    = [];
  let _sheetStack    = [];   // support nested sheets
  let _autoSaveTimer = null;

  // ── Init ──────────────────────────────────────────────────
  function init() {
    _applyTheme(Storage.getTheme());
    _renderHeaderDate();
    _bindNav();
    _bindThemeToggle();
    _bindMorningButtons();
    _bindDisciplineTabs();
    _ensureToastContainer();
    _navigateTo('morning', false); // silent — no animation on first load
  }

  // ─────────────────────────────────────────────────────────
  // THEME
  // ─────────────────────────────────────────────────────────

  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    _updateThemeIcon(theme);
  }

  function _updateThemeIcon(theme) {
    const btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    );
    btn.innerHTML = theme === 'dark'
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
           <circle cx="12" cy="12" r="5"/>
           <line x1="12" y1="1"  x2="12" y2="3"/>
           <line x1="12" y1="21" x2="12" y2="23"/>
           <line x1="4.22" y1="4.22"  x2="5.64"  y2="5.64"/>
           <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
           <line x1="1"  y1="12" x2="3"  y2="12"/>
           <line x1="21" y1="12" x2="23" y2="12"/>
           <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
           <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
         </svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
           <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
         </svg>`;
  }

  function _bindThemeToggle() {
    const btn = document.getElementById('btn-theme-toggle');
    btn?.addEventListener('click', () => {
      const current = Storage.getTheme();
      const next    = current === 'dark' ? 'light' : 'dark';
      Storage.setTheme(next);
      _applyTheme(next);
      // Re-render charts with new colors
      if (typeof Dashboard !== 'undefined') Dashboard.onThemeChange();
      if (navigator.vibrate) navigator.vibrate(15);
    });
  }

  // ─────────────────────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────────────────────

  function _bindNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (view) _navigateTo(view);
      });
    });
  }

  function _navigateTo(viewKey, animate = true) {
    if (viewKey === _currentView && animate) return;

    // Hide all views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
    });

    // Show target view
    const targetId = VIEWS[viewKey];
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.classList.add('active');
      if (animate) {
        targetEl.style.animation = 'none';
        requestAnimationFrame(() => {
          targetEl.style.animation = '';
        });
      }
    }

    // Update nav active states
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewKey);
    });

    // Update header title
    _updateHeaderTitle(viewKey);

    const prev = _currentView;
    _currentView = viewKey;

    // Lifecycle hooks
    _onViewEnter(viewKey, prev);

    if (navigator.vibrate) navigator.vibrate(8);
  }

  function _onViewEnter(viewKey, prevView) {
    switch (viewKey) {
      case 'morning': {
        const greetEl = document.getElementById('morning-greeting-text');
        if (greetEl) greetEl.textContent = _getGreeting() + '.';
        _updateMorningPreview('preview-avoiding', Storage.getAvoiding());
        _updateMorningPreview('preview-quotes',   Storage.getQuotes());
        break;
      }
      case 'habits':
        if (typeof Habits !== 'undefined') Habits.render();
        break;
      case 'pomodoro':
        if (typeof Pomodoro !== 'undefined') Pomodoro.onViewEnter();
        break;
      case 'review':
        _renderReviewView();
        break;
      case 'dashboard':
        if (typeof Dashboard !== 'undefined') Dashboard.onViewEnter();
        break;
    }
  }

  function _updateHeaderTitle(viewKey) {
    const titles = {
      morning:   'Morning',
      habits:    'Habits',
      pomodoro:  'Focus',
      review:    'Review',
      dashboard: 'Dashboard'
    };
    const el = document.getElementById('header-view-title');
    if (el) el.textContent = titles[viewKey] || 'Focus Compass';
  }

  // ─────────────────────────────────────────────────────────
  // HEADER DATE + GREETING
  // ─────────────────────────────────────────────────────────

  function _renderHeaderDate() {
    const el = document.getElementById('header-date');
    if (!el) return;
    const now  = new Date();
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    el.textContent = now.toLocaleDateString('en-IN', opts);
  }

  function _getGreeting() {
    const h = new Date().getHours();
    if (h < 5)  return 'Up late?';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Winding down?';
  }

  // ─────────────────────────────────────────────────────────
  // MORNING VIEW RENDER
  // ─────────────────────────────────────────────────────────

  function _bindMorningButtons() {
    document.getElementById('btn-open-avoiding')
      ?.addEventListener('click', () => _openPaperSheet('avoiding'));
    document.getElementById('btn-open-quotes')
      ?.addEventListener('click', () => _openPaperSheet('quotes'));
  }

  function _openPaperSheet(type) {
    const config = {
      avoiding: {
        title: 'What I am avoiding',
        getValue: () => Storage.getAvoiding(),
        setValue: v  => Storage.setAvoiding(v),
        previewId: 'preview-avoiding'
      },
      quotes: {
        title: 'Quotations & Ideas',
        getValue: () => Storage.getQuotes(),
        setValue: v  => Storage.setQuotes(v),
        previewId: 'preview-quotes'
      }
    };

    const { title, getValue, setValue, previewId } = config[type];
    let saveTimer = null;

    // Build overlay
    const overlay = document.createElement('div');
    overlay.className = 'paper-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    overlay.innerHTML = `
      <div class="paper-card" role="document">
        <div class="paper-header">
          <span class="paper-title">${_escapeHTML(title)}</span>
          <button class="paper-close" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="paper-body">
          <textarea class="paper-textarea"
                    placeholder="Write freely…"
                    maxlength="2000"
                    spellcheck="true"
                    aria-label="${_escapeHTML(title)}">${_escapeHTML(getValue())}</textarea>
        </div>
        <div class="paper-footer">
          <span class="paper-saved" id="paper-saved-indicator">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Saved
          </span>
          <button class="paper-done-btn">Done</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));

    const textarea   = overlay.querySelector('.paper-textarea');
    const savedEl    = overlay.querySelector('#paper-saved-indicator');
    const closeBtn   = overlay.querySelector('.paper-close');
    const doneBtn    = overlay.querySelector('.paper-done-btn');

    // Focus textarea
    setTimeout(() => textarea.focus(), 80);

    // Autosave with debounce
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        setValue(textarea.value);
        _updateMorningPreview(previewId, textarea.value);
        savedEl.classList.add('visible');
        setTimeout(() => savedEl.classList.remove('visible'), 1800);
      }, 600);
    });

    const closeSheet = () => {
      clearTimeout(saveTimer);
      setValue(textarea.value);
      _updateMorningPreview(previewId, textarea.value);
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 240);
      if (navigator.vibrate) navigator.vibrate(10);
    };

    closeBtn.addEventListener('click', closeSheet);
    doneBtn.addEventListener('click', closeSheet);

    // Close on backdrop click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeSheet();
    });

    // Escape key
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSheet();
    });
  }

  function _updateMorningPreview(previewId, value) {
    const el = document.getElementById(previewId);
    if (!el) return;
    const firstLine = value.trim().split('\n')[0].trim();
    if (firstLine) {
      el.textContent = firstLine.length > 40
        ? firstLine.slice(0, 40) + '…'
        : firstLine;
      el.classList.remove('empty');
    } else {
      el.textContent = 'Tap to write…';
      el.classList.add('empty');
    }
  }

  // ─────────────────────────────────────────────────────────
  // REVIEW VIEW FULL RENDER
  // ─────────────────────────────────────────────────────────

  function _renderReviewView() {

    _renderStoicThought();

    const today    = Storage.getToday();
    const settings = Storage.getSettings();

    // ── Date badge ─────────────────────────────────────────
    const badgeEl = document.getElementById('review-date-badge');
    if (badgeEl) {
      const now  = new Date();
      const opts = { weekday: 'long', month: 'long', day: 'numeric' };
      badgeEl.textContent = now.toLocaleDateString('en-IN', opts);
    }

    // ── Pomodoro stats ─────────────────────────────────────
    const pomSummary = typeof Pomodoro !== 'undefined'
      ? Pomodoro.getTodaySummary()
      : { pomodoros: today.pomodoros || 0,
          hoursWorked: ((today.pomodoros || 0) * 0.5).toFixed(1),
          goalPct: 0 };

    _setText('review-stat-pomos',    pomSummary.pomodoros);
    _setText('review-stat-hours',    pomSummary.hoursWorked + 'h');
    _setText('review-stat-goal-pct', pomSummary.goalPct + '%');

    // ── Habits summary ─────────────────────────────────────
    const habitSummary = _buildHabitSummaryFromStorage();

    _setText('review-stat-habits',
      `${habitSummary.checked}/${habitSummary.total}`);

    // Habit checklist (read-only)
    const habitListEl = document.getElementById('review-habit-list');
    if (habitListEl) {
      if (habitSummary.items.length === 0) {
        habitListEl.innerHTML = `
          <p style="color:var(--color-text-faint);font-size:var(--text-sm);
                    padding:var(--space-3) 0;">
            No habits added yet.
          </p>`;
      } else {
        habitListEl.innerHTML = habitSummary.items.map(item => `
          <div class="review-habit-item ${item.checked ? 'done' : ''}">
            <div class="review-habit-dot"></div>
            <span class="review-habit-name"
                  style="font-size:var(--text-sm);
                         color:${item.checked
                           ? 'var(--color-text-muted)'
                           : 'var(--color-text)'}">
              ${_escapeHTML(item.name)}
            </span>
            <span style="margin-left:auto;font-size:var(--text-xs);
                         color:${item.checked
                           ? 'var(--color-success)'
                           : 'var(--color-text-faint)'}">
              ${item.checked ? '✓' : '○'}
            </span>
          </div>`).join('');
      }
    }

    // ── Feel & Fear badges ─────────────────────────────────
    const feel = today.feel || 0;
    const fear = today.fear || 0;

    _setText('review-feel-value', feel > 0 ? `${feel}/5` : '—');
    _setText('review-fear-value', fear > 0 ? `${fear}/5` : '—');
    _setText('review-feel-desc',  feel > 0 ? _feelDesc(feel)  : 'Not rated yet');
    _setText('review-fear-desc',  fear > 0 ? _fearDesc(fear) : 'Not rated yet');

    // ── Avoiding reminder ──────────────────────────────────
    const avoiding  = Storage.getAvoiding();
    const avoidEl   = document.getElementById('review-avoiding');
    if (avoidEl) {
      avoidEl.textContent   = avoiding || 'Nothing noted yet.';
      avoidEl.style.opacity = avoiding ? '1' : '0.5';
    }

    // ── Quotes / ideas ─────────────────────────────────────
    const quotes   = Storage.getQuotes();
    const quotesEl = document.getElementById('review-quotes');
    if (quotesEl) {
      quotesEl.textContent   = quotes || 'No quotes noted today.';
      quotesEl.style.opacity = quotes ? '1' : '0.5';
    }

    // ── Momentum message ───────────────────────────────────
    _renderMomentumMessage(pomSummary, habitSummary, feel, fear);
  }

  function _renderMomentumMessage(pomSummary, habitSummary, feel, fear) {
    const el = document.getElementById('review-momentum');
    if (!el) return;

    let msg = '';
    const pomos   = pomSummary.pomodoros;
    const habitPct = habitSummary.pct;

    if (pomos === 0 && habitPct === 0) {
      msg = 'Day just started — or nothing logged yet. Tomorrow is a fresh page.';
    } else if (pomSummary.goalPct >= 100) {
      msg = '🏆 You hit your 7-hour goal today. That\'s rare. Own it.';
    } else if (pomos >= 8) {
      msg = `💪 ${pomos} pomodoros. Solid focused work today.`;
    } else if (habitPct === 100) {
      msg = '✅ Every habit checked. Consistency compounds.';
    } else if (feel >= 4 && fear <= 2) {
      msg = '😄 High energy, low resistance — you were in the zone today.';
    } else if (fear >= 4) {
      msg = '🫂 High resistance today. Showing up anyway is the whole game.';
    } else if (feel <= 2) {
      msg = '😶 Going through the motions is still motion. Rest if you need it.';
    } else {
      msg = `${pomos} pomodoro${pomos !== 1 ? 's' : ''} done. ` +
            `${habitPct}% habits complete. Keep the streak alive.`;
    }

    el.textContent = msg;
  }

  function _buildHabitSummaryFromStorage() {
    const today     = Storage.getToday();
    const habitsObj = today.habits || {};
    const names     = Object.keys(habitsObj);

    const items = names.map(name => ({
      name:    name,
      checked: habitsObj[name] === true
    }));

    return {
      items:   items.filter(i => i.checked),  // ← only checked habits
      total:   items.length,
      checked: items.filter(i => i.checked).length
    };
  }

  // ─────────────────────────────────────────────────────────
  // TOAST SYSTEM
  // ─────────────────────────────────────────────────────────

  function _ensureToastContainer() {
    if (!document.getElementById('toast-container')) {
      const el = document.createElement('div');
      el.id        = 'toast-container';
      el.className = 'toast-container';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
  }

  const TOAST_ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94
                         a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9"  x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9"  y2="15"/>
                <line x1="9"  y1="9" x2="15" y2="15"/>
              </svg>`
  };

  // toast(message, type, durationMs)
  function toast(message, type = 'success', duration = 2800) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      ${TOAST_ICONS[type] || TOAST_ICONS.success}
      <span>${_escapeHTML(String(message))}</span>`;

    container.appendChild(el);

    // Auto-remove
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);

    // Tap to dismiss
    el.addEventListener('click', () => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    });
  }

  // ─────────────────────────────────────────────────────────
  // BOTTOM SHEET
  // ─────────────────────────────────────────────────────────

  // sheet({
  //   title, content, confirmLabel, cancelLabel,
  //   onOpen(sheetEl), onConfirm(sheetEl) → bool,
  //   onCancel()
  // })
  function sheet(opts = {}) {
    // Build overlay + sheet DOM
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', opts.title || 'Dialog');

    overlay.innerHTML = `
      <div class="bottom-sheet" role="document">
        <div class="sheet-handle" aria-hidden="true"></div>
        <h2 class="sheet-title">${_escapeHTML(opts.title || '')}</h2>
        <div class="sheet-body">
          ${opts.content || ''}
        </div>
        <div class="sheet-actions">
          <button class="btn-secondary btn-sheet-cancel">
            ${_escapeHTML(opts.cancelLabel || 'Cancel')}
          </button>
          <button class="btn-primary btn-sheet-confirm">
            ${_escapeHTML(opts.confirmLabel || 'Save')}
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    _sheetStack.push(overlay);

    // Open animation (next tick)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('open'));
    });

    const sheetEl  = overlay.querySelector('.bottom-sheet');
    const closeBtn = overlay.querySelector('.btn-sheet-cancel');
    const confBtn  = overlay.querySelector('.btn-sheet-confirm');

    // Call onOpen hook
    if (typeof opts.onOpen === 'function') {
      setTimeout(() => opts.onOpen(sheetEl), 80);
    }

    // Confirm
    confBtn.addEventListener('click', () => {
      if (typeof opts.onConfirm === 'function') {
        const keepOpen = opts.onConfirm(sheetEl) === false;
        if (!keepOpen) _closeSheet(overlay);
      } else {
        _closeSheet(overlay);
      }
    });

    // Cancel
    closeBtn.addEventListener('click', () => {
      if (typeof opts.onCancel === 'function') opts.onCancel();
      _closeSheet(overlay);
    });

    // Tap overlay backdrop to dismiss
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        if (typeof opts.onCancel === 'function') opts.onCancel();
        _closeSheet(overlay);
      }
    });

    // Return close handle for programmatic close
    return () => _closeSheet(overlay);
  }

  function _closeSheet(overlay) {
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => {
      overlay.remove();
      _sheetStack = _sheetStack.filter(s => s !== overlay);
    }, { once: true });
  }

  // ─────────────────────────────────────────────────────────
  // CONFIRM DIALOG (destructive actions)
  // ─────────────────────────────────────────────────────────

  // confirm({
  //   title, message, confirm, danger, onConfirm, onCancel
  // })
  function confirm(opts = {}) {
    const isDanger = opts.danger !== false;

    sheet({
      title:        opts.title   || 'Are you sure?',
      confirmLabel: opts.confirm || 'Confirm',
      cancelLabel:  'Cancel',
      content: `
        <p style="font-size:var(--text-sm);
                  color:var(--color-text-muted);
                  line-height:1.6;
                  margin-bottom:var(--space-2);">
          ${_escapeHTML(opts.message || '')}
        </p>`,
      onOpen(sheetEl) {
        const btn = sheetEl.querySelector('.btn-sheet-confirm');
        if (isDanger && btn) {
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-danger');
        }
      },
      onConfirm() {
        if (typeof opts.onConfirm === 'function') opts.onConfirm();
        return true;
      },
      onCancel: opts.onCancel
    });
  }

  // ─────────────────────────────────────────────────────────
  // FEEL & FEAR STAR BARS
  // (Initialised once, used in Morning view + inline in Review)
  // ─────────────────────────────────────────────────────────

  function initMoodBars() {
    _initStarBar('feel-stars', val => {
      Storage.setFeel(val);
      _updateMoodDesc('feel-description', val, 'feel');
    }, Storage.getFeel());

    _initStarBar('fear-stars', val => {
      Storage.setFear(val);
      _updateMoodDesc('fear-description', val, 'fear');
    }, Storage.getFear());

    // Set initial descriptions
    _updateMoodDesc('feel-description', Storage.getFeel(), 'feel');
    _updateMoodDesc('fear-description', Storage.getFear(), 'fear');
  }

  function _initStarBar(containerId, onChange, initialValue) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Build 5 star buttons
    container.innerHTML = [1, 2, 3, 4, 5].map(i => `
      <button class="star-btn ${initialValue >= i ? 'active' : ''}"
              data-value="${i}"
              aria-label="Rate ${i} out of 5"
              aria-pressed="${initialValue >= i}">
        ${i}
      </button>`).join('');

    // Bind clicks
    container.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.value, 10);

        // Toggle off if same value tapped again
        const current = parseInt(
          container.querySelector('.star-btn.active:last-of-type')?.dataset.value || '0',
          10
        );
        const newVal = current === val ? 0 : val;

        // Update active states
        container.querySelectorAll('.star-btn').forEach(b => {
          const bVal = parseInt(b.dataset.value, 10);
          const on   = newVal > 0 && bVal <= newVal;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on);
        });

        onChange(newVal);
        if (navigator.vibrate) navigator.vibrate(12);
      });
    });
  }

  function _updateMoodDesc(elId, val, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = val > 0
      ? (type === 'feel' ? _feelDesc(val) : _fearDesc(val))
      : '';
  }

  // ─────────────────────────────────────────────────────────
  // DATA EXPORT / IMPORT (accessible from a settings sheet)
  // ─────────────────────────────────────────────────────────

  function openSettingsSheet() {
    sheet({
      title: 'Settings & Data',
      content: `
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Export data</div>
            <div class="settings-row-sub">Download all your data as JSON</div>
          </div>
          <button class="btn-secondary" id="btn-export-data"
                  style="flex-shrink:0;font-size:var(--text-xs);">
            Export
          </button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Import data</div>
            <div class="settings-row-sub">Restore from a previous export</div>
          </div>
          <button class="btn-secondary" id="btn-import-trigger"
                  style="flex-shrink:0;font-size:var(--text-xs);">
            Import
          </button>
        </div>
        <input type="file" id="import-file-input"
               accept=".json" class="hidden" aria-hidden="true"/>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Pomodoro lengths</div>
            <div class="settings-row-sub">Work · Break · Long break</div>
          </div>
          <span style="font-size:var(--text-xs);color:var(--color-text-faint);">
            30 · 5 · 25 min
          </span>
        </div>
        <div class="settings-row" style="margin-top:var(--space-4);">
          <div>
            <div class="settings-row-label" style="color:var(--color-danger);">
              Clear all data
            </div>
            <div class="settings-row-sub">Permanent. Cannot be undone.</div>
          </div>
          <button class="btn-danger" id="btn-nuke"
                  style="flex-shrink:0;font-size:var(--text-xs);">
            Clear
          </button>
        </div>`,
      confirmLabel: 'Done',
      cancelLabel:  '',
      onOpen(sheetEl) {
        // Hide cancel, repurpose confirm as close
        const cancel = sheetEl.querySelector('.btn-sheet-cancel');
        if (cancel) cancel.style.display = 'none';

        // Export
        sheetEl.querySelector('#btn-export-data')
          ?.addEventListener('click', _exportData);

        // Import
        const importBtn = sheetEl.querySelector('#btn-import-trigger');
        const fileInput = sheetEl.querySelector('#import-file-input');

        importBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', e => {
          _importData(e.target.files?.[0]);
        });

        // Nuke
        sheetEl.querySelector('#btn-nuke')
          ?.addEventListener('click', () => {
            confirm({
              title:   'Delete everything?',
              message: 'All habits, history, pomodoros, and settings will be erased permanently.',
              confirm: 'Delete All',
              danger:  true,
              onConfirm() {
                Storage.nukeAll();
                location.reload();
              }
            });
          });
      },
      onConfirm: () => true
    });
  }

  function _exportData() {
    const json     = Storage.exportJSON();
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const dateStr  = new Date().toISOString().split('T')[0];
    a.href         = url;
    a.download     = `focus-compass-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Data exported!', 'success');
  }

  function _importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const result = Storage.importJSON(e.target.result);
      if (result.ok) {
        toast('Data imported! Reloading…', 'success');
        setTimeout(() => location.reload(), 1200);
      } else {
        toast('Import failed: ' + result.error, 'error');
      }
    };
    reader.readAsText(file);
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _escapeHTML(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  function _feelDesc(v) {
    return ['', 'Robotic, going through motions',
                'Disconnected, low energy',
                'Neutral, functioning',
                'Engaged, present',
                'Fully alive, deeply connected'][v] || '';
  }

  function _fearDesc(v) {
    return ['', 'Zero hesitation, fully clear',
                'Slight resistance',
                'Moderate hesitation',
                'Strong resistance, avoiding hard tasks',
                'Paralysed, can\'t start'][v] || '';
  }

  

  function _bindDisciplineTabs() {
  document.querySelectorAll('.discipline-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.discipline-tab')
        .forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');
      const d = tab.dataset.discipline;
      Storage.setDiscipline(d);
      
      _updateDisciplineDesc(d);
    });
  });
  }

  function _updateDisciplineDesc(discipline) {
    const descs = {
      desire:  'What you want and fear — desiring only what is truly in your control.',
      action:  'How you act in the world — with effort, reservation, and care for others.',
      assent:  'How you judge impressions — not every thought deserves your agreement.'
    };
    const el = document.getElementById('discipline-desc');
    if (el) el.textContent = descs[discipline] || '';
  }

  function _renderStoicThought() {
    if (typeof STOIC_THOUGHTS === 'undefined') return;
    const day  = _getDayOfYear();
    const r    = day % 3;
    const disc = r === 1 ? 'desire' : r === 2 ? 'action' : 'assent';
    const idx  = Math.floor((day - 1) / 3) % 122;

    const thought = STOIC_THOUGHTS[disc]?.[idx] || STOIC_THOUGHTS.desire[0];

    const labels = { desire: '◈ Desire', action: '◇ Action', assent: '○ Assent' };
    _setText('stoic-discipline-badge', labels[disc]);
    _setText('stoic-thought-text',     thought.text);
    _setText('stoic-source',           '— ' + thought.source);

    // Sync active discipline tab to today's discipline
    document.querySelectorAll('.discipline-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.discipline === disc);
    });
    _updateDisciplineDesc(disc);
  }

  function _getDayOfYear() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────
  return {
    init,
    initMoodBars,
    navigateTo:         _navigateTo,
    toast,
    sheet,
    confirm,
    openSettingsSheet,
    renderReview:       _renderReviewView,
  };

})();
