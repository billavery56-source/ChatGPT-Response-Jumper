(() => {
  "use strict";

  // -------------------------
  // State classes for CSS
  // -------------------------
  const HTML_ON_CLASS = "bbj-rj-3col";
  const HTML_COLLAPSED_CLASS = "bbj-rj-collapsed";

  // -------------------------
  // LocalStorage keys
  // -------------------------
  const LS_COLLAPSED_KEY = "bbj_rj_collapsed";
  const LS_FILTER_KEY = "bbj_rj_filter";
  const LS_DEBUG_KEY = "bbj_rj_debug"; // set to "1" to enable logs

  // -------------------------
  // IDs / classes
  // -------------------------
  const RAIL_ID = "bbj-rj-rail";
  const PANEL_ID = "bbj-rj-panel";
  const HEADER_ID = "bbj-rj-header";
  const TITLE_ID = "bbj-rj-title";
  const BTN_LATEST_ID = "bbj-rj-btn";
  const BTN_TOGGLE_ID = "bbj-rj-toggle";
  const SEARCH_ID = "bbj-rj-search";
  const LIST_ID = "bbj-rj-list";

  const ITEM_CLASS = "bbj-rj-item";
  const MUTED_CLASS = "bbj-rj-muted";
  const FLASH_CLASS = "bbj-rj-flash";

  const CODE_PENDING_CLASS = "bbj-code-pending";
  const CODE_READY_CLASS = "bbj-code-ready";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const debugOn = () => localStorage.getItem(LS_DEBUG_KEY) === "1";
  const log = (...args) => debugOn() && console.log("[BBJ]", ...args);

  // -------------------------
  // Boot
  // -------------------------
  function ensureHtmlClass() {
    document.documentElement.classList.add(HTML_ON_CLASS);
  }

  // Ensure rail exists. We do NOT set width/position/etc here (CSS owns sizing),
  // but we DO enforce clickability on the panel regardless of rail pointer-events.
  function ensureRail() {
    let rail = document.getElementById(RAIL_ID);
    if (rail) return rail;

    rail = document.createElement("div");
    rail.id = RAIL_ID;

    // If your CSS sets rail pointer-events:none (common), that's fine.
    // We append panel inside and force the panel to pointer-events:auto below.
    document.documentElement.appendChild(rail);
    return rail;
  }

  function ensurePanel() {
    ensureHtmlClass();
    const rail = ensureRail();

    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;

    // Force clickability regardless of rail hit-testing
    panel.style.pointerEvents = "auto";

    const header = document.createElement("div");
    header.id = HEADER_ID;

    const title = document.createElement("div");
    title.id = TITLE_ID;
    title.textContent = "Responses";

    const btnLatest = document.createElement("button");
    btnLatest.id = BTN_LATEST_ID;
    btnLatest.type = "button";
    btnLatest.textContent = "Latest";
    btnLatest.title = "Jump to latest assistant response";

    const btnToggle = document.createElement("button");
    btnToggle.id = BTN_TOGGLE_ID;
    btnToggle.type = "button";
    btnToggle.textContent = "–";
    btnToggle.title = "Collapse / expand";

    header.appendChild(title);
    header.appendChild(btnLatest);
    header.appendChild(btnToggle);

    const search = document.createElement("input");
    search.id = SEARCH_ID;
    search.type = "search";
    search.placeholder = "Filter…";
    search.value = localStorage.getItem(LS_FILTER_KEY) || "";

    const list = document.createElement("div");
    list.id = LIST_ID;
    list.style.pointerEvents = "auto"; // extra safety

    panel.appendChild(header);
    panel.appendChild(search);
    panel.appendChild(list);
    rail.appendChild(panel);

    // Restore collapsed state
    setCollapsed(localStorage.getItem(LS_COLLAPSED_KEY) === "1");

    // Wire buttons
    btnLatest.addEventListener("click", () => jumpToLatest());
    btnToggle.addEventListener("click", () => setCollapsed(!isCollapsed()));

    // Filter
    search.addEventListener(
      "input",
      () => {
        localStorage.setItem(LS_FILTER_KEY, search.value);
        rebuildList("filter");
      },
      { passive: true }
    );

    // ✅ Event delegation: one click handler for the whole list
    list.addEventListener("click", (e) => {
      const item = e.target?.closest?.(`.${ITEM_CLASS}`);
      if (!item) return;

      const idxStr = item.getAttribute("data-bbj-index");
      const idx = idxStr ? parseInt(idxStr, 10) : NaN;
      if (!Number.isFinite(idx)) return;

      const targets = getAssistantTargets();
      const t = targets[idx];
      if (!t) return;

      log("Clicked item -> jump", { idx, snippet: t.snippet });
      jumpToTurn(t.turn);
    });

    // Optional: Alt+J focuses filter
    window.addEventListener("keydown", (e) => {
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setCollapsed(false);
        search.focus();
        search.select();
      }
    });

    return panel;
  }

  function isCollapsed() {
    const panel = document.getElementById(PANEL_ID);
    return !!panel && panel.classList.contains("bbj-collapsed");
  }

  function setCollapsed(collapsed) {
    const panel = ensurePanel();
    panel.classList.toggle("bbj-collapsed", collapsed);
    document.documentElement.classList.toggle(HTML_COLLAPSED_CLASS, collapsed);
    localStorage.setItem(LS_COLLAPSED_KEY, collapsed ? "1" : "0");
    log("Collapsed:", collapsed);
  }

  // -------------------------
  // Turn discovery
  // -------------------------
  function getConversationTurns() {
    const turns = $$('[data-testid="conversation-turn"]');
    if (turns.length) return turns;

    const roleBlocks = $$('[data-message-author-role]');
    if (roleBlocks.length) return roleBlocks;

    return [];
  }

  function getAssistantTargets() {
    const turns = getConversationTurns();
    const targets = [];

    for (const t of turns) {
      const roleEl = t.matches('[data-message-author-role]')
        ? t
        : t.querySelector('[data-message-author-role]');
      const role = roleEl?.getAttribute("data-message-author-role") || "";
      if (role !== "assistant") continue;

      const turn =
        t.matches('[data-testid="conversation-turn"]')
          ? t
          : t.closest('[data-testid="conversation-turn"]') || t;

      const textRoot =
        turn.querySelector(".markdown, .prose, [data-message-author-role='assistant']") || turn;

      let snippet = (textRoot.textContent || "").replace(/\s+/g, " ").trim();
      if (!snippet) snippet = "(empty)";
      if (snippet.length > 90) snippet = snippet.slice(0, 90) + "…";

      targets.push({ turn, snippet });
    }

    return targets;
  }

  function flashTurn(turn) {
    if (!turn) return;
    turn.classList.remove(FLASH_CLASS);
    void turn.offsetWidth;
    turn.classList.add(FLASH_CLASS);
    setTimeout(() => turn.classList.remove(FLASH_CLASS), 1200);
  }
function getScrollParent(el) {
  let p = el?.parentElement;
  for (let i = 0; i < 20 && p; i++) {
    const cs = getComputedStyle(p);
    const oy = cs.overflowY;
    // scroll container candidate
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 10) {
      return p;
    }
    p = p.parentElement;
  }
  return null;
}

