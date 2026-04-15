/* assets/js/app.js */
const App = (() => {

  let _midnightTimer  = null;
  let _lastKnownDate  = _todayStr();
  let _installPrompt  = null;   // ✅ local variable — not App._installPrompt

  function init() {
    UI.init();
    UI.initMoodBars();
    Habits.init();
    Pomodoro.init();
    Dashboard.init();

    _bindGlobalEvents();
    _bindSettingsBtn();
    _startMidnightGuard();
    _registerVisibilityHandler();
    _registerKeyboardShortcuts();

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _installPrompt = e;   // ✅ local variable
    });

    console.info('[Focus Compass] Booted ✓');
  }

  function _bindGlobalEvents() {
    document.addEventListener('touchstart', () => {}, { passive: true });

    const observer = new MutationObserver(() => {
      const sheetOpen = document.querySelector('.modal-overlay.open');
      document.body.style.overflow = sheetOpen ? 'hidden' : '';
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const topSheet = document.querySelector('.modal-overlay.open');
        topSheet?.querySelector('.btn-sheet-cancel')?.click();
      }
    });
  }

  function _bindSettingsBtn() {
    const btn = document.getElementById('btn-settings');
    btn?.addEventListener('click', () => UI.openSettingsSheet());
  }

  function _registerKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (document.querySelector('.modal-overlay.open')) return;

      switch (e.key) {
        case '1': UI.navigateTo('morning');   break;
        case '2': UI.navigateTo('habits');    break;
        case '3': UI.navigateTo('pomodoro');  break;
        case '4': UI.navigateTo('review');    break;
        case '5': UI.navigateTo('dashboard'); break;
        case ' ':
          if (_currentView() === 'pomodoro') {
            e.preventDefault();
            document.getElementById('btn-pomo-main')?.click();
          }
          break;
      }
    });
  }

  function _currentView() {
    return document.querySelector('.nav-item.active')?.dataset.view || 'morning';
  }

  function _registerVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') _onAppForeground();
    });
    window.addEventListener('pageshow', e => {
      if (e.persisted) _onAppForeground();
    });
  }

  function _onAppForeground() {
    const currentDate = _todayStr();
    if (currentDate !== _lastKnownDate) {
      _handleMidnightRollover();
      _lastKnownDate = currentDate;
    }
    if (typeof Pomodoro !== 'undefined') Pomodoro.onViewEnter();

    const dateEl = document.getElementById('header-date');
    if (dateEl) {
      dateEl.textContent = new Date()
        .toLocaleDateString('en-IN', { weekday:'short', month:'short', day:'numeric' });
    }
  }

  function _startMidnightGuard() {
    _midnightTimer = setInterval(() => {
      const now = _todayStr();
      if (now !== _lastKnownDate) {
        _handleMidnightRollover();
        _lastKnownDate = now;
      }
    }, 60_000);
  }

  function _handleMidnightRollover() {
    Storage.load();
    const active = _currentView();
    switch (active) {
      case 'morning':   UI.renderMorning();        break;
      case 'habits':    Habits.syncNewDay();        break;
      case 'pomodoro':
        Pomodoro.renderStats();
        Pomodoro.onViewEnter();
        break;
      case 'review':    UI.renderReview();          break;
      case 'dashboard': Dashboard.render();         break;
    }
    UI.toast('New day started 🌅 — habits & timer reset.', 'success', 4000);
  }

  function triggerInstallPrompt() {
    if (!_installPrompt) {
      UI.toast('Open in browser → Share → Add to Home Screen', 'warning', 5000);
      return;
    }
    _installPrompt.prompt();
    _installPrompt.userChoice.then(result => {
      if (result.outcome === 'accepted') UI.toast('Added to Home Screen! 🎉', 'success');
      _installPrompt = null;
    });
  }

  function _todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  return { init, triggerInstallPrompt };

})();

document.addEventListener('DOMContentLoaded', () => App.init());