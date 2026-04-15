/* assets/js/habits.js */
/* ═══════════════════════════════════════════════════════════
   FOCUS COMPASS — Habits Module
   Handles: CRUD, daily checkbox logic, progress, rendering
   Drag-to-reorder via SortableJS (must load before this file)
   Depends on: storage.js (must load first)
   ═══════════════════════════════════════════════════════════ */

const Habits = (() => {

  // ── DOM refs (set on init) ──────────────────────────────
  let _listEl        = null;
  let _progressFill  = null;
  let _progressLabel = null;
  let _emptyState    = null;
  let _sortable      = null;  // SortableJS instance

  // Long-press state (for mobile edit/delete reveal)
  let _pressTimer    = null;
  const LONG_PRESS_MS = 500;

  // ── Initialise ──────────────────────────────────────────
  function init() {
    _listEl        = document.getElementById('habit-list');
    _progressFill  = document.getElementById('habits-progress-fill');
    _progressLabel = document.getElementById('habits-progress-label');
    _emptyState    = document.getElementById('habits-empty');

    _bindStaticControls();
    render();
  }

  // ── Bind buttons that exist in HTML (not per-habit) ─────
  function _bindStaticControls() {

    // "Add habit" submit
    const addForm = document.getElementById('habit-add-form');
    if (addForm) {
      addForm.addEventListener('submit', e => {
        e.preventDefault();
        const input = document.getElementById('habit-add-input');
        const name  = input?.value?.trim();
        if (!name) return;

        const result = Storage.addHabit(name);
        if (result.ok) {
          input.value = '';
          render();
          UI.toast('Habit added', 'success');
        } else {
          UI.toast(result.error, 'warning');
          input.focus();
        }
      });
    }

    // "Reset checkboxes" button
    const resetBtn = document.getElementById('btn-habits-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        UI.confirm({
          title:   'Reset today\'s habits?',
          message: 'All checkboxes will be cleared. Your habit list stays.',
          confirm: 'Reset',
          danger:  true,
          onConfirm() {
            Storage.resetTodayHabits();
            render();
            UI.toast('Habits reset for today', 'warning');
          }
        });
      });
    }
  }

  // ── Master render — rebuilds the list from Storage ──────
  function render() {
    if (!_listEl) return;

    const habitNames = Storage.getHabitsList();
    const todayMap   = Storage.getTodayHabits();

    // Empty state
    if (habitNames.length === 0) {
      _listEl.innerHTML = '';
      _emptyState?.classList.remove('hidden');
      _updateProgress(0, 0);
      _destroySortable();
      return;
    }

    _emptyState?.classList.add('hidden');

    // Build list HTML
    _listEl.innerHTML = habitNames
      .map(name => _habitItemHTML(name, !!todayMap[name]))
      .join('');

    // Bind events to each item
    _listEl.querySelectorAll('.habit-item').forEach(_bindHabitItem);

    // Update progress bar
    const checked = Object.values(todayMap).filter(Boolean).length;
    _updateProgress(checked, habitNames.length);

    // Initialise drag-to-reorder
    _initSortable();
  }

  // ── Initialise SortableJS on the list ───────────────────
  function _initSortable() {
    _destroySortable(); // destroy previous instance first

    if (!_listEl || typeof Sortable === 'undefined') return;

    _sortable = Sortable.create(_listEl, {
      handle:           '.habit-drag-handle',
      animation:        150,
      delay:            150,
      delayOnTouchOnly: true,
      ghostClass:       'habit-drag-ghost',
      chosenClass:      'habit-drag-chosen',
      dragClass:        'habit-drag-active',
      onEnd() {
        // Read new order from DOM and persist to Storage
        const newOrder = [];
        _listEl.querySelectorAll('.habit-item[data-habit]').forEach(el => {
          newOrder.push(el.dataset.habit);
        });
        Storage.reorderHabits(newOrder);
      }
    });
  }

  function _destroySortable() {
    if (_sortable) {
      _sortable.destroy();
      _sortable = null;
    }
  }

  // ── Single habit item HTML ───────────────────────────────
  function _habitItemHTML(name, checked) {
    const checkedClass = checked ? 'checked' : '';
    const checkSVG = `
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="2,7 5.5,10.5 12,3.5"/>
      </svg>`;

    const safeName = _escapeAttr(name);

    return `
      <div class="habit-item ${checkedClass}"
           role="checkbox"
           aria-checked="${checked}"
           aria-label="${safeName}"
           data-habit="${safeName}"
           tabindex="0">

        <span class="habit-drag-handle" aria-hidden="true" title="Hold to reorder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round">
            <line x1="3" y1="7"  x2="21" y2="7"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="17" x2="21" y2="17"/>
          </svg>
        </span>

        <div class="habit-checkbox" aria-hidden="true">
          ${checkSVG}
        </div>

        <span class="habit-name">${_escapeHTML(name)}</span>

        <div class="habit-actions">
          <button class="btn-icon btn-habit-edit"
                  aria-label="Edit ${safeName}"
                  data-habit="${safeName}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
            </svg>
          </button>
          <button class="btn-icon btn-habit-delete"
                  aria-label="Delete ${safeName}"
                  data-habit="${safeName}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  // ── Bind events to a single habit item ──────────────────
  function _bindHabitItem(el) {
    const name = el.dataset.habit;

    // Tap / click → toggle checkbox
    el.addEventListener('click', e => {
      if (e.target.closest('.habit-actions'))    return;
      if (e.target.closest('.habit-drag-handle')) return;
      _toggleHabit(name, el);
    });

    // Keyboard: Space/Enter → toggle
    el.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!e.target.closest('.habit-actions')) _toggleHabit(name, el);
      }
    });

    // Long press → reveal edit/delete (mobile)
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.habit-drag-handle')) return;
      _pressTimer = setTimeout(() => {
        el.classList.add('show-actions');
        _pressTimer = null;
      }, LONG_PRESS_MS);
    });

    el.addEventListener('pointerup',     _clearPress);
    el.addEventListener('pointercancel', _clearPress);
    el.addEventListener('pointermove',   _clearPress);

    // Edit button
    el.querySelector('.btn-habit-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      _openEditSheet(name);
    });

    // Delete button
    el.querySelector('.btn-habit-delete')?.addEventListener('click', e => {
      e.stopPropagation();
      _confirmDelete(name);
    });
  }

  function _clearPress() {
    if (_pressTimer) {
      clearTimeout(_pressTimer);
      _pressTimer = null;
    }
  }

  // ── Toggle a habit checkbox ──────────────────────────────
  function _toggleHabit(name, el) {
    const newState = Storage.toggleHabit(name);
    if (newState === null) return;

    if (newState) {
      el.classList.add('checked');
      el.setAttribute('aria-checked', 'true');
    } else {
      el.classList.remove('checked');
      el.setAttribute('aria-checked', 'false');
    }

    const todayMap = Storage.getTodayHabits();
    const checked  = Object.values(todayMap).filter(Boolean).length;
    const total    = Storage.getHabitsList().length;
    _updateProgress(checked, total);

    if (navigator.vibrate) navigator.vibrate(newState ? 30 : 10);
  }

  // ── Progress bar + label ─────────────────────────────────
  function _updateProgress(checked, total) {
    if (!_progressFill || !_progressLabel) return;

    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

    _progressFill.style.width = `${pct}%`;
    _progressLabel.innerHTML  =
      `<span><strong>${checked}</strong> of ${total} done</span>` +
      `<span>${pct}%</span>`;

    if (checked > 0 && checked === total) {
      _celebrate();
    }
  }

  // ── Celebrate all habits complete ────────────────────────
  function _celebrate() {
    UI.toast('🎉 All habits done! Incredible.', 'success');
  }

  // ── Edit sheet ───────────────────────────────────────────
  function _openEditSheet(oldName) {
    UI.sheet({
      title: 'Edit habit',
      content: `
        <label class="input-label" for="sheet-habit-input">Habit name</label>
        <input  class="input-text"
                id="sheet-habit-input"
                type="text"
                value="${_escapeAttr(oldName)}"
                autocomplete="off" />`,
      confirmLabel: 'Save',
      onOpen(sheetEl) {
        const inp = sheetEl.querySelector('#sheet-habit-input');
        setTimeout(() => { inp?.focus(); inp?.select(); }, 120);
      },
      onConfirm(sheetEl) {
        const inp     = sheetEl.querySelector('#sheet-habit-input');
        const newName = inp?.value?.trim();
        if (!newName) return false;
        if (newName === oldName) return true;

        const ok = Storage.editHabit(oldName, newName);
        if (ok) {
          render();
          UI.toast('Habit updated', 'success');
          return true;
        } else {
          UI.toast('Name already exists', 'warning');
          return false;
        }
      }
    });
  }

  // ── Delete confirmation ──────────────────────────────────
  function _confirmDelete(name) {
    UI.confirm({
      title:   `Delete "${name}"?`,
      message: 'This removes the habit and all its history. Cannot be undone.',
      confirm: 'Delete',
      danger:  true,
      onConfirm() {
        Storage.removeHabit(name);
        render();
        UI.toast(`"${name}" deleted`, 'warning');
      }
    });
  }

  // ── Public: re-sync on new day ───────────────────────────
  function syncNewDay() {
    render();
  }

  // ── Public: summary for Review / Dashboard ───────────────
  function getTodaySummary() {
    const names    = Storage.getHabitsList();
    const todayMap = Storage.getTodayHabits();
    const items    = names.map(name => ({
      name,
      checked: !!todayMap[name]
    }));
    const checked = items.filter(i => i.checked).length;

    return {
      items,
      checked,
      total: names.length,
      pct:   names.length > 0 ? Math.round((checked / names.length) * 100) : 0
    };
  }

  // ── Sanitisation helpers ─────────────────────────────────
  function _escapeHTML(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  function _escapeAttr(str) {
    return _escapeHTML(str);
  }

  // ── Public API ───────────────────────────────────────────
  return {
    init,
    render,
    syncNewDay,
    getTodaySummary
  };

})();
