/* scripts/content.js
   Fixes:
   - Responses only working once: uses stable data-message-id, not array indices
   - Active highlight: based on stable message id
   - No sizing in JS
*/

(() => {
  "use strict";

  // LocalStorage keys
  const LS_FILTER_KEY = "bbj_rj_filter";
  const LS_COLLAPSED_KEY = "bbj_rj_collapsed";
  const LS_ACTIVE_MESSAGE_ID_KEY = "bbj_rj_active_message_id";

  // IDs
  const RAIL_ID = "bbj-rj-rail";
  const PANEL_ID = "bbj-rj-panel";
  const HEADER_ID = "bbj-rj-header";
  const TITLE_ID = "bbj-rj-title";
  const BTN_LATEST_ID = "bbj-rj-btn";
  const BTN_TOGGLE_ID = "bbj-rj-toggle";
  const SEARCH_ID = "bbj-rj-search";
  const LIST_ID = "bbj-rj-list";

  // Classes
  const ITEM_CLASS = "bbj-rj-item";
  const MUTED_CLASS = "bbj-rj-muted";
  const ACTIVE_CLASS = "bbj-rj-active";
  const FLASH_CLASS = "bbj-rj-flash";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // --------------------------
  // Panel DOM
  // --------------------------
  function ensureRail() {
    let rail = document.getElementById(RAIL_ID);
    if (rail) return rail;
    rail = document.createElement("div");
    rail.id = RAIL_ID;
    document.documentElement.appendChild(rail);
    return rail;
  }

  function ensurePanel() {
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

    setCollapsed(localStorage.getItem(LS_COLLAPSED_KEY) === "1");

    btnLatest.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToLatest();
    });

    btnToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setCollapsed(!isCollapsed());
    });

    search.addEventListener("input", () => {
      localStorage.setItem(LS_FILTER_KEY, search.value);
      rebuildList("filter");
    }, { passive: true });

    // Delegated click: use stable message-id
    list.addEventListener("click", (e) => {
      const item = e.target?.closest?.(`.${ITEM_CLASS}`);
      if (!item) return;

      e.preventDefault();
      e.stopPropagation();

      const mid = item.getAttribute("data-bbj-mid");
      if (!mid) return;

      setActiveMessageId(mid);
      applyActiveHighlight();

      const found = findMessageElementById(mid);
if (!found) return;
jumpToAnchor(found.anchor);

    });

    applyActiveHighlight();
    return panel;
  }

  function isCollapsed() {
    const panel = document.getElementById(PANEL_ID);
    return !!panel && panel.classList.contains("bbj-collapsed");
  }

  function setCollapsed(collapsed) {
    const panel = document.getElementById(PANEL_ID) || ensurePanel();
    panel.classList.toggle("bbj-collapsed", collapsed);
    document.documentElement.classList.toggle("bbj-rj-collapsed", collapsed);
    localStorage.setItem(LS_COLLAPSED_KEY, collapsed ? "1" : "0");
  }

  // --------------------------
  // Active highlight (message-id based)
  // --------------------------
  function getActiveMessageId() {
    return localStorage.getItem(LS_ACTIVE_MESSAGE_ID_KEY) || null;
  }
  function setActiveMessageId(mid) {
    localStorage.setItem(LS_ACTIVE_MESSAGE_ID_KEY, mid);
  }

  function applyActiveHighlight() {
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    list.querySelectorAll(`.${ITEM_CLASS}.${ACTIVE_CLASS}`)
      .forEach(el => el.classList.remove(ACTIVE_CLASS));

    const mid = getActiveMessageId();
    if (!mid) return;

    const el = list.querySelector(`.${ITEM_CLASS}[data-bbj-mid="${mid}"]`);
    if (el) el.classList.add(ACTIVE_CLASS);
  }

  // --------------------------
  // Build targets using stable data-message-id
  // --------------------------
  function getAssistantTargets() {
    // Prefer role blocks (they reliably carry data-message-id)
    const roleBlocks = $$('[data-message-author-role="assistant"][data-message-id]');
    const targets = [];

    for (const roleEl of roleBlocks) {
      const mid = roleEl.getAttribute("data-message-id");
      if (!mid) continue;

      // Use nearest conversation turn as the scroll target
      const turn =
        roleEl.closest('[data-testid="conversation-turn"]') ||
        roleEl.closest("article") ||
        roleEl;

      const textRoot = turn.querySelector(".markdown, .prose") || roleEl;
      let snippet = (textRoot.textContent || "").replace(/\s+/g, " ").trim();
      if (!snippet) snippet = "(empty)";
      if (snippet.length > 90) snippet = snippet.slice(0, 90) + "…";

      targets.push({ mid, turn, snippet });
    }

    return targets;
  }

  function findMessageElementById(mid) {
  const roleEl = document.querySelector(
    `[data-message-author-role="assistant"][data-message-id="${mid}"]`
  );
  if (!roleEl) return null;

  const turn =
    roleEl.closest('[data-testid="conversation-turn"]') ||
    roleEl.closest("article") ||
    roleEl;

  // Prefer the actual rendered content block (top of the answer)
  const content =
    turn.querySelector(".markdown") ||
    turn.querySelector(".prose") ||
    roleEl;

  return { turn, anchor: content };
}

