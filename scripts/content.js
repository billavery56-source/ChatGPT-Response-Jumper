/* ChatGPT_Response_Jumper/scripts/content.js
   - NO sizing in JS (no width/height/margins/padding/font-size in JS)
   - Adds <html> gate class so your CSS applies immediately:
       html.bbj-rj-3col ...
   - Adds state classes so CSS can target both layouts:
       html.bbj-rj-welcome  (new chat screen)
       html.bbj-rj-thread   (once messages exist)
   - Builds right Responses panel + click-to-jump
   - Jump goes to start (with header offset)
*/

(() => {
  "use strict";

  // ---- Gate + state classes ----
  const HTML_GATE = "bbj-rj-3col";
  const HTML_COMPAT = "bbj-enabled"; // if you still have older CSS gated on this
  const HTML_COLLAPSED = "bbj-rj-collapsed";
  const HTML_WELCOME = "bbj-rj-welcome";
  const HTML_THREAD = "bbj-rj-thread";

  // ---- LocalStorage ----
  const LS_COLLAPSED_KEY = "bbj_rj_collapsed";
  const LS_FILTER_KEY = "bbj_rj_filter";

  // ---- IDs / classes ----
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

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // -----------------------------
  // 1) Keep <html> classes applied
  // -----------------------------
  function ensureHtmlGateClasses() {
    const html = document.documentElement;
    html.classList.add(HTML_GATE);
    html.classList.add(HTML_COMPAT);
    html.dataset.bbjRj = "on"; // proof in DevTools (not sizing)

    if (!ensureHtmlGateClasses._watching) {
      ensureHtmlGateClasses._watching = true;

      // If something alters <html class=...>, re-add our gate classes
      new MutationObserver(() => {
        if (!html.classList.contains(HTML_GATE)) html.classList.add(HTML_GATE);
        if (!html.classList.contains(HTML_COMPAT)) html.classList.add(HTML_COMPAT);
      }).observe(html, { attributes: true, attributeFilter: ["class"] });

      // Cheap insurance
      setInterval(() => {
        if (!html.classList.contains(HTML_GATE)) html.classList.add(HTML_GATE);
        if (!html.classList.contains(HTML_COMPAT)) html.classList.add(HTML_COMPAT);
      }, 1500);
    }
  }

  // -----------------------------
  // 2) Welcome vs Thread state
  // -----------------------------
  function hasConversationTurns() {
    return !!$("[data-testid='conversation-turn']") || !!$("[data-message-author-role='assistant']");
  }

  function updateThreadState() {
    const html = document.documentElement;
    const hasTurns = hasConversationTurns();

    html.classList.toggle(HTML_THREAD, hasTurns);
    html.classList.toggle(HTML_WELCOME, !hasTurns);
  }

  // Apply immediately
  ensureHtmlGateClasses();
  updateThreadState();

  // -----------------------------
  // 3) Collapse state (CSS only)
  // -----------------------------
  function isCollapsed() {
    const panel = document.getElementById(PANEL_ID);
    return !!panel && panel.classList.contains("bbj-collapsed");
  }

  function setCollapsed(collapsed) {
    const panel = ensurePanel();
    panel.classList.toggle("bbj-collapsed", collapsed);
    document.documentElement.classList.toggle(HTML_COLLAPSED, collapsed);
    localStorage.setItem(LS_COLLAPSED_KEY, collapsed ? "1" : "0");
  }

  // -----------------------------
  // 4) Build rail + panel DOM
  // -----------------------------
  function ensureRail() {
    let rail = document.getElementById(RAIL_ID);
    if (rail) return rail;

    rail = document.createElement("div");
    rail.id = RAIL_ID;
    document.documentElement.appendChild(rail);
    return rail;
  }

  function ensurePanel() {
    ensureHtmlGateClasses();
    updateThreadState();

    const rail = ensureRail();

    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;
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
    list.style.pointerEvents = "auto";

    panel.appendChild(header);
    panel.appendChild(search);
    panel.appendChild(list);
    rail.appendChild(panel);

    // restore collapsed
    setCollapsed(localStorage.getItem(LS_COLLAPSED_KEY) === "1");

    // events
    btnLatest.addEventListener("click", () => jumpToLatest());
    btnToggle.addEventListener("click", () => setCollapsed(!isCollapsed()));

    search.addEventListener(
      "input",
      () => {
        localStorage.setItem(LS_FILTER_KEY, search.value);
        rebuildList("filter");
      },
      { passive: true }
    );

    // delegated list clicks
    list.addEventListener("click", (e) => {
      const item = e.target?.closest?.(`.${ITEM_CLASS}`);
      if (!item) return;

      const idx = parseInt(item.getAttribute("data-bbj-index") || "", 10);
      if (!Number.isFinite(idx)) return;

      const targets = getAssistantTargets();
      const t = targets[idx];
      if (!t) return;

      jumpToTurn(t.turn);
    });

    return panel;
  }

  // -----------------------------
  // 5) Find assistant turns/snippets
  // -----------------------------
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

  // -----------------------------
  // 6) Jump to START (offset)
  // -----------------------------
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
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 10) {
        return p;
      }
      p = p.parentElement;
    }
    return null;
  }

  function jumpToTurn(turn) {
    if (!turn) return;

    const HEADER_OFFSET = 90;
    const scroller = getScrollParent(turn);

    if (scroller) {
      const turnRect = turn.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const targetTop = scroller.scrollTop + (turnRect.top - scrollerRect.top) - HEADER_OFFSET;
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

  // -----------------------------
  // 7) Build list
  // -----------------------------
  let lastListKey = "";
  function rebuildList(reason = "") {
    ensurePanel();
    updateThreadState();

    const list = document.getElementById(LIST_ID);
    if (!list) return;

    const filter = (localStorage.getItem(LS_FILTER_KEY) || "").trim().toLowerCase();
    const targets = getAssistantTargets();

    const key = targets.map((t) => t.snippet).join("\n");
    if (key === lastListKey && reason !== "manual" && reason !== "filter") return;
    lastListKey = key;

    list.innerHTML = "";

    const filtered = filter
      ? targets.map((t, idx) => ({ ...t, idx }))
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
      list.appendChild(item);
    }
  }

  let listTimer = 0;
  function scheduleListRebuild(reason) {
    clearTimeout(listTimer);
    listTimer = window.setTimeout(() => rebuildList(reason), 250);
  }

  // -----------------------------
  // 8) Observe + URL changes
  // -----------------------------
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

    const mo = new MutationObserver(() => {
      ensureHtmlGateClasses();
      updateThreadState();
      scheduleListRebuild("mutation");
    });

    mo.observe(root, { childList: true, subtree: true });
  }

  let lastHref = location.href;
  function watchUrlChanges() {
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        ensurePanel();
        updateThreadState();
        scheduleListRebuild("url-change");
      }
    }, 600);
  }

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

    // Keep state correct if welcome -> thread changes
    setInterval(updateThreadState, 800);

    setTimeout(() => scheduleListRebuild("settle"), 900);
  }

  setTimeout(init, 150);
})();
