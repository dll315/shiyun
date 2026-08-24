(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    dailyDate: $("daily-date"),
    dailyTitle: $("daily-title"),
    dailyAuthor: $("daily-author"),
    dailyLines: $("daily-lines"),
    btnDailyDetail: $("btn-daily-detail"),
    btnRandom: $("btn-random"),
    searchInput: $("search-input"),
    chips: $("dynasty-chips"),
    grid: $("poem-grid"),
    count: $("library-count"),
    emptyTip: $("empty-tip"),
    progress: $("progress"),
    loadStatus: $("load-status"),
    pagination: $("pagination"),
    backdrop: $("modal-backdrop"),
    modalClose: $("modal-close"),
    modalTitle: $("modal-title"),
    modalAuthor: $("modal-author"),
    modalLines: $("modal-lines"),
    modalTags: $("modal-tags"),
    btnCopy: $("btn-copy"),
    toast: $("toast")
  };

  const REPO_CP = "chinese-poetry/chinese-poetry@master/";

  const CORE_SOURCES = [
    { name: "唐诗三百首", dynasty: "唐", defaultAuthor: "佚名", url: REPO_CP + "%E8%92%99%E5%AD%A6/tangshisanbaishou.json" },
    { name: "诗经", dynasty: "先秦", defaultAuthor: "佚名", url: REPO_CP + "%E8%AF%97%E7%BB%8F/shijing.json" },
    { name: "楚辞", dynasty: "先秦", defaultAuthor: "屈原 等", url: REPO_CP + "%E6%A5%9A%E8%BE%9E/chuci.json" },
    { name: "曹操诗集", dynasty: "汉魏", defaultAuthor: "曹操", url: REPO_CP + "%E6%9B%B9%E6%93%8D%E8%AF%97%E9%9B%86/caocao.json" },
    { name: "纳兰词", dynasty: "清", defaultAuthor: "纳兰性德", url: REPO_CP + "%E7%BA%B3%E5%85%B0%E6%80%A7%E5%BE%B7/%E7%BA%B3%E5%85%B0%E6%80%A7%E5%BE%B7%E8%AF%97%E9%9B%86.json" },
    { name: "元曲", dynasty: "元", defaultAuthor: "佚名", url: REPO_CP + "%E5%85%83%E6%9B%B2/yuanqu.json" }
  ];

  const SONGCI_PATH = (i) => REPO_CP + "%E5%AE%8B%E8%AF%8D/ci.song." + i + ".json";
  const SONGCI_TOTAL = 22;
  const CACHE_KEY = "shiyun-corpus-v4";
  const PAGE_SIZE = 24;

  const state = { dynasty: "全部", query: "", current: null, page: 1 };
  let LIB = [];
  let CORE = [];
  let t2s = null;
  let ccPromise = null;
  let ccApplied = false;
  let dailyShown = false;
  let renderTimer = null;
  const volState = new Array(SONGCI_TOTAL).fill(false);

  const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

  function formatDateCN(d) {
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 · 星期" + WEEK[d.getDay()];
  }

  function setStatus(msg, loading) {
    els.loadStatus.textContent = msg;
    els.loadStatus.classList.toggle("loading", !!loading);
  }

  function setProgress(ratio) {
    if (ratio >= 1) {
      els.progress.hidden = true;
      return;
    }
    els.progress.hidden = false;
    els.progress.firstElementChild.style.width = Math.round(ratio * 100) + "%";
  }

  function cleanStr(s) {
    return String(s).replace(/\s+/g, " ").trim();
  }

  function isStrArr(v) {
    return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string");
  }

  function collectPoems(data, meta) {
    const out = [];
    const TITLE_KEYS = ["title", "chapter", "name", "rhythmic"];
    const LINE_KEYS = ["paragraphs", "content"];
    const AUTHOR_KEYS = ["author", "authors"];
    const TYPE_KEYS = ["type", "subchapter", "section"];

    function walk(node, ctx) {
      if (out.length > 4000) return;
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, ctx));
        return;
      }
      if (!node || typeof node !== "object") return;

      const lineKey = LINE_KEYS.find((k) => isStrArr(node[k]));
      const titleKey = TITLE_KEYS.find((k) => typeof node[k] === "string");

      if (lineKey) {
        const lines = node[lineKey].map(cleanStr).filter(Boolean);
        if (lines.length >= 1 && ((titleKey && cleanStr(node[titleKey])) || lines.length >= 2)) {
          const author =
            AUTHOR_KEYS.map((k) => node[k]).find((v) => typeof v === "string" && v.trim()) ||
            ctx.author ||
            meta.defaultAuthor ||
            "佚名";
          const ownType = TYPE_KEYS.map((k) => node[k]).find(
            (v) => typeof v === "string" && v.trim()
          );
          const title = (titleKey && cleanStr(node[titleKey])) || ctx.title || "无题";
          const tags = [meta.name];
          if (Array.isArray(node.tags)) {
            node.tags.forEach((t) => {
              if (typeof t === "string" && t.trim() && tags.indexOf(t) === -1) tags.push(t);
            });
          }
          out.push({
            id: meta.name + "-" + out.length,
            title,
            author,
            dynasty: meta.dynasty,
            type: ownType || ctx.type || "",
            lines,
            tags,
            src: meta.name
          });
          return;
        }
      }

      const nextCtx = Object.assign({}, ctx);
      if (titleKey && cleanStr(node[titleKey])) nextCtx.title = cleanStr(node[titleKey]);
      AUTHOR_KEYS.forEach((k) => {
        if (typeof node[k] === "string" && node[k].trim()) nextCtx.author = node[k];
      });
      TYPE_KEYS.forEach((k) => {
        if (typeof node[k] === "string" && node[k].trim()) nextCtx.type = node[k];
      });
      Object.values(node).forEach((v) => {
        if (Array.isArray(v) || (v && typeof v === "object")) walk(v, nextCtx);
      });
    }

    walk(data, {});
    return out;
  }

  function buildHay(list) {
    const conv = !!t2s;
    list.forEach((p) => {
      const base = p.title + "|" + p.author + "|" + p.lines.join("");
      p._hay = (conv ? t2s(base) : base).toLowerCase();
      p._t = (conv ? t2s(p.title) : p.title).toLowerCase();
      p._a = (conv ? t2s(p.author) : p.author).toLowerCase();
      p._applied = conv;
    });
  }

  function rebuildHayAsync() {
    if (!t2s || ccApplied) return;
    ccApplied = true;
    let i = 0;
    function step() {
      const end = Math.min(i + 2000, LIB.length);
      for (; i < end; i++) {
        const p = LIB[i];
        if (p._applied) continue;
        const base = p.title + "|" + p.author + "|" + p.lines.join("");
        p._hay = t2s(base).toLowerCase();
        p._t = t2s(p.title).toLowerCase();
        p._a = t2s(p.author).toLowerCase();
        p._applied = true;
      }
      if (i < LIB.length) setTimeout(step, 0);
    }
    step();
  }

  const OPENCC_URLS = [
    "https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js",
    "https://fastly.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js",
    "https://unpkg.com/opencc-js@1.0.5/dist/umd/full.js"
  ];

  function loadOpenCC() {
    return new Promise((resolve) => {
      try {
        if (window.OpenCC) {
          t2s = window.OpenCC.Converter({ from: "t", to: "cn" });
          return resolve(true);
        }
        let i = 0;
        const tryNext = () => {
          if (i >= OPENCC_URLS.length) return resolve(false);
          const s = document.createElement("script");
          s.src = OPENCC_URLS[i++];
          s.onload = () => {
            try {
              t2s = window.OpenCC.Converter({ from: "t", to: "cn" });
              resolve(true);
            } catch (e) {
              resolve(false);
            }
          };
          s.onerror = () => {
            s.remove();
            tryNext();
          };
          document.head.appendChild(s);
        };
        tryNext();
      } catch (e) {
        resolve(false);
      }
    });
  }

  let openccStarted = false;
  function startOpenCC() {
    if (openccStarted) return;
    openccStarted = true;
    ccPromise = loadOpenCC().then((ok) => {
      if (ok) rebuildHayAsync();
      return ok;
    });
  }

  function fetchRaw(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 30000);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  const MIRRORS = [
    (p) => "https://cdn.jsdelivr.net/gh/" + p,
    (p) => "https://fastly.jsdelivr.net/gh/" + p,
    (p) => "https://gcore.jsdelivr.net/gh/" + p,
    (p) => "https://cdn.statically.io/gh/" + p.replace("@master", "/master")
  ];
  let mirrorIdx = 0;

  async function fetchGH(path, ms) {
    let lastErr = null;
    for (let attempt = 0; attempt < MIRRORS.length; attempt++) {
      const idx = (mirrorIdx + attempt) % MIRRORS.length;
      try {
        const res = await fetchRaw(MIRRORS[idx](path), ms);
        if (!res.ok) throw new Error("HTTP " + res.status);
        mirrorIdx = idx;
        return res;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("all mirrors failed");
  }

  async function pool(items, limit, worker) {
    let i = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx], idx);
      }
    });
    await Promise.all(runners);
  }

  function idbGet(key) {
    return new Promise((resolve) => {
      try {
        const rq = indexedDB.open("shiyun-db", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
        rq.onsuccess = () => {
          const tx = rq.result.transaction("kv", "readonly");
          const g = tx.objectStore("kv").get(key);
          g.onsuccess = () => resolve(g.result || null);
          g.onerror = () => resolve(null);
        };
        rq.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  function idbSet(key, val) {
    return new Promise((resolve) => {
      try {
        const rq = indexedDB.open("shiyun-db", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
        rq.onsuccess = () => {
          const tx = rq.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(val, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        };
        rq.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  const plainPoem = (p) => ({
    id: p.id,
    title: p.title,
    author: p.author,
    dynasty: p.dynasty,
    type: p.type || "",
    lines: p.lines,
    tags: p.tags || [],
    src: p.src
  });

  let saveTimer = null;
  function scheduleSave(immediate) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      idbSet(CACHE_KEY, {
        ts: Date.now(),
        vols: volState.slice(),
        poems: LIB.map(plainPoem)
      });
    }, immediate ? 0 : 3000);
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderGrid, 400);
  }

  function pickDaily() {
    const arr = CORE.length ? CORE : LIB;
    if (!arr.length) return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const doy = Math.floor((now - start) / 86400000);
    const seed = now.getFullYear() * 1000 + doy;
    const r = ((seed * 9301 + 49297) % 233280) / 233280;
    return arr[Math.floor(r * arr.length)];
  }

  let dailyCurrent = null;

  function renderDaily(poem, label) {
    dailyCurrent = poem;
    if (!poem) {
      els.dailyTitle.textContent = "正在从云端加载…";
      els.dailyAuthor.textContent = "";
      els.dailyLines.textContent = "";
      return;
    }
    els.dailyDate.textContent = label || "今日 " + formatDateCN(new Date());
    els.dailyTitle.textContent = "《" + poem.title + "》";
    els.dailyAuthor.innerHTML =
      "<em>[" + poem.dynasty + "]</em>" + poem.author +
      (poem.type ? " · " + poem.type : "") +
      '<span class="src-tag">《' + poem.src + "》</span>";
    els.dailyLines.textContent = poem.lines.join("\n");
  }

  function renderChips() {
    const order = ["全部", "先秦", "汉魏", "唐", "宋", "元", "清"];
    const present = order.filter(
      (d) => d === "全部" || LIB.some((p) => p.dynasty === d)
    );
    els.chips.innerHTML = present
      .map(
        (d) =>
          '<button class="chip' +
          (d === state.dynasty ? " active" : "") +
          '" data-d="' + d + '">' + d + "</button>"
      )
      .join("");
  }

  function searchLib() {
    const tokens = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = [];
    for (const p of LIB) {
      if (state.dynasty !== "全部" && p.dynasty !== state.dynasty) continue;
      if (!tokens.every((t) => p._hay.includes(t))) continue;
      const score =
        (tokens.some((t) => p._t.includes(t)) ? 4 : 0) +
        (tokens.some((t) => p._a.includes(t)) ? 2 : 0);
      scored.push([score, p]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.map((s) => s[1]);
  }

  function cardHTML(p) {
    return (
      '<article class="card" data-id="' + p.id + '">' +
      '<h3 class="card-title">' + p.title + "</h3>" +
      '<p class="card-meta">[' + p.dynasty + "] " + p.author + "</p>" +
      '<p class="card-excerpt">' + p.lines.slice(0, 4).join("\n") + "</p>" +
      '<div class="card-tags">' +
      p.tags.slice(0, 3).map((t) => '<span class="card-tag">' + t + "</span>").join("") +
      "</div></article>"
    );
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) {
      els.pagination.innerHTML = "";
      return;
    }
    const cur = state.page;
    const parts = [];
    const win = 2;
    const addPage = (n) =>
      parts.push(
        '<button class="page-btn' + (n === cur ? " active" : "") + '" data-p="' + n + '">' + n + "</button>"
      );
    parts.push('<button class="page-btn" data-nav="prev"' + (cur === 1 ? " disabled" : "") + ">‹</button>");
    addPage(1);
    if (cur - win > 2) parts.push('<span class="page-dots">…</span>');
    for (let n = Math.max(2, cur - win); n <= Math.min(totalPages - 1, cur + win); n++) addPage(n);
    if (cur + win < totalPages - 1) parts.push('<span class="page-dots">…</span>');
    if (totalPages > 1) addPage(totalPages);
    parts.push('<button class="page-btn" data-nav="next"' + (cur === totalPages ? " disabled" : "") + ">›</button>");
    els.pagination.innerHTML = parts.join("");
  }

  function goToPage(n) {
    state.page = n;
    renderGrid();
    document.getElementById("library").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  els.pagination.addEventListener("click", (e) => {
    const btn = e.target.closest(".page-btn");
    if (!btn || btn.disabled) return;
    if (btn.dataset.nav === "prev") return goToPage(state.page - 1);
    if (btn.dataset.nav === "next") return goToPage(state.page + 1);
    goToPage(parseInt(btn.dataset.p, 10));
  });

  function renderGrid() {
    const total = LIB.length;
    if (!total) {
      els.count.textContent = "正在连接云端数据库…";
      els.grid.innerHTML = Array.from(
        { length: 8 },
        () =>
          '<article class="card skel">' +
          '<div class="skel-line" style="width:55%"></div>' +
          '<div class="skel-line" style="width:35%"></div>' +
          '<div class="skel-line"></div>' +
          '<div class="skel-line" style="width:80%"></div>' +
          '<div class="skel-line" style="width:45%"></div>' +
          "</article>"
      ).join("");
      els.pagination.innerHTML = "";
      els.emptyTip.hidden = true;
      return;
    }
    const q = state.query.trim();
    const list = q || state.dynasty !== "全部" ? searchLib() : LIB;
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    const start = (state.page - 1) * PAGE_SIZE;
    els.count.textContent =
      "已收录 " + total + " 首 · 匹配 " + list.length + " 首 · 第 " + state.page + "/" + totalPages + " 页";
    els.emptyTip.hidden = list.length > 0;
    els.emptyTip.textContent = q
      ? "未找到匹配的作品，试试作者名、词牌或名句片段。"
      : "该朝代暂无已加载的作品。";
    els.grid.innerHTML = list
      .slice(start, start + PAGE_SIZE)
      .map(cardHTML)
      .join("");
    renderPagination(totalPages);
  }

  function openModal(poem) {
    state.current = poem;
    els.modalTitle.textContent = "《" + poem.title + "》";
    els.modalAuthor.innerHTML =
      "<em>[" + poem.dynasty + "]</em>" + poem.author +
      (poem.type ? " · " + poem.type : "") +
      '<span class="src-tag">《' + poem.src + "》</span>";
    els.modalLines.textContent = poem.lines.join("\n");
    els.modalTags.innerHTML = ["《" + poem.src + "》"]
      .concat(poem.tags || [])
      .map((t) => '<span class="card-tag">' + t + "</span>")
      .join("");
    els.backdrop.hidden = false;
    requestAnimationFrame(() => els.backdrop.classList.add("show"));
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    els.backdrop.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(() => (els.backdrop.hidden = true), 250);
  }

  let toastTimer = null;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), 1600);
  }

  els.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.dynasty = chip.dataset.d;
    state.page = 1;
    renderChips();
    renderGrid();
  });

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    state.page = 1;
    renderGrid();
  });

  els.grid.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const poem = LIB.find((p) => p.id === card.dataset.id);
    if (poem) openModal(poem);
  });

  els.btnDailyDetail.addEventListener("click", () => {
    if (dailyCurrent) openModal(dailyCurrent);
  });

  els.btnRandom.addEventListener("click", () => {
    if (!LIB.length) return;
    let idx;
    do {
      idx = Math.floor(Math.random() * LIB.length);
    } while (dailyCurrent && LIB[idx].id === dailyCurrent.id && LIB.length > 1);
    renderDaily(LIB[idx], "为您换了一首");
  });

  els.modalClose.addEventListener("click", closeModal);
  els.backdrop.addEventListener("click", (e) => {
    if (e.target === els.backdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.backdrop.hidden) closeModal();
  });

  els.btnCopy.addEventListener("click", () => {
    const p = state.current;
    if (!p) return;
    const text = p.title + "\n[" + p.dynasty + "] " + p.author + "\n" + p.lines.join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("全篇已复制到剪贴板"))
      .catch(() => showToast("复制失败，请手动选择文本"));
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  function afterCoreLoaded() {
    renderDaily(pickDaily());
    renderChips();
    renderGrid();
  }

  async function loadCoreBatch() {
    await Promise.allSettled(
      CORE_SOURCES.map(async (src) => {
        const res = await fetchGH(src.url);
        if (!res.ok) throw new Error(res.status);
        const arr = collectPoems(await res.json(), src);
        LIB.push(...arr);
        CORE.push(...arr);
        buildHay(arr);
        setStatus("已载入《" + src.name + "》" + arr.length + " 首", true);
        if (!dailyShown) {
          dailyShown = true;
          renderDaily(pickDaily());
        }
        scheduleRender();
      })
    );
    renderChips();
    renderGrid();
    scheduleSave(false);
  }

  async function loadSongCi(resume) {
    let done = 0;
    let fail = 0;
    const targets = [];
    for (let k = 0; k < SONGCI_TOTAL; k++) {
      if (!volState[k]) targets.push(k);
    }
    if (!targets.length) {
      setProgress(1);
      return;
    }
    const need = targets.length;
    await pool(targets, 10, async (k) => {
      try {
        const res = await fetchGH(SONGCI_PATH(k * 1000));
        if (!res.ok) throw new Error(res.status);
        const arr = collectPoems(await res.json(), {
          name: "宋词",
          dynasty: "宋",
          defaultAuthor: "佚名"
        });
        buildHay(arr);
        LIB.push(...arr);
        volState[k] = true;
      } catch (err) {
        fail++;
      }
      done++;
      setProgress(done / need);
      if (done === need) {
        setStatus(
          "全部加载完成：共 " + LIB.length + " 首作品" + (fail ? "（" + fail + " 个分卷加载失败，下次启动自动续传）" : ""),
          false
        );
        renderChips();
      } else {
        setStatus(
          (resume ? "续传宋词 第 " : "正在载入宋词 第 ") + done + "/" + need + " 卷…",
          true
        );
      }
      scheduleRender();
      if (done % 5 === 0) scheduleSave(false);
    });
    scheduleSave(true);
  }

  (async function boot() {
    setStatus("正在连接云端数据库…", true);
    renderGrid();
    const cached = await idbGet(CACHE_KEY);
    if (cached && Array.isArray(cached.poems) && cached.poems.length) {
      LIB = cached.poems;
      CORE = LIB.filter((p) =>
        CORE_SOURCES.some((s) => s.name === p.src)
      );
      afterCoreLoaded();
      setProgress(1);
      setStatus("诗库已就绪（本地缓存）：共 " + LIB.length + " 首作品", false);
      startOpenCC();
      if (Array.isArray(cached.vols) && cached.vols.length === SONGCI_TOTAL) {
        for (let k = 0; k < SONGCI_TOTAL; k++) volState[k] = !!cached.vols[k];
      }
      if (!volState.every(Boolean)) {
        loadSongCi(true);
      }
      return;
    }

    await loadCoreBatch();
    if (!LIB.length) {
      setProgress(1);
      setStatus("网络连接失败（已尝试全部镜像），无法加载诗库。", false);
      els.grid.innerHTML = "";
      els.emptyTip.hidden = false;
      els.emptyTip.textContent = "加载失败：请检查网络连接后刷新页面重试。";
      return;
    }
    startOpenCC();
    loadSongCi().then(() => scheduleSave(true));
  })();
})();