function getScrollParent(el) {
  let p = el?.parentElement;
  for (let i = 0; i < 25 && p; i++) {
    const cs = getComputedStyle(p);
    const oy = cs.overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 10) return p;
    p = p.parentElement;
  }
  return document.scrollingElement || null;
}

function jumpToAnchor(anchorEl) {
  if (!anchorEl) return;

  const HEADER_OFFSET = 90; // tweak if needed
  const scroller = getScrollParent(anchorEl);

  // Compute "top of anchor" relative to scroll container
  const aRect = anchorEl.getBoundingClientRect();

  if (scroller && scroller !== document.scrollingElement) {
    const sRect = scroller.getBoundingClientRect();
    const top = scroller.scrollTop + (aRect.top - sRect.top) - HEADER_OFFSET;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  } else {
    const top = window.scrollY + aRect.top - HEADER_OFFSET;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  // flash the TURN so you can see what it jumped to
  const turn = anchorEl.closest('[data-testid="conversation-turn"]') || anchorEl;
  turn.classList.remove("bbj-rj-flash");
  void turn.offsetWidth;
  turn.classList.add("bbj-rj-flash");
  setTimeout(() => turn.classList.remove("bbj-rj-flash"), 1200);
}


  // --------------------------
  // Jump behavior (start + offset)
  // --------------------------
  function flashEl(el) {
    if (!el) return;
    el.classList.remove(FLASH_CLASS);
    void el.offsetWidth;
    el.classList.add(FLASH_CLASS);
    setTimeout(() => el.classList.remove(FLASH_CLASS), 1200);
  }

  function getScrollParent(el) {
    let p = el?.parentElement;
    for (let i = 0; i < 25 && p; i++) {
      const cs = getComputedStyle(p);
      const oy = cs.overflowY;
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 10) return p;
      p = p.parentElement;
    }
    return document.scrollingElement || null;
  }

  function jumpToElement(el) {
    if (!el) return;

    const HEADER_OFFSET = 90;
    const scroller = getScrollParent(el);

    if (scroller && scroller !== document.scrollingElement) {
      const tr = el.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      const top = scroller.scrollTop + (tr.top - sr.top) - HEADER_OFFSET;
      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      const top = window.scrollY + el.getBoundingClientRect().top - HEADER_OFFSET;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }

    flashEl(el);
  }

  function jumpToLatest() {
    const targets = getAssistantTargets();
    const last = targets[targets.length - 1];
    if (!last) return;

    setActiveMessageId(last.mid);
    applyActiveHighlight();
    jumpToElement(last.turn);
  }

  function flashTurn(el) {
  // highlight the whole conversation turn container
  const turn =
    el.closest?.('[data-testid="conversation-turn"]') ||
    el.closest?.('[data-message-author-role]') ||
    el;

  if (!turn) return;

  turn.classList.remove("bbj-rj-flash");
  void turn.offsetWidth; // reflow to restart animation
  turn.classList.add("bbj-rj-flash");
  setTimeout(() => turn.classList.remove("bbj-rj-flash"), 1300);
}


  // --------------------------
  // Build list
  // --------------------------
  let lastKey = "";

  function rebuildList(reason = "") {
    ensurePanel();

    const list = document.getElementById(LIST_ID);
    if (!list) return;

    const filter = (localStorage.getItem(LS_FILTER_KEY) || "").trim().toLowerCase();
    const targets = getAssistantTargets();

    const key = targets.map(t => t.mid).join("|");
    if (key === lastKey && reason !== "manual" && reason !== "filter") return;
    lastKey = key;

    list.innerHTML = "";

    const rows = filter
      ? targets.filter(t => (t.snippet || "").toLowerCase().includes(filter))
      : targets;

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = MUTED_CLASS;
      empty.textContent = targets.length ? "No matches" : "No assistant responses yet";
      list.appendChild(empty);
      return;
    }

    rows.forEach((t, i) => {
      const item = document.createElement("div");
      item.className = ITEM_CLASS;
      item.setAttribute("data-bbj-mid", t.mid);
      item.textContent = `${i + 1}. ${t.snippet}`;
      list.appendChild(item);
    });

    applyActiveHighlight();
  }

  let timer = 0;
  function scheduleRebuild(reason) {
    clearTimeout(timer);
    timer = window.setTimeout(() => rebuildList(reason), 250);
  }

  // --------------------------
  // Observe conversation changes
  // --------------------------
  function findConversationRoot() {
    return $("main") || document.body;
  }

  function observeConversation() {
    const root = findConversationRoot();
    if (!root) return;

    new MutationObserver(() => scheduleRebuild("mutation"))
      .observe(root, { childList: true, subtree: true });
  }

  let lastHref = location.href;
  function watchUrlChanges() {
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        ensurePanel();
        scheduleRebuild("url-change");
      }
    }, 600);
  }

  function init() {
    ensurePanel();
    rebuildList("init");
    observeConversation();
    watchUrlChanges();
    setTimeout(() => scheduleRebuild("settle"), 900);
  }

  setTimeout(init, 250);
})();