function jumpToTurn(turn) {
  if (!turn) return;

  // Try ChatGPT’s real scroller first; fallback to window
  const scroller =
    document.querySelector("main")?.closest("[class*='overflow-y']") || // common on some builds
    getScrollParent(turn);

  // Adjust this if you want more/less gap below the header
  const HEADER_OFFSET = 90;

  if (scroller) {
    const turnRect = turn.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const currentTop = scroller.scrollTop;

    const targetTop = currentTop + (turnRect.top - scrollerRect.top) - HEADER_OFFSET;

    scroller.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  } else {
    const y = window.scrollY + turn.getBoundingClientRect().top - HEADER_OFFSET;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  flashTurn(turn);
}

  function jumpToLatest() {
    const targets = getAssistantTargets();
    const last = targets[targets.length - 1];
    if (last) jumpToTurn(last.turn);
  }

  // -------------------------
  // List build
  // -------------------------
  let lastListKey = "";

  function rebuildList(reason = "") {
    ensurePanel();
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    const filter = (localStorage.getItem(LS_FILTER_KEY) || "").trim().toLowerCase();
    const targets = getAssistantTargets();

    // Prevent pointless rebuild loops
    const key = targets.map((t) => t.snippet).join("\n");
    if (key === lastListKey && reason !== "manual" && reason !== "filter") return;
    lastListKey = key;

    list.innerHTML = "";

    const filtered = filter
      ? targets
          .map((t, idx) => ({ ...t, idx }))
          .filter((x) => (String(x.idx + 1) + " " + x.snippet).toLowerCase().includes(filter))
      : targets.map((t, idx) => ({ ...t, idx }));

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = MUTED_CLASS;
      empty.textContent = targets.length ? "No matches" : "No assistant responses yet";
      list.appendChild(empty);
      return;
    }

    for (const itemData of filtered) {
      const item = document.createElement("div");
      item.className = ITEM_CLASS;
      item.setAttribute("data-bbj-index", String(itemData.idx));
      item.textContent = `${itemData.idx + 1}. ${itemData.snippet}`;
      item.title = "Click to jump";
      item.style.pointerEvents = "auto"; // extra safety

      list.appendChild(item);
    }

    log("List rebuilt", { reason, total: targets.length, shown: filtered.length });
  }

  let listTimer = 0;
  function scheduleListRebuild(reason) {
    clearTimeout(listTimer);
    listTimer = window.setTimeout(() => rebuildList(reason), 250);
  }

  // -------------------------
  // Code pending/ready highlight
  // -------------------------
  function isGenerating() {
    return !!(
      $("[data-testid='stop-button']") ||
      $("button[aria-label*='Stop']") ||
      $("button[title*='Stop']") ||
      $$("button").some((b) => (b.textContent || "").trim().toLowerCase() === "stop generating")
    );
  }

  function newestAssistantTurn() {
    const targets = getAssistantTargets();
    return targets.length ? targets[targets.length - 1].turn : null;
  }

  let lastGenerating = false;

  function updateCodeBlockStates() {
    const generatingNow = isGenerating();
    const newest = newestAssistantTurn();
    if (!newest) {
      lastGenerating = generatingNow;
      return;
    }

    const pres = $$("pre", newest);

    if (generatingNow) {
      for (const pre of pres) {
        pre.classList.add(CODE_PENDING_CLASS);
        pre.classList.remove(CODE_READY_CLASS);
      }
    }

    if (lastGenerating && !generatingNow) {
      for (const pre of pres) {
        pre.classList.remove(CODE_PENDING_CLASS);
        pre.classList.add(CODE_READY_CLASS);
        setTimeout(() => pre.classList.remove(CODE_READY_CLASS), 5500);
      }
    }

    lastGenerating = generatingNow;
  }

  // -------------------------
  // Observers + SPA nav
  // -------------------------
  function findConversationRoot() {
    const firstTurn = $("[data-testid='conversation-turn']");
    if (firstTurn) return firstTurn.parentElement || $("main") || document.body;

    const role = $("[data-message-author-role]");
    if (role) return role.parentElement || $("main") || document.body;

    return $("main") || document.body;
  }

  function observeConversation() {
    const root = findConversationRoot();
    if (!root) return;

    const mo = new MutationObserver((muts) => {
      let relevant = false;

      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!(n instanceof Element)) continue;
          if (n.id && n.id.startsWith("bbj-")) continue;

          if (
            n.matches?.("[data-testid='conversation-turn']") ||
            n.querySelector?.("[data-testid='conversation-turn']") ||
            n.matches?.("[data-message-author-role]") ||
            n.querySelector?.("[data-message-author-role]")
          ) {
            relevant = true;
          }
        }
      }

      if (relevant) scheduleListRebuild("mutation");
      updateCodeBlockStates();
    });

    mo.observe(root, { childList: true, subtree: true });
    log("Observing conversation root:", root);
  }

  let lastHref = location.href;
  function watchUrlChanges() {
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        ensurePanel();
        scheduleListRebuild("url-change");
      }
    }, 600);
  }

  // -------------------------
  // Init
  // -------------------------
  function init() {
    ensurePanel();
    rebuildList("init");
    observeConversation();
    watchUrlChanges();

    window.addEventListener(
      "resize",
      () => {
        ensurePanel();
        scheduleListRebuild("resize");
      },
      { passive: true }
    );

    setInterval(updateCodeBlockStates, 500);
    setTimeout(() => scheduleListRebuild("settle"), 900);

    log("Init complete. Debug:", debugOn() ? "ON" : "OFF");
    if (debugOn()) {
      log("Tip: run localStorage.setItem('bbj_rj_debug','1') to keep logs on.");
    }
  }

  setTimeout(init, 250);
})();
