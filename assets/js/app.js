(function () {
  const STORAGE_KEY = "profit-calculator-coins";
  const SHEET_URL_KEY = "profit-calculator-sheet-url";
  const createSection = document.getElementById("create-section");
  const historySection = document.getElementById("history-section");
  const activeSection = document.getElementById("active-section");
  const headerSection = document.getElementById("header-section");
  const settingsModal = document.getElementById("settings-modal");
  document.getElementById("cpy-year").textContent = new Date().getFullYear();

  const syncTimers = new Map();
  const syncStatus = new Map();
  let modalOpen = false;

  const GEAR_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
    '<circle cx="12" cy="12" r="3"/></svg>';

  function defaultState() {
    return { coins: [], activeCoinId: null };
  }

  function migrateEntry(entry) {
    if (!entry.status) entry.status = "open";
    if (entry.closedAt === undefined) entry.closedAt = null;
    if (entry.closingProfit === undefined) entry.closingProfit = null;
    if (entry.closingPct === undefined) entry.closingPct = null;
    return entry;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const coins = (Array.isArray(parsed.coins) ? parsed.coins : []).map(function (coin) {
        coin.entries = (coin.entries || []).map(migrateEntry);
        return coin;
      });
      const validId = coins.some(function (c) { return c.id === parsed.activeCoinId; });
      return {
        coins: coins,
        activeCoinId: validId ? parsed.activeCoinId : coins[0]?.id || null
      };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function getSheetUrl() {
    return (localStorage.getItem(SHEET_URL_KEY) || "").trim();
  }

  function setSheetUrl(url) {
    localStorage.setItem(SHEET_URL_KEY, url.trim());
  }

  function newId() {
    return crypto.randomUUID();
  }

  function newEntry() {
    return {
      id: newId(),
      invested: null,
      entryPrice: null,
      targetPrice: null,
      createdAt: new Date().toISOString(),
      status: "open",
      closedAt: null,
      closingProfit: null,
      closingPct: null
    };
  }

  function newCoin(name) {
    return {
      id: newId(),
      name: name,
      currentPrice: null,
      createdAt: new Date().toISOString(),
      entries: [newEntry()]
    };
  }

  let state = loadState();

  function parseInput(val) {
    const v = String(val).trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  function formatMoney(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function colorClass(profit) {
    return profit > 0 ? "profit" : profit < 0 ? "loss" : "neutral";
  }

  function formatResult(data) {
    if (!data.ok) {
      return {
        profitHtml: '<span class="result-value neutral">—</span>',
        pctHtml: "",
        totalHtml: "—"
      };
    }
    const sign = data.profit >= 0 ? "+" : "";
    const cls = colorClass(data.profit);
    return {
      profitHtml: '<span class="result-value ' + cls + '">' + sign + formatMoney(data.profit) + "</span>",
      pctHtml: '<div class="result-pct ' + cls + '">' + sign + data.pct.toFixed(2) + "%</div>",
      totalHtml: formatMoney(data.totalValue)
    };
  }

  function calcEntry(entry, price) {
    const invested = entry.invested;
    const entryPrice = entry.entryPrice;
    if (invested === null || entryPrice === null || price === null) {
      return { ok: false };
    }
    if (invested < 0 || entryPrice < 0 || price < 0) {
      return { ok: false, error: "Values must be zero or positive." };
    }
    if (entryPrice === 0) {
      return { ok: false, error: "Entry price cannot be zero." };
    }
    const profit = (invested / entryPrice) * price - invested;
    const pct = invested > 0 ? (profit / invested) * 100 : 0;
    return { ok: true, profit: profit, pct: pct, totalValue: invested + profit };
  }

  function calcAggregates(coin) {
    let totalInvested = 0;
    let profitCurrent = 0;
    let profitTarget = 0;
    let hasCurrent = false;
    let hasTarget = false;
    for (const entry of coin.entries) {
      if (entry.invested !== null) totalInvested += entry.invested;
      const cur = calcEntry(entry, coin.currentPrice);
      const tgt = calcEntry(entry, entry.targetPrice);
      if (cur.ok) { profitCurrent += cur.profit; hasCurrent = true; }
      if (tgt.ok) { profitTarget += tgt.profit; hasTarget = true; }
    }
    return {
      totalInvested: totalInvested,
      profitCurrent: hasCurrent ? profitCurrent : null,
      pctCurrent: hasCurrent && totalInvested > 0 ? (profitCurrent / totalInvested) * 100 : null,
      profitTarget: hasTarget ? profitTarget : null,
      pctTarget: hasTarget && totalInvested > 0 ? (profitTarget / totalInvested) * 100 : null
    };
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function getActiveCoin() {
    return state.coins.find(function (c) { return c.id === state.activeCoinId; }) || null;
  }

  function inputVal(n) {
    return n === null ? "" : String(n);
  }

  function buildSheetPayload(coin, entry) {
    const cur = calcEntry(entry, coin.currentPrice);
    const tgt = calcEntry(entry, entry.targetPrice);
    const payload = {
      action: entry.status === "closed" ? "close" : "upsert",
      entryId: entry.id,
      coinName: coin.name,
      invested: entry.invested,
      entryPrice: entry.entryPrice,
      targetPrice: entry.targetPrice,
      profitLoss: cur.ok ? cur.profit : null,
      percentage: cur.ok ? cur.pct : null,
      totalAtTarget: tgt.ok ? tgt.totalValue : null,
      status: entry.status,
      closingDate: entry.closedAt ? formatDate(entry.closedAt) : "",
      closingProfitLoss: entry.closingProfit
    };
    return payload;
  }

  function setSyncStatus(entryId, status) {
    syncStatus.set(entryId, status);
    const badge = activeSection.querySelector('[data-sync-id="' + entryId + '"]');
    if (!badge) return;
    badge.className = "sync-badge sync-" + status;
    badge.textContent = status === "syncing" ? "syncing…" : status === "synced" ? "synced" : status === "error" ? "error" : "";
  }

  function syncEntry(coin, entry, action) {
    const url = getSheetUrl();
    if (!url) return Promise.resolve();

    const payload = buildSheetPayload(coin, entry);
    if (action) payload.action = action;
    if (action === "delete") {
      payload.action = "delete";
    }

    setSyncStatus(entry.id, "syncing");

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.ok) {
          setSyncStatus(entry.id, "synced");
        } else {
          setSyncStatus(entry.id, "error");
        }
      })
      .catch(function () {
        setSyncStatus(entry.id, "error");
      });
  }

  function debouncedSync(coin, entry) {
    if (entry.status === "closed") return;
    const key = entry.id;
    if (syncTimers.has(key)) clearTimeout(syncTimers.get(key));
    syncTimers.set(key, setTimeout(function () {
      syncTimers.delete(key);
      syncEntry(coin, entry, "upsert");
    }, 500));
  }

  function syncAllOpenEntries(coin) {
    if (!getSheetUrl()) return;
    coin.entries.forEach(function (entry) {
      if (entry.status === "open") debouncedSync(coin, entry);
    });
  }

  function syncDeleteEntry(entryId) {
    const url = getSheetUrl();
    if (!url) return Promise.resolve();
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "delete", entryId: entryId })
    }).catch(function () {});
  }

  function syncDeleteCoinEntries(coin) {
    if (!getSheetUrl()) return Promise.resolve();
    return Promise.all(coin.entries.map(function (entry) {
      return syncDeleteEntry(entry.id);
    }));
  }

  let pullStatus = "";

  function setPullStatus(status) {
    pullStatus = status;
    const el = document.getElementById("pull-status");
    if (!el) return;
    el.className = status ? "pull-status pull-" + status : "pull-status";
    el.textContent = status === "pulling" ? "Pulling…" : status === "done" ? "Synced" : status === "error" ? "Pull failed" : "";
  }

  function sheetRowToEntry(row) {
    const invested = row.invested;
    const closingProfit = row.closingProfitLoss;
    const isClosed = row.status === "closed";
    let closedAt = null;
    if (row.closingDate) {
      const d = new Date(row.closingDate);
      if (!Number.isNaN(d.getTime())) closedAt = d.toISOString();
    }
    return migrateEntry({
      id: row.entryId || newId(),
      invested: invested,
      entryPrice: row.entryPrice,
      targetPrice: row.targetPrice,
      createdAt: closedAt || new Date().toISOString(),
      status: isClosed ? "closed" : "open",
      closedAt: closedAt,
      closingProfit: closingProfit,
      closingPct: invested && closingProfit != null ? (closingProfit / invested) * 100 : null
    });
  }

  function applySheetRows(rows) {
    const coinMap = new Map();
    for (const row of rows) {
      if (!row.coinName) continue;
      let coin = coinMap.get(row.coinName);
      if (!coin) {
        coin = {
          id: newId(),
          name: row.coinName,
          currentPrice: null,
          createdAt: new Date().toISOString(),
          entries: []
        };
        coinMap.set(row.coinName, coin);
      }
      coin.entries.push(sheetRowToEntry(row));
    }
    state.coins = Array.from(coinMap.values());
    state.activeCoinId = state.coins[0]?.id || null;
    syncStatus.clear();
    saveState();
    render();
  }

  function pullFromSheet() {
    const url = getSheetUrl();
    if (!url) {
      alert("Enter Apps Script URL first.");
      return;
    }
    if (state.coins.length && !confirm("Replace local data with data from Google Sheet?")) return;
    setPullStatus("pulling");
    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) {
          setPullStatus("error");
          alert(data.error || "Pull failed.");
          return;
        }
        applySheetRows(data.rows || []);
        setPullStatus("done");
        setTimeout(function () { setPullStatus(""); }, 3000);
      })
      .catch(function () {
        setPullStatus("error");
        alert("Could not reach Google Sheet. Check URL and redeploy the script.");
      });
  }

  function renderHeader() {
    if (!headerSection) return;
    headerSection.innerHTML =
      '<div class="card-header">' +
      '<h1>Profit calculator</h1>' +
      '<div class="header-actions">' +
      '<button type="button" class="btn" data-action="pull-sheet">Sync</button>' +
      '<span id="pull-status" class="pull-status' + (pullStatus ? " pull-" + pullStatus : "") + '">' +
      (pullStatus === "pulling" ? "Pulling…" : pullStatus === "done" ? "Synced" : pullStatus === "error" ? "Pull failed" : "") +
      "</span>" +
      '<button type="button" class="btn-icon" data-action="open-settings" aria-label="Settings">' + GEAR_ICON + "</button>" +
      "</div></div>";
  }

  function renderSettingsModal() {
    if (!settingsModal) return;
    settingsModal.innerHTML =
      '<div class="modal-backdrop" data-action="close-settings"></div>' +
      '<div class="modal" role="dialog" aria-labelledby="settings-title">' +
      '<div class="modal-header">' +
      '<h2 id="settings-title">Settings</h2>' +
      '<button type="button" class="btn-icon modal-close" data-action="close-settings" aria-label="Close">&times;</button>' +
      "</div>" +
      '<label for="sheet-url-input">Apps Script web app URL</label>' +
      '<input type="text" id="sheet-url-input" data-field="sheetUrl" placeholder="https://script.google.com/macros/s/…/exec" value="' + escapeHtml(getSheetUrl()) + '" />' +
      '<p class="settings-hint">Paste your deployed Google Apps Script URL. Entries auto-sync on change.</p>' +
      "</div>";
    settingsModal.classList.toggle("hidden", !modalOpen);
    settingsModal.setAttribute("aria-hidden", modalOpen ? "false" : "true");
  }

  function openSettings() {
    modalOpen = true;
    renderSettingsModal();
    const input = document.getElementById("sheet-url-input");
    if (input) input.focus();
  }

  function closeSettings() {
    modalOpen = false;
    if (settingsModal) {
      settingsModal.classList.add("hidden");
      settingsModal.setAttribute("aria-hidden", "true");
    }
  }

  function renderCreate() {
    createSection.innerHTML =
      '<div class="section">' +
      '<div class="section-title">Create coin instance</div>' +
      '<div class="create-row">' +
      '<input type="text" id="coin-name-input" placeholder="e.g. BTC" maxlength="50" />' +
      '<button type="button" class="btn" data-action="create-coin">Create</button>' +
      "</div></div>";
  }

  function renderHistory() {
    let html = '<div class="section"><div class="section-title">Coin history</div>';
    if (state.coins.length === 0) {
      html += '<p class="empty-msg">No coins yet. Create one above.</p>';
    } else {
      html += '<div class="coin-list">';
      for (const coin of state.coins) {
        const active = coin.id === state.activeCoinId ? " active" : "";
        html +=
          '<div class="coin-item' + active + '" data-action="select-coin" data-coin-id="' + coin.id + '">' +
          '<div class="coin-item-info">' +
          '<div class="coin-item-name">' + escapeHtml(coin.name) + "</div>" +
          '<div class="coin-item-meta">' + formatDate(coin.createdAt) + " · " + coin.entries.length + " instance" + (coin.entries.length !== 1 ? "s" : "") + "</div>" +
          "</div>" +
          '<button type="button" class="btn-danger" data-action="delete-coin" data-coin-id="' + coin.id + '">Delete</button>' +
          "</div>";
      }
      html += "</div>";
    }
    html += "</div>";
    historySection.innerHTML = html;
  }

  function syncBadgeHtml(entryId) {
    const status = syncStatus.get(entryId);
    if (!status || !getSheetUrl()) return "";
    return '<span class="sync-badge sync-' + status + '" data-sync-id="' + entryId + '">' +
      (status === "syncing" ? "syncing…" : status === "synced" ? "synced" : status === "error" ? "error" : "") +
      "</span>";
  }

  function renderEntry(coin, entry, index) {
    const isClosed = entry.status === "closed";
    const cur = calcEntry(entry, coin.currentPrice);
    const tgt = calcEntry(entry, entry.targetPrice);
    const curFmt = formatResult(cur);
    const tgtFmt = formatResult(tgt);
    const err = (!cur.ok && cur.error) || (!tgt.ok && tgt.error) || "";
    const canDelete = coin.entries.length > 1;
    const disabled = isClosed ? " disabled" : "";
    const closedClass = isClosed ? " entry-closed" : "";

    let headerActions = "";
    if (isClosed) {
      headerActions = '<span class="closed-badge">Closed · ' + formatDate(entry.closedAt) + "</span>";
    } else {
      headerActions = '<button type="button" class="btn-ghost" data-action="close-entry" data-entry-id="' + entry.id + '">Close</button>';
    }
    if (canDelete) {
      headerActions += '<button type="button" class="btn-danger" data-action="delete-entry" data-entry-id="' + entry.id + '">Remove</button>';
    }

    return (
      '<div class="entry-row' + closedClass + '" data-entry-id="' + entry.id + '">' +
      '<div class="entry-header">' +
      '<span class="entry-title">Instance ' + (index + 1) + " · " + formatDate(entry.createdAt) + "</span>" +
      '<div class="entry-actions">' + syncBadgeHtml(entry.id) + headerActions + "</div>" +
      "</div>" +
      '<div class="entry-fields">' +
      '<div><label>Invested</label><input type="number" data-field="invested" data-entry-id="' + entry.id + '" inputmode="decimal" min="0" step="any" placeholder="1000" value="' + inputVal(entry.invested) + '"' + disabled + " /></div>" +
      '<div><label>Entry</label><input type="number" data-field="entryPrice" data-entry-id="' + entry.id + '" inputmode="decimal" min="0" step="any" placeholder="50" value="' + inputVal(entry.entryPrice) + '"' + disabled + " /></div>" +
      '<div><label>Target</label><input type="number" data-field="targetPrice" data-entry-id="' + entry.id + '" inputmode="decimal" min="0" step="any" placeholder="65" value="' + inputVal(entry.targetPrice) + '"' + disabled + " /></div>" +
      "</div>" +
      (err ? '<div class="entry-error">' + escapeHtml(err) + "</div>" : "") +
      '<div class="entry-results">' +
      '<div class="result result-compact" data-result="current" data-entry-id="' + entry.id + '">' +
      '<div class="result-label">At current</div>' +
      curFmt.profitHtml + curFmt.pctHtml +
      '<div class="result-total">Total: ' + curFmt.totalHtml + "</div>" +
      "</div>" +
      '<div class="result result-compact" data-result="target" data-entry-id="' + entry.id + '">' +
      '<div class="result-label">At target</div>' +
      tgtFmt.profitHtml + tgtFmt.pctHtml +
      '<div class="result-total">Total: ' + tgtFmt.totalHtml + "</div>" +
      "</div></div>" +
      (isClosed && entry.closingProfit !== null ?
        '<div class="closing-result">Closing P/L: <span class="' + colorClass(entry.closingProfit) + '">' +
        (entry.closingProfit >= 0 ? "+" : "") + formatMoney(entry.closingProfit) +
        (entry.closingPct !== null ? " (" + (entry.closingPct >= 0 ? "+" : "") + entry.closingPct.toFixed(2) + "%)" : "") +
        "</span></div>" : "") +
      "</div>"
    );
  }

  function renderTotals(coin) {
    const agg = calcAggregates(coin);
    function aggBlock(label, profit, pct) {
      if (profit === null) {
        return '<div class="result result-compact"><div class="result-label">' + label + '</div><span class="result-value neutral">—</span></div>';
      }
      const sign = profit >= 0 ? "+" : "";
      const cls = colorClass(profit);
      const pctStr = pct !== null ? '<div class="result-pct ' + cls + '">' + sign + pct.toFixed(2) + "%</div>" : "";
      return (
        '<div class="result result-compact">' +
        '<div class="result-label">' + label + "</div>" +
        '<span class="result-value ' + cls + '">' + sign + formatMoney(profit) + "</span>" +
        pctStr +
        '<div class="result-total">Invested: ' + formatMoney(agg.totalInvested) + "</div>" +
        "</div>"
      );
    }
    return (
      '<div class="totals"><div class="section-title">Combined totals</div>' +
      '<div class="totals-grid">' +
      aggBlock("At current", agg.profitCurrent, agg.pctCurrent) +
      aggBlock("At target", agg.profitTarget, agg.pctTarget) +
      "</div></div>"
    );
  }

  function renderActive() {
    const coin = getActiveCoin();
    if (!coin) {
      activeSection.innerHTML = "";
      return;
    }
    let html =
      '<div class="section">' +
      '<div class="active-toolbar">' +
      '<h2 class="active-coin-name">' + escapeHtml(coin.name) + "</h2>" +
      '<div class="current-price-wrap"><label for="current-price">Current price</label>' +
      '<input type="number" id="current-price" data-field="currentPrice" inputmode="decimal" min="0" step="any" placeholder="55" value="' + inputVal(coin.currentPrice) + '" /></div>' +
      "</div>" +
      '<div class="active-actions"><div class="section-title" style="margin:0">Instances</div>' +
      '<button type="button" class="btn" data-action="add-entry">+ Add</button></div>' +
      '<div class="entries-grid">';
    coin.entries.forEach(function (entry, i) { html += renderEntry(coin, entry, i); });
    html += "</div>" + renderTotals(coin) + "</div>";
    activeSection.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function render() {
    renderHeader();
    renderCreate();
    renderHistory();
    renderActive();
    if (modalOpen) renderSettingsModal();
  }

  function updateEntryResults(coin, entry) {
    const cur = calcEntry(entry, coin.currentPrice);
    const tgt = calcEntry(entry, entry.targetPrice);
    const curFmt = formatResult(cur);
    const tgtFmt = formatResult(tgt);
    const row = activeSection.querySelector('[data-entry-id="' + entry.id + '"].entry-row');
    if (!row) return;
    const errEl = row.querySelector(".entry-error");
    const err = (!cur.ok && cur.error) || (!tgt.ok && tgt.error) || "";
    if (err) {
      if (!errEl) {
        const el = document.createElement("div");
        el.className = "entry-error";
        el.textContent = err;
        row.querySelector(".entry-fields").after(el);
      } else {
        errEl.textContent = err;
      }
    } else if (errEl) {
      errEl.remove();
    }
    const curBox = row.querySelector('[data-result="current"]');
    const tgtBox = row.querySelector('[data-result="target"]');
    if (curBox) {
      curBox.innerHTML = '<div class="result-label">At current</div>' + curFmt.profitHtml + curFmt.pctHtml + '<div class="result-total">Total: ' + curFmt.totalHtml + "</div>";
    }
    if (tgtBox) {
      tgtBox.innerHTML = '<div class="result-label">At target</div>' + tgtFmt.profitHtml + tgtFmt.pctHtml + '<div class="result-total">Total: ' + tgtFmt.totalHtml + "</div>";
    }
  }

  function updateTotals() {
    const coin = getActiveCoin();
    if (!coin) return;
    const totalsEl = activeSection.querySelector(".totals");
    if (totalsEl) {
      const tmp = document.createElement("div");
      tmp.innerHTML = renderTotals(coin);
      totalsEl.replaceWith(tmp.firstElementChild);
    }
  }

  function updateAllEntryResults() {
    const coin = getActiveCoin();
    if (!coin) return;
    coin.entries.forEach(function (entry) { updateEntryResults(coin, entry); });
    updateTotals();
  }

  document.getElementById("app").addEventListener("click", function (e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "pull-sheet") {
      pullFromSheet();
      return;
    }

    if (action === "open-settings") {
      openSettings();
      return;
    }

    if (action === "close-settings") {
      closeSettings();
      return;
    }

    if (action === "create-coin") {
      const input = document.getElementById("coin-name-input");
      const name = input.value.trim();
      if (!name) return;
      const coin = newCoin(name);
      state.coins.unshift(coin);
      state.activeCoinId = coin.id;
      saveState();
      render();
      debouncedSync(coin, coin.entries[0]);
      return;
    }

    if (action === "select-coin") {
      if (e.target.closest("[data-action=delete-coin]")) return;
      state.activeCoinId = btn.dataset.coinId;
      saveState();
      renderHistory();
      renderActive();
      return;
    }

    if (action === "delete-coin") {
      e.stopPropagation();
      const id = btn.dataset.coinId;
      const coin = state.coins.find(function (c) { return c.id === id; });
      if (!coin || !confirm('Delete "' + coin.name + '" and all its instances?')) return;
      syncDeleteCoinEntries(coin).then(function () {
        state.coins = state.coins.filter(function (c) { return c.id !== id; });
        if (state.activeCoinId === id) {
          state.activeCoinId = state.coins[0]?.id || null;
        }
        saveState();
        render();
      });
      return;
    }

    if (action === "delete-entry") {
      const coin = getActiveCoin();
      if (!coin || coin.entries.length <= 1) return;
      const entryId = btn.dataset.entryId;
      if (!confirm("Remove this instance?")) return;
      syncDeleteEntry(entryId).then(function () {
        coin.entries = coin.entries.filter(function (en) { return en.id !== entryId; });
        syncStatus.delete(entryId);
        saveState();
        renderActive();
        renderHistory();
      });
      return;
    }

    if (action === "close-entry") {
      const coin = getActiveCoin();
      if (!coin) return;
      const entryId = btn.dataset.entryId;
      const entry = coin.entries.find(function (en) { return en.id === entryId; });
      if (!entry || entry.status === "closed") return;
      const cur = calcEntry(entry, coin.currentPrice);
      if (!cur.ok) {
        alert("Enter invested, entry price, and current price before closing.");
        return;
      }
      if (!confirm("Close this entry at current price?")) return;
      entry.status = "closed";
      entry.closedAt = new Date().toISOString();
      entry.closingProfit = cur.profit;
      entry.closingPct = cur.pct;
      saveState();
      renderActive();
      syncEntry(coin, entry, "close");
      return;
    }

    if (action === "add-entry") {
      const coin = getActiveCoin();
      if (!coin) return;
      const entry = newEntry();
      coin.entries.push(entry);
      saveState();
      renderActive();
      renderHistory();
      debouncedSync(coin, entry);
      return;
    }
  });

  document.getElementById("app").addEventListener("input", function (e) {
    const el = e.target;
    const field = el.dataset.field;
    if (!field) return;

    if (field === "sheetUrl") {
      setSheetUrl(el.value);
      return;
    }

    if (field === "currentPrice") {
      const coin = getActiveCoin();
      if (!coin) return;
      coin.currentPrice = parseInput(el.value);
      saveState();
      updateAllEntryResults();
      syncAllOpenEntries(coin);
      return;
    }

    const entryId = el.dataset.entryId;
    if (!entryId) return;
    const coin = getActiveCoin();
    if (!coin) return;
    const entry = coin.entries.find(function (en) { return en.id === entryId; });
    if (!entry || entry.status === "closed") return;
    entry[field] = parseInput(el.value);
    saveState();
    updateEntryResults(coin, entry);
    updateTotals();
    debouncedSync(coin, entry);
  });

  render();
  renderSettingsModal();
})();
