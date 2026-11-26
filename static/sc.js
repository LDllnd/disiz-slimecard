/*
 * Progressive enhancement for the fan pages — everything works without it.
 * Served as a static file (not inline) so a strict Content-Security-Policy
 * can be added later without nonces.
 *
 *   [data-tilt="9"]      pointer-reactive 3D tilt + moving light (max degrees)
 *   [data-reveal]        fades/slides in when scrolled into view
 *   [data-share]         native share sheet, or copies the link
 *   [data-tabs]          section tabs: follows the section in view
 *   [data-sheet]         opens the matching <dialog class="sheet"> (bottom sheet)
 *   [data-inline-form]   posts in place and reports the outcome
 *   [data-player]        audio player: play/pause, waveform progress, seek
 *   [data-video]         a video message: a cover with one play key until it is started
 *   [data-out="kind"]    a link out to a third-party service: the click is counted
 *   [data-buy]           a link to a shop's checkout: opened in a window over the page
 */
(() => {
  const root = document.documentElement;
  root.classList.add("js");

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (finePointer && !still) {
    for (const el of document.querySelectorAll("[data-tilt]")) {
      const max = Number(el.dataset.tilt) || 9;
      el.addEventListener("pointermove", (event) => {
        const rect = el.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty("--mx", x.toFixed(3));
        el.style.setProperty("--my", y.toFixed(3));
      });
      el.addEventListener("pointerleave", () => {
        for (const name of ["--rx", "--ry", "--mx", "--my"]) el.style.removeProperty(name);
      });
    }
  }

  const reveals = document.querySelectorAll("[data-reveal]");
  if (still || !("IntersectionObserver" in window)) {
    for (const el of reveals) el.classList.add("in");
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    for (const el of reveals) observer.observe(el);
  }

  for (const button of document.querySelectorAll("[data-share]")) {
    const label = button.querySelector("[data-share-label]");
    const idle = label ? label.textContent : "";
    button.addEventListener("click", async () => {
      const url = new URL(button.dataset.shareUrl || location.pathname, location.origin).href;
      const title = button.dataset.shareTitle || document.title;
      try {
        if (navigator.share) {
          await navigator.share({ title, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        if (label) label.textContent = "Lien copié";
        button.dataset.done = "";
        setTimeout(() => {
          delete button.dataset.done;
          if (label) label.textContent = idle;
        }, 2200);
      } catch {
        // Share sheet dismissed, or clipboard refused: nothing to report.
      }
    });
  }

  // Section tabs: mark the section crossing the upper part of the screen.
  const tabs = document.querySelector("[data-tabs]");
  if (tabs && "IntersectionObserver" in window) {
    const links = new Map();
    for (const link of tabs.querySelectorAll("[data-tab]")) {
      const section = document.getElementById(link.dataset.tab);
      if (section) links.set(section, link);
    }
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const other of links.values()) other.removeAttribute("aria-current");
          links.get(entry.target).setAttribute("aria-current", "true");
        }
      },
      { rootMargin: "-32% 0px -60% 0px" }
    );
    for (const section of links.keys()) spy.observe(section);
  }

  // Links out (tickets, shop, listening, networks): count the click as the
  // visitor leaves. Only the kind and the host are sent — never the full link.
  const artistPage = location.pathname.match(/^\/a\/([^/]+)/);
  if (artistPage && navigator.sendBeacon) {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-out]");
      if (!link) return;
      try {
        const host = new URL(link.href).hostname;
        // On an announcement page the click counts for that announcement.
        const announcement = link.closest("[data-ann]");
        navigator.sendBeacon(
          `/a/${artistPage[1]}/sortie?k=${encodeURIComponent(link.dataset.out)}&h=${encodeURIComponent(host)}${
            announcement ? `&a=${encodeURIComponent(announcement.dataset.ann)}` : ""
          }`
        );
      } catch {
        // A link that cannot be parsed is simply followed.
      }
    });
  }

  // Sheets: a [data-sheet="name"] link opens <dialog id="sheet-name"> instead of
  // following its href (which stays the no-script fallback).
  const openSheet = (name) => {
    const sheet = document.getElementById(`sheet-${name}`);
    if (!sheet || typeof sheet.showModal !== "function") return false;
    if (!sheet.open) sheet.showModal();
    if (sheet.dataset.sheetSeen && navigator.sendBeacon) navigator.sendBeacon(sheet.dataset.sheetSeen);
    return true;
  };
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-sheet]");
    if (opener && openSheet(opener.dataset.sheet)) event.preventDefault();
  });
  for (const sheet of document.querySelectorAll("dialog.sheet")) {
    // A tap on the dimmed area (the dialog itself, outside its content) closes it.
    sheet.addEventListener("click", (event) => {
      // The payment sheet holds while the shop's window is open: see below.
      if (event.target === sheet && sheet.dataset.state !== "open") sheet.close();
    });
  }
  if (location.hash === "#club-prive") openSheet("club");

  // Buying without leaving the page. A link to a shop's checkout ([data-buy]: a
  // Shopify cart link) opens that checkout in a window over the page, through
  // Shopify's own Checkout Kit; the page's payment sheet waits under the window
  // and says when the shop confirmed the order.
  //
  // The kit is fetched from Shopify the first time a visitor REACHES for a
  // product (pointer, touch, focus, its size sheet) — never before: until then
  // the page contacts no third party. Whenever something is missing (the kit not
  // there yet, an old browser, the browser built into a social app, where a
  // second window does not exist), the link is simply followed as written.
  const paySheet = document.getElementById("sheet-paiement");
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|musical_ly|TikTok|Bytedance|Snapchat|Line\/|LinkedInApp|Pinterest|Twitter/i.test(
    navigator.userAgent
  );
  // Nor inside the back office's preview: an outside script there would run with the
  // back office's own rights.
  const previewed = root.hasAttribute("data-preview");
  if (paySheet && typeof paySheet.showModal === "function" && window.customElements && !inApp && !previewed) {
    const KIT = "https://cdn.shopify.com/checkout-kit/v4/checkout-kit.js";
    let checkout = null;
    let loading = null;
    let started = false;
    const payState = (state) => {
      paySheet.dataset.state = state;
    };
    const money = (amount, currency) => {
      try {
        const format = new Intl.NumberFormat("fr-FR", { style: "currency", currency });
        // The window reports amounts in the currency's smallest unit.
        return format.format(amount / 10 ** format.resolvedOptions().maximumFractionDigits);
      } catch {
        return "";
      }
    };

    const build = () => {
      const element = document.createElement("shopify-checkout");
      element.setAttribute("target", "popup");
      // No diagnostics sent to Shopify from the artist's page.
      element.setAttribute("telemetry", "false");
      element.addEventListener("start", () => {
        started = true;
      });
      element.addEventListener("complete", (event) => {
        const order = (event.detail && event.detail.checkout) || {};
        const total = (order.totals || []).find((entry) => entry && entry.type === "total");
        const currency = typeof order.currency === "string" ? order.currency : "";
        const amount = total && Number.isFinite(total.amount) ? Math.round(total.amount) : null;
        const line = paySheet.querySelector("[data-pay-total]");
        if (line) line.textContent = amount !== null && currency ? money(amount, currency) : "";
        payState("done");
        if (!paySheet.open) paySheet.showModal();
        // Told to Slimecard once: the shop's host, the amount, the currency — nothing about the buyer.
        if (navigator.sendBeacon && paySheet.dataset.order) {
          try {
            const query = new URLSearchParams({ h: new URL(element.getAttribute("src")).hostname });
            if (amount !== null && currency) {
              query.set("m", String(amount));
              query.set("c", currency);
            }
            navigator.sendBeacon(`${paySheet.dataset.order}?${query}`);
          } catch {
            // The order went through all the same.
          }
        }
      });
      // The window was closed without an order: the page is as it was.
      element.addEventListener("close", () => {
        if (paySheet.dataset.state !== "open") return;
        payState("idle");
        if (paySheet.open) paySheet.close();
      });
      // The browser refused the window: the sheet offers the same checkout as a plain link.
      element.addEventListener("blocked", () => payState("blocked"));
      element.addEventListener("error", () => {
        if (!started && paySheet.dataset.state === "open") payState("blocked");
      });
      document.body.append(element);
      return element;
    };
    const load = () => {
      if (!loading) {
        loading = import(KIT)
          .then((kit) => kit.loadComponents(["shopify-checkout"]))
          .then(() => {
            checkout = build();
          })
          .catch(() => {
            // Shopify out of reach: links stay links. A later reach tries again.
            loading = null;
          });
      }
    };
    const reach = (event) => {
      const target = event.target;
      if (target && target.closest && target.closest("a[data-buy], [data-sheet^='achat-']")) load();
    };
    for (const type of ["pointerover", "pointerdown", "touchstart", "focusin"]) {
      document.addEventListener(type, reach, { passive: true });
    }

    document.addEventListener("click", (event) => {
      const link = event.target.closest && event.target.closest("a[data-buy]");
      if (!link || !checkout || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const from = link.closest("dialog.sheet");
      if (from && from.open) from.close();
      for (const what of paySheet.querySelectorAll("[data-pay-what]")) what.textContent = link.dataset.buy || "";
      const direct = paySheet.querySelector("[data-pay-link]");
      if (direct) direct.href = link.href;
      started = false;
      payState("open");
      if (!paySheet.open) paySheet.showModal();
      checkout.setAttribute("src", link.href);
      // Inside the tap: a window opened later would be blocked.
      checkout.open();
    });

    paySheet.addEventListener("click", (event) => {
      const waiting = paySheet.dataset.state === "open";
      if (event.target.closest("[data-pay-cancel], [data-pay-link]")) {
        paySheet.close();
      } else if (waiting && checkout && (event.target === paySheet || event.target.closest("[data-pay-focus]"))) {
        // A tap on the dimmed page, or the button: bring the shop's window back.
        checkout.focus();
      }
    });
    // Closed while the window was still open (the button, the Escape key): the window goes too.
    paySheet.addEventListener("close", () => {
      const waiting = paySheet.dataset.state === "open";
      payState("idle");
      if (waiting && checkout) checkout.close();
    });
  }

  // Inline forms: post without leaving the page, then say what happened. A
  // redirect to data-reload means "you are recognized now" → show that page.
  for (const form of document.querySelectorAll("[data-inline-form]")) {
    const note = document.createElement("p");
    note.className = "form-note";
    note.setAttribute("role", "status");
    form.after(note);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("[type=submit]");
      if (button) button.disabled = true;
      note.classList.remove("is-error");
      note.textContent = "";
      try {
        const response = await fetch(form.action, { method: "POST", body: new URLSearchParams(new FormData(form)) });
        const landed = new URL(response.url);
        if (response.ok && response.redirected && form.dataset.reload && landed.pathname === form.dataset.reload) {
          location.assign(landed.href);
          return;
        }
        if (response.ok) {
          form.hidden = true;
          note.textContent = form.dataset.done || "";
          return;
        }
        note.classList.add("is-error");
        note.textContent = response.status === 429 ? "Trop de tentatives. Réessayer dans une minute." : form.dataset.error || "";
      } catch {
        form.submit();
        return;
      }
      if (button) button.disabled = false;
    });
  }

  // Video messages. Until one is started it shows a cover: the poster, one play
  // key, the length — then the browser's own controls. One sound at a time,
  // audio or video. Nothing is fetched before the key is pressed.
  for (const frame of document.querySelectorAll("[data-video]")) {
    const film = frame.querySelector("video");
    const key = frame.querySelector("[data-video-play]");
    if (!film || !key) continue;
    film.controls = false;
    const started = () => {
      frame.classList.add("is-started");
      film.controls = true;
    };
    key.addEventListener("click", () => {
      // A film that cannot start still hands over to the browser's player, which says why.
      film.play().catch(started);
    });
    film.addEventListener("play", () => {
      started();
      for (const other of document.querySelectorAll("audio, video")) {
        if (other !== film) other.pause();
      }
    });
  }

  // Audio players. One plays at a time; the waveform is the progress bar.
  const clock = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  };
  const players = [...document.querySelectorAll("[data-player]")];
  for (const player of players) {
    const audio = player.querySelector("audio");
    // A track has two ways to play it: its picture and its play key.
    const toggles = [...player.querySelectorAll("[data-player-toggle]")];
    const toggle = toggles[0];
    const whole = player.querySelector("[data-player-total]");
    const bar = player.querySelector("[data-player-bar]");
    const time = player.querySelector("[data-player-time]");
    if (!audio || !toggle || !bar) continue;

    const paint = () => {
      const total = Number.isFinite(audio.duration) ? audio.duration : 0;
      const ratio = total > 0 ? audio.currentTime / total : 0;
      bar.style.setProperty("--p", `${(ratio * 100).toFixed(2)}%`);
      bar.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      if (whole) {
        // "0:42 / 3:10": the figure that moves and the length, side by side.
        whole.textContent = clock(total);
        if (time) time.textContent = clock(audio.currentTime);
      } else if (time) {
        time.textContent = audio.paused && audio.currentTime === 0 ? clock(total) : clock(audio.currentTime);
      }
    };
    const seek = (clientX) => {
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      if (Number.isFinite(audio.duration)) audio.currentTime = ratio * audio.duration;
      paint();
    };

    // A message sent before the back office read the sound: its bars are a drawing.
    // The first time it is played, they are read from the file and drawn again.
    let read = player.dataset.wave !== "auto";
    const readWave = async () => {
      if (read) return;
      read = true;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      try {
        const data = await (await fetch(audio.currentSrc || audio.src, { credentials: "same-origin" })).arrayBuffer();
        const context = new Context();
        const sound = await context.decodeAudioData(data);
        void context.close();
        const samples = sound.getChannelData(0);
        const fine = player.classList.contains("track");
        const bars = fine ? 104 : 44;
        const step = fine ? 3 : 5;
        const width = fine ? 1.3 : 3;
        const share = Math.max(1, Math.floor(samples.length / bars));
        const levels = [];
        let top = 0;
        for (let index = 0; index < bars; index += 1) {
          let peak = 0;
          for (let at = index * share, end = Math.min(samples.length, at + share); at < end; at += 8) {
            const level = Math.abs(samples[at]);
            if (level > peak) peak = level;
          }
          levels.push(peak);
          if (peak > top) top = peak;
        }
        let rects = "";
        levels.forEach((level, index) => {
          const height = Math.max(3, Math.round((top > 0 ? level / top : 0) * 30));
          rects += `<rect x="${index * step}" y="${(32 - height) / 2}" width="${width}" height="${height}" rx="${width / 2}"/>`;
        });
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bars * step - (step - width)} 32" preserveAspectRatio="none">${rects}</svg>`;
        bar.style.setProperty("--wave", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
      } catch {
        // The drawn bars stay.
      }
    };

    const flip = () => {
      if (audio.paused) {
        void readWave();
        for (const other of players) {
          const sound = other.querySelector("audio");
          if (sound && sound !== audio) sound.pause();
        }
        for (const film of document.querySelectorAll("[data-video] video")) film.pause();
        void audio.play();
      } else {
        audio.pause();
      }
    };
    for (const key of toggles) key.addEventListener("click", flip);
    audio.addEventListener("play", () => {
      player.classList.add("is-playing");
      for (const key of toggles) key.setAttribute("aria-label", "Mettre en pause");
    });
    audio.addEventListener("pause", () => {
      player.classList.remove("is-playing");
      for (const key of toggles) key.setAttribute("aria-label", "Lire");
    });
    audio.addEventListener("ended", () => {
      audio.currentTime = 0;
      paint();
    });
    audio.addEventListener("timeupdate", paint);
    audio.addEventListener("loadedmetadata", paint);
    bar.addEventListener("pointerdown", (event) => {
      bar.setPointerCapture(event.pointerId);
      seek(event.clientX);
    });
    bar.addEventListener("pointermove", (event) => {
      if (bar.hasPointerCapture(event.pointerId)) seek(event.clientX);
    });
    bar.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime + (event.key === "ArrowRight" ? 5 : -5));
    });
    paint();
  }
})();
