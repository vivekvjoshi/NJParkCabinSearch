/* NJ Site Finder frontend — vanilla JS, no frameworks. */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const state = {
    mode: 'weekend', // weekend finder is the default mode
    types: new Set([1]), // Cabin is the default site type
    features: new Set(),
    flushOnly: false,
    parks: new Set(),
    meta: null,
    es: null,
  };

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return `${DOW[dt.getUTCDay()]} ${MON[m - 1]} ${d}`;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  // ---------- chip helpers ----------

  function makeChip(label, isOn, onToggle) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'chip' + (isOn() ? ' on' : '');
    el.textContent = label;
    el.addEventListener('click', () => {
      onToggle();
      el.classList.toggle('on', isOn());
      updateMinStayBanner();
    });
    return el;
  }

  function toggleSet(set, id) {
    set.has(id) ? set.delete(id) : set.add(id);
  }

  // ---------- boot ----------

  async function boot() {
    const meta = await (await fetch('/api/meta')).json();
    state.meta = meta;
    meta.parks.forEach((p) => state.parks.add(p.id)); // all parks on by default

    // month dropdown: this month + next 6
    const monthSel = $('#monthSelect');
    const [ty, tm] = meta.today.split('-').map(Number);
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(ty, tm - 1 + i, 1));
      const val = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      monthSel.appendChild(opt);
    }

    const dateInput = $('#dateInput');
    dateInput.min = meta.today;
    dateInput.value = meta.today;

    renderTypeChips();
    renderParkChips();
    renderComfortChips();
    renderFeatureChips();
    updateMinStayBanner();

    if (!meta.nlEnabled) {
      $('#nlInput').placeholder = 'Natural-language search: add NVIDIA_API_KEY to .env to enable';
    }
  }

  function renderTypeChips() {
    const box = $('#typeChips');
    box.innerHTML = '';
    for (const t of state.meta.types) {
      box.appendChild(makeChip(t.name, () => state.types.has(t.id), () => toggleSet(state.types, t.id)));
    }
  }

  function renderParkChips() {
    const box = $('#parkChips');
    box.innerHTML = '';
    for (const p of state.meta.parks) {
      box.appendChild(makeChip(p.name, () => state.parks.has(p.id), () => toggleSet(state.parks, p.id)));
    }
    $('#parksAll').onclick = (e) => {
      e.preventDefault();
      state.meta.parks.forEach((p) => state.parks.add(p.id));
      renderParkChips();
    };
    $('#parksNone').onclick = (e) => {
      e.preventDefault();
      state.parks.clear();
      renderParkChips();
    };
  }

  function renderComfortChips() {
    const box = $('#comfortChips');
    box.innerHTML = '';
    box.appendChild(makeChip('🚽 Flush toilets', () => state.flushOnly, () => (state.flushOnly = !state.flushOnly)));
    const showerId = state.meta.showerFeatureId;
    box.appendChild(makeChip('🚿 Showers', () => state.features.has(showerId), () => toggleSet(state.features, showerId)));
  }

  function renderFeatureChips() {
    const box = $('#featureChips');
    box.innerHTML = '';
    for (const f of state.meta.features) {
      if (f.id === state.meta.showerFeatureId) continue; // lives in Comfort
      box.appendChild(makeChip(f.name, () => state.features.has(f.id), () => toggleSet(state.features, f.id)));
    }
  }

  function updateMinStayBanner() {
    const show = state.meta && state.meta.minStayTypeIds.some((id) => state.types.has(id));
    $('#minStayBanner').hidden = !show;
  }

  // ---------- mode tabs ----------

  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.mode = tab.dataset.mode;
      document.querySelectorAll('.mode-tab').forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      });
      $('#weekendControls').hidden = state.mode !== 'weekend';
      $('#dateControls').hidden = state.mode !== 'date';
    });
  });

  // ---------- search ----------

  function commonQuery() {
    return new URLSearchParams({
      parks: [...state.parks].join(','),
      types: [...state.types].join(','),
      features: [...state.features].join(','),
      flushOnly: state.flushOnly ? '1' : '0',
    });
  }

  function setBusy(busy) {
    $('#searchBtnW').disabled = busy;
    $('#searchBtnD').disabled = busy;
    $('#searchBtnW').textContent = busy ? 'Searching…' : 'Search';
    $('#searchBtnD').textContent = busy ? 'Searching…' : 'Search';
  }

  function beginSearch() {
    if (state.es) { state.es.close(); state.es = null; }
    if (!state.parks.size) {
      $('#summary').innerHTML = '<div class="banner banner-error">Select at least one park in the left rail.</div>';
      return null;
    }
    $('#emptyState').hidden = true;
    $('#summary').innerHTML = '';
    $('#results').innerHTML = '';
    $('#progressWrap').hidden = false;
    $('#progressFill').style.width = '0%';
    $('#statusLine').textContent = 'Warming up the browser…';
    setBusy(true);
    return true;
  }

  function finishSearch() {
    setBusy(false);
    if (state.es) { state.es.close(); state.es = null; }
  }

  function attachCommon(es, total) {
    es.addEventListener('park_start', (e) => {
      const d = JSON.parse(e.data);
      $('#progressFill').style.width = `${Math.round((d.index / d.total) * 100)}%`;
      $('#statusLine').textContent = `Checking ${d.park}… (${d.index + 1} of ${d.total} parks)`;
    });
    es.addEventListener('error', (e) => {
      if (e.data) {
        $('#summary').innerHTML = `<div class="banner banner-error">Search failed: ${escapeHtml(JSON.parse(e.data).error)}</div>`;
      } else if (es.readyState === EventSource.CLOSED) {
        $('#statusLine').textContent = 'Connection lost.';
      }
      finishSearch();
    });
  }

  function siteRowHtml(s) {
    const meta = [s.area, s.access, s.maxPeople ? `max ${s.maxPeople} ppl` : '', s.cost]
      .filter(Boolean).map(escapeHtml).join(' · ');
    const badges = [
      s.types ? `<span class="badge">${escapeHtml(s.types)}</span>` : '',
      s.flush ? '<span class="badge badge-flush">🚽 Flush</span>' : '',
      s.shower ? '<span class="badge badge-shower">🚿 Shower</span>' : '',
    ].filter(Boolean).join('');
    const name = escapeHtml(s.shortName || s.name);
    const full = s.name && s.name !== s.shortName ? ` <span class="site-meta">${escapeHtml(s.name)}</span>` : '';
    return `<div class="site-row">
      <div class="site-main"><div class="site-name">${name}${full}</div><div class="site-meta">${meta}</div></div>
      <div class="badges">${badges}</div>
    </div>`;
  }

  // ----- specific-date search -----

  function runDateSearch() {
    if (!beginSearch()) return;
    const q = commonQuery();
    q.set('date', $('#dateInput').value);
    q.set('nights', $('#nightsInput').value);
    q.set('minPeople', $('#minPeopleD').value || '0');

    const results = [];
    const es = new EventSource(`/api/search?${q}`);
    state.es = es;
    attachCommon(es);

    es.addEventListener('park_result', (e) => {
      const r = JSON.parse(e.data);
      results.push(r);
      renderDateResults(results);
    });

    es.addEventListener('done', (e) => {
      const d = JSON.parse(e.data);
      $('#progressFill').style.width = '100%';
      $('#statusLine').textContent = `Done in ${(d.elapsedMs / 1000).toFixed(0)}s.`;
      const date = $('#dateInput').value;
      const nights = $('#nightsInput').value;
      if (d.availableCount > 0) {
        $('#summary').innerHTML = `<div class="banner banner-summary">✅ ${plural(d.availableCount, 'site')} available across ${plural(d.parksWithSites, 'park')} for ${fmtDate(date)}, ${plural(+nights, 'night')}.</div>`;
      } else {
        $('#summary').innerHTML = `<div class="banner banner-error">${emptyExplanation('No available sites found for these dates and filters.')}</div>`;
      }
      finishSearch();
    });
  }

  function renderDateResults(results) {
    const sorted = [...results].sort((a, b) => (b.sites?.length || 0) - (a.sites?.length || 0));
    $('#results').innerHTML = sorted.map((r) => {
      if (r.error) {
        return `<div class="card card-muted"><div class="card-head"><div class="card-title">⚠️ ${escapeHtml(r.park)} — couldn’t be checked (${escapeHtml(r.error)})</div></div></div>`;
      }
      if (r.skipped) {
        return `<div class="card card-muted"><div class="card-head"><div class="card-title">${escapeHtml(r.park)} — doesn’t offer the selected site types</div></div></div>`;
      }
      const shown = r.sites.slice(0, 8);
      const more = r.sites.length - shown.length;
      return `<div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${escapeHtml(r.park)}</div>
            <div class="card-sub">${r.sites.length} of ${plural(r.totalMatching, 'matching site')} available</div>
          </div>
          <a class="btn-book" href="${escapeHtml(r.bookUrl)}" target="_blank" rel="noopener">Book ↗</a>
        </div>
        ${shown.length ? `<div class="park-section">${shown.map(siteRowHtml).join('')}${more > 0 ? `<div class="more-note">…and ${plural(more, 'more site')}</div>` : ''}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ----- weekend recommender -----

  function runWeekendSearch() {
    if (!beginSearch()) return;
    const q = commonQuery();
    q.set('month', $('#monthSelect').value);
    q.set('arrival', $('#weekendStyle').value);
    q.set('minPeople', $('#minPeopleW').value || '0');

    const es = new EventSource(`/api/recommend?${q}`);
    state.es = es;
    attachCommon(es);

    const parkNotes = [];
    es.addEventListener('park_result', (e) => {
      const r = JSON.parse(e.data);
      if (!r.error && !r.skipped) {
        parkNotes.push(`${r.park}: ${r.totalSiteWeekends}`);
        $('#statusLine').textContent = `Latest — ${parkNotes.slice(-3).join(' · ')} site-weekends`;
      }
    });

    es.addEventListener('done', (e) => {
      const d = JSON.parse(e.data);
      $('#progressFill').style.width = '100%';
      $('#statusLine').textContent = `Done in ${(d.elapsedMs / 1000).toFixed(0)}s.`;
      renderWeekendResults(d.weekends);
      finishSearch();
    });
  }

  function emptyExplanation(prefix) {
    const minStay = state.meta.minStayTypeIds.some((id) => state.types.has(id));
    if (minStay) {
      return `${escapeHtml(prefix)} Heads up: in peak season (mid-June–Labor&nbsp;Day), <strong>cabins, lean-tos and shelters can only be booked 7 or 14 nights starting on a fixed weekday</strong> that varies by park — short weekend stays are usually blocked. Try the <strong>Tent</strong> or <strong>Trailer</strong> site types instead, or search a 7-night stay in Specific dates mode.`;
    }
    return escapeHtml(prefix);
  }

  function renderWeekendResults(weekends) {
    if (!weekends.length) {
      $('#summary').innerHTML = `<div class="banner banner-error">${emptyExplanation('No upcoming weekends left in that month.')}</div>`;
      return;
    }
    const best = weekends.reduce((a, b) => (b.totalSites > a.totalSites ? b : a));
    if (best.totalSites > 0) {
      $('#summary').innerHTML = `<div class="banner banner-summary">🏆 Best weekend: <strong>${fmtDate(best.arrival)} → ${fmtDate(best.checkout)}</strong> with ${plural(best.totalSites, 'available site')} across ${plural(best.parks.length, 'park')}.</div>`;
    } else {
      $('#summary').innerHTML = `<div class="banner banner-error">${emptyExplanation('No weekend availability found for these filters.')}</div>`;
    }

    $('#results').innerHTML = weekends.map((w) => {
      const head = `🗓️ ${fmtDate(w.arrival)} → ${fmtDate(w.checkout)} · ${plural(w.nights, 'night')} · ${plural(w.totalSites, 'site')}${w.totalSites ? ` across ${plural(w.parks.length, 'park')}` : ''}`;
      if (!w.totalSites) {
        return `<div class="card card-muted"><div class="card-head"><div class="card-title">${head} — nothing available</div></div></div>`;
      }
      const sections = w.parks.map((p) => {
        const shown = p.sites.slice(0, 4);
        const more = p.sites.length - shown.length;
        return `<div class="park-section">
          <div class="park-section-head">
            <div class="park-section-title">${escapeHtml(p.park)} · <span class="count">${plural(p.count, 'site')}</span></div>
            <a class="link-book" href="${escapeHtml(p.bookUrl)}" target="_blank" rel="noopener">Book ↗</a>
          </div>
          ${shown.map(siteRowHtml).join('')}
          ${more > 0 ? `<div class="more-note">…and ${plural(more, 'more site')}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="card"><div class="card-head"><div class="card-title">${head}</div></div>${sections}</div>`;
    }).join('');
  }

  // ---------- natural-language search ----------

  async function runNlSearch() {
    const query = $('#nlInput').value.trim();
    if (!query) return;
    const note = $('#nlNote');
    const btn = $('#nlBtn');
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    note.hidden = false;
    note.textContent = '✨ Interpreting your request…';
    try {
      const r = await fetch('/api/nl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      applyNlParams(data.params);
      note.textContent = `✨ ${data.params.note || 'Got it — searching now.'}`;
      state.mode === 'weekend' ? runWeekendSearch() : runDateSearch();
    } catch (err) {
      note.textContent = `⚠️ ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ask';
    }
  }

  function applyNlParams(p) {
    // mode
    const tab = document.querySelector(`.mode-tab[data-mode="${p.mode}"]`);
    if (tab) tab.click();

    // dates
    if (p.mode === 'weekend') {
      const monthSel = $('#monthSelect');
      if (p.month && [...monthSel.options].some((o) => o.value === p.month)) monthSel.value = p.month;
      $('#weekendStyle').value = String(p.arrival || 5);
      $('#minPeopleW').value = String(p.minPeople || 0);
    } else {
      if (p.date && p.date >= state.meta.today) $('#dateInput').value = p.date;
      $('#nightsInput').value = String(p.nights || 2);
      $('#minPeopleD').value = String(p.minPeople || 0);
    }

    // filters
    state.types = new Set(p.types.length ? p.types : [1]);
    state.features = new Set(p.features);
    state.flushOnly = Boolean(p.flushOnly);
    state.parks = new Set(p.parks.length ? p.parks : state.meta.parks.map((x) => x.id));

    renderTypeChips();
    renderParkChips();
    renderComfortChips();
    renderFeatureChips();
    updateMinStayBanner();
  }

  // ---------- wire up ----------

  $('#searchBtnW').addEventListener('click', runWeekendSearch);
  $('#searchBtnD').addEventListener('click', runDateSearch);
  $('#nlBtn').addEventListener('click', runNlSearch);
  $('#nlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runNlSearch();
  });

  boot().catch((err) => {
    $('#summary').innerHTML = `<div class="banner banner-error">Failed to load app metadata: ${escapeHtml(err.message)}</div>`;
  });
})();
