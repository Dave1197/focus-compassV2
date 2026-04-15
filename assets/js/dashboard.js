/* assets/js/dashboard.js */
/* ═══════════════════════════════════════════════════════════
   FOCUS COMPASS — Dashboard Module
   
   Renders: KPI cards, pomodoro history chart, mood trends,
            habit completion rates — all filtered by range.
   
   Charts:  Chart.js (loaded via CDN in index.html)
   Depends: storage.js
   ═══════════════════════════════════════════════════════════ */

const Dashboard = (() => {

  // ── Range config ─────────────────────────────────────────
  const RANGES = [
    { label: '7D',   days: 7   },
    { label: '30D',  days: 30  },
    { label: '3M',   days: 90  },
    { label: 'Year', days: 365 }
  ];

  let _activeRange = 7;  // days

  // ── Chart instances (kept for destroy/re-render) ─────────
  let _chartPomodoro = null;
  let _chartMood     = null;

  // ── Chart default theme ──────────────────────────────────
  // Reads CSS variables at runtime so light/dark both work
  function _css(varName) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(varName).trim();
  }

  function _chartDefaults() {
    Chart.defaults.font.family      = _css('--font-body') || 'Satoshi, sans-serif';
    Chart.defaults.font.size        = 11;
    Chart.defaults.color            = _css('--color-text-muted');
    Chart.defaults.borderColor      = _css('--color-divider');
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = _css('--color-surface-2');
    Chart.defaults.plugins.tooltip.titleColor       = _css('--color-text');
    Chart.defaults.plugins.tooltip.bodyColor        = _css('--color-text-muted');
    Chart.defaults.plugins.tooltip.borderColor      = _css('--color-border');
    Chart.defaults.plugins.tooltip.borderWidth      = 1;
    Chart.defaults.plugins.tooltip.padding          = 10;
    Chart.defaults.plugins.tooltip.cornerRadius     = 8;
    Chart.defaults.plugins.tooltip.displayColors    = false;
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    _bindRangeTabs();
  }

  // ── Range tab buttons ────────────────────────────────────
  function _bindRangeTabs() {
    const tabs = document.querySelectorAll('.range-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _activeRange = parseInt(tab.dataset.days, 10);
        render();
      });
    });
  }

  // ── Master render — called on view enter + range change ──
  function render() {
    if (typeof Chart === 'undefined') {
      console.warn('[Dashboard] Chart.js not loaded yet');
      return;
    }

    _chartDefaults();

    const history = Storage.getHistoryRange(_activeRange);

    _renderKPIs(history);
    _renderPomodoroChart(history);
    _renderMoodChart(history);
    _renderHabitStats();
    _renderStreaks();
  }

  // ── KPI row ──────────────────────────────────────────────
  function _renderKPIs(history) {
    const totalPomos = history.reduce((s, r) => s + (r.pomodoros || 0), 0);
    const totalHours = history.reduce((s, r) => s + (r.hoursWorked || 0), 0);
    const avgFeel    = _avg(history.map(r => r.feel).filter(v => v > 0));
    const avgFear    = _avg(history.map(r => r.fear).filter(v => v > 0));

    // Days that hit goal (7h = 14 pomodoros)
    const goalPomos  = Storage.getPomodoroGoal() * 2;
    const daysOnGoal = history.filter(r => r.pomodoros >= goalPomos).length;

    _setText('kpi-total-pomos',  totalPomos);
    _setText('kpi-total-hours',  totalHours.toFixed(1) + 'h');
    _setText('kpi-days-on-goal', daysOnGoal);
    _setText('kpi-avg-feel',     avgFeel > 0 ? avgFeel.toFixed(1) : '—');
    _setText('kpi-avg-fear',     avgFear > 0 ? avgFear.toFixed(1) : '—');
    _setText('kpi-days-tracked', history.length);
  }

  // ── Pomodoro bar chart ───────────────────────────────────
  function _renderPomodoroChart(history) {
    const canvas = document.getElementById('chart-pomodoro');
    if (!canvas) return;

    // Destroy previous instance
    if (_chartPomodoro) {
      _chartPomodoro.destroy();
      _chartPomodoro = null;
    }

    if (history.length === 0) {
      _showEmpty('chart-pomodoro-wrap', 'No data yet for this range');
      return;
    }

    _hideEmpty('chart-pomodoro-wrap');

    // Bucket data — for long ranges, group by week
    const { labels, pomoCounts, hoursCounts } = _bucketPomodoroData(history);

    const accentColor  = _css('--color-accent');
    const successColor = _css('--color-success');

    _chartPomodoro = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label:           'Pomodoros',
            data:            pomoCounts,
            backgroundColor: `color-mix(in oklch, ${accentColor} 70%, transparent)`,
            borderColor:     accentColor,
            borderWidth:     1.5,
            borderRadius:    4,
            borderSkipped:   false,
            yAxisID:         'y'
          },
          {
            label:           'Hours',
            data:            hoursCounts,
            type:            'line',
            borderColor:     successColor,
            backgroundColor: 'transparent',
            borderWidth:     2,
            pointRadius:     3,
            pointBackgroundColor: successColor,
            tension:         0.35,
            yAxisID:         'y2'
          }
        ]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction: {
          mode:         'index',
          intersect:    false
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 8,
              maxRotation:   0
            }
          },
          y: {
            position: 'left',
            beginAtZero: true,
            grid: {
              color: _css('--color-divider')
            },
            ticks: {
              stepSize: 2,
              maxTicksLimit: 5
            }
          },
          y2: {
            position:    'right',
            beginAtZero: true,
            grid: { display: false },
            ticks: {
              maxTicksLimit: 5,
              callback: v => v + 'h'
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label === 'Hours'
                ? ` ${ctx.parsed.y}h focused`
                : ` ${ctx.parsed.y} pomodoros`
            }
          }
        }
      }
    });
  }

  // ── Mood line chart (Feel + Fear) ────────────────────────
  function _renderMoodChart(history) {
    const canvas = document.getElementById('chart-mood');
    if (!canvas) return;

    if (_chartMood) {
      _chartMood.destroy();
      _chartMood = null;
    }

    const moodData = history.filter(r => r.feel > 0 || r.fear > 0);

    if (moodData.length < 2) {
      _showEmpty('chart-mood-wrap', 'Need at least 2 days of ratings');
      return;
    }

    _hideEmpty('chart-mood-wrap');

    const labels    = moodData.map(r => _shortDate(r.date));
    const feelData  = moodData.map(r => r.feel || null);
    const fearData  = moodData.map(r => r.fear || null);

    const feelColor = _css('--color-accent');
    const fearColor = _css('--color-danger');
    const feelMuted = _css('--color-accent-muted');
    const fearMuted = _css('--color-danger-muted');

    _chartMood = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label:                'Feel',
            data:                 feelData,
            borderColor:          feelColor,
            backgroundColor:      `color-mix(in oklch, ${feelColor} 12%, transparent)`,
            borderWidth:          2.5,
            pointRadius:          4,
            pointBackgroundColor: feelColor,
            pointBorderColor:     'transparent',
            tension:              0.4,
            fill:                 true,
            spanGaps:             true
          },
          {
            label:                'Fear',
            data:                 fearData,
            borderColor:          fearColor,
            backgroundColor:      `color-mix(in oklch, ${fearColor} 10%, transparent)`,
            borderWidth:          2.5,
            pointRadius:          4,
            pointBackgroundColor: fearColor,
            pointBorderColor:     'transparent',
            tension:              0.4,
            fill:                 true,
            spanGaps:             true
          }
        ]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction: {
          mode:      'index',
          intersect: false
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 7,
              maxRotation:   0
            }
          },
          y: {
            min:         0,
            max:         5,
            beginAtZero: false,
            ticks: {
              stepSize: 1,
              callback: v => ['', '😶', '😕', '😐', '🙂', '😄'][v] || v
            },
            grid: {
              color: _css('--color-divider')
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => {
                const label = ctx.dataset.label;
                const val   = ctx.parsed.y;
                const desc  = label === 'Feel'
                  ? _feelDesc(val)
                  : _fearDesc(val);
                return ` ${label}: ${val}/5 — ${desc}`;
              }
            }
          },
          // Custom inline legend
          legend: {
            display:  true,
            position: 'top',
            align:    'end',
            labels: {
              boxWidth:    10,
              boxHeight:   10,
              borderRadius: 5,
              padding:     12,
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  // ── Habit stats list ─────────────────────────────────────
  function _renderHabitStats() {
    const container = document.getElementById('habit-stats-list');
    if (!container) return;

    const stats = Storage.getHabitStats(_activeRange);
    const habits = Storage.getHabitsList();

    if (habits.length === 0 || Object.keys(stats).length === 0) {
      container.innerHTML = `
        <p style="color:var(--color-text-faint);font-size:var(--text-sm);
                  text-align:center;padding:var(--space-8) 0;">
          No habit data for this range yet.
        </p>`;
      return;
    }

    // Sort by completion rate descending
    const sorted = habits
      .map(name => ({ name, ...stats[name] || { checked: 0, total: 0, rate: 0 } }))
      .sort((a, b) => b.rate - a.rate);

    container.innerHTML = sorted.map(h => {
      const barColor = h.rate >= 70
        ? 'var(--color-success)'
        : h.rate >= 40
          ? 'var(--color-accent)'
          : 'var(--color-danger)';

      return `
        <div class="habit-stat-item">
          <div class="habit-stat-row">
            <span class="habit-stat-name">${_escapeHTML(h.name)}</span>
            <span class="habit-stat-pct" style="color:${barColor}">${h.rate}%</span>
          </div>
          <div class="habit-stat-bar-bg">
            <div class="habit-stat-bar-fill"
                 style="width:${h.rate}%; background:${barColor};"
                 role="progressbar"
                 aria-valuenow="${h.rate}"
                 aria-valuemin="0"
                 aria-valuemax="100">
            </div>
          </div>
          <div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:2px;">
            ${h.checked} / ${h.total} days
          </div>
        </div>`;
    }).join('');
  }

  // ── Streaks ──────────────────────────────────────────────
  function _renderStreaks() {
    const container = document.getElementById('streak-list');
    if (!container) return;

    const habits = Storage.getHabitsList();
    const history = Storage.getHistory(); // full history for streaks

    if (habits.length === 0) {
      container.innerHTML = '';
      return;
    }

    const streaks = habits.map(name => ({
      name,
      current: _currentStreak(name, history),
      best:    _bestStreak(name, history)
    })).sort((a, b) => b.current - a.current);

    container.innerHTML = streaks.map(s => `
      <div class="habit-stat-item">
        <div class="habit-stat-row">
          <span class="habit-stat-name">${_escapeHTML(s.name)}</span>
          <span style="display:flex;gap:var(--space-3);align-items:center;">
            <span style="font-size:var(--text-xs);color:var(--color-text-faint);">
              Best <strong style="color:var(--color-text)">${s.best}d</strong>
            </span>
            <span style="font-size:var(--text-sm);font-weight:700;
                         color:${s.current > 0 ? 'var(--color-accent)' : 'var(--color-text-faint)'}">
              🔥 ${s.current}d
            </span>
          </span>
        </div>
      </div>`).join('');
  }

  // ── Data bucketing for long ranges ──────────────────────
  function _bucketPomodoroData(history) {
    // ≤30 days → daily. >30 days → weekly buckets
    if (_activeRange <= 30 || history.length <= 30) {
      return {
        labels:      history.map(r => _shortDate(r.date)),
        pomoCounts:  history.map(r => r.pomodoros || 0),
        hoursCounts: history.map(r => r.hoursWorked || 0)
      };
    }

    // Weekly bucketing
    const weeks = {};
    history.forEach(r => {
      const weekKey = _weekKey(r.date);
      if (!weeks[weekKey]) weeks[weekKey] = { pomodoros: 0, hours: 0 };
      weeks[weekKey].pomodoros += r.pomodoros  || 0;
      weeks[weekKey].hours     += r.hoursWorked || 0;
    });

    const keys = Object.keys(weeks).sort();
    return {
      labels:      keys.map(k => 'W' + k.split('-W')[1]),
      pomoCounts:  keys.map(k => weeks[k].pomodoros),
      hoursCounts: keys.map(k => parseFloat(weeks[k].hours.toFixed(1)))
    };
  }

  // ── Streak calculators ───────────────────────────────────
  function _currentStreak(habitName, history) {
    // Walk backwards from most recent day
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    let streak = 0;
    let prevDate = null;

    for (const record of sorted) {
      const checked = record.habits?.[habitName];
      if (!checked) break;

      if (prevDate) {
        // Check continuity
        const diff = _daysBetween(record.date, prevDate);
        if (diff !== 1) break;
      }
      streak++;
      prevDate = record.date;
    }
    return streak;
  }

  function _bestStreak(habitName, history) {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    let best = 0, current = 0;
    let prevDate = null;

    for (const record of sorted) {
      const checked = record.habits?.[habitName];

      if (checked) {
        if (prevDate && _daysBetween(prevDate, record.date) === 1) {
          current++;
        } else {
          current = 1;
        }
        best = Math.max(best, current);
        prevDate = record.date;
      } else {
        current  = 0;
        prevDate = null;
      }
    }
    return best;
  }

  // ── Date helpers ─────────────────────────────────────────

  // "2026-04-15" → "Apr 15"
  function _shortDate(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m - 1]} ${d}`;
  }

  // ISO week key: "2026-W16"
  function _weekKey(dateStr) {
    const d    = new Date(dateStr + 'T12:00:00');
    const day  = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const year = d.getFullYear();
    const week = Math.ceil(
      ((d - new Date(year, 0, 1)) / 86400000 + 1) / 7
    );
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  // Days between two "YYYY-MM-DD" strings (a > b → positive)
  function _daysBetween(a, b) {
    return Math.round(
      (new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000
    );
  }

  // ── Stat helpers ─────────────────────────────────────────
  function _avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  // ── Mood descriptors ─────────────────────────────────────
  function _feelDesc(v) {
    return ['', 'Robotic', 'Disconnected', 'Neutral', 'Engaged', 'Fully alive'][v] || '';
  }

  function _fearDesc(v) {
    return ['', 'No hesitation', 'Slight resistance', 'Moderate', 'Strong hesitation', 'Paralysed'][v] || '';
  }

  // ── Empty state helpers ──────────────────────────────────
  function _showEmpty(wrapId, msg) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.innerHTML = `
      <div style="text-align:center;padding:var(--space-8) var(--space-4);
                  color:var(--color-text-faint);font-size:var(--text-sm);">
        ${msg}
      </div>`;
  }

  function _hideEmpty(wrapId) {
    // The canvas element will replace whatever was in wrap via render
    // Nothing to do here if canvas is always present in HTML
  }

  // ── DOM helpers ──────────────────────────────────────────
  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Public: called on theme toggle to re-render charts ───
  function onThemeChange() {
    if (document.getElementById('view-dashboard')?.classList.contains('active')) {
      render();
    }
  }

  // ── Public: called on view enter ─────────────────────────
  function onViewEnter() {
    render();
  }

  // ── Public API ───────────────────────────────────────────
  return {
    init,
    render,
    onViewEnter,
    onThemeChange
  };

})();