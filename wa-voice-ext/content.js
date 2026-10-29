/*
 * WA Voice File Sender — content script (runs in the isolated/extension
 * world). Responsible for the UI (floating button, file picker, toast) and
 * for talking to page-inject.js, which does the actual getUserMedia patch
 * in the page's own JS context (see page-inject.js for why that split
 * exists).
 */
(function () {
  const NS = "wvfs";

  const DEFAULT_SELECTORS = [
    'span[data-icon="ptt"]',
    'span[data-icon="voice-mic"]',
    'span[data-icon="mic"]',
    'span[data-testid="ptt"]',
    'button[aria-label*="voice message" i]',
    'button[aria-label*="record" i]',
    '[data-testid="audio-input"]',
    '[data-testid="compose-btn-mic"]',
  ];
  const DEFAULT_PAUSE_SELECTORS = [
    'span[data-icon="audio-pause"]',
    'span[data-icon="pause"]',
    'span[data-testid="audio-pause"]',
    'button[aria-label*="pause" i]',
    '[data-testid="audio-pause"]',
  ];
  const DEFAULTS = {
    autoPress: true,
    autoPause: true,
    pendingTimeoutSeconds: 60,
    micSelectors: DEFAULT_SELECTORS.join("\n"),
    pauseSelectors: DEFAULT_PAUSE_SELECTORS.join("\n"),
  };

  let settings = { ...DEFAULTS };
  let currentFileName = "";
  let toastEl = null;
  let toastTimer = null;

  function loadSettings() {
    try {
      return browser.storage.local.get(DEFAULTS).then((stored) => {
        settings = { ...DEFAULTS, ...stored };
      });
    } catch (e) {
      return Promise.resolve();
    }
  }

  function injectPageScript() {
    const s = document.createElement("script");
    s.src = browser.runtime.getURL("page-inject.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- UI ----------

  function ensureToast() {
    if (toastEl) return toastEl;
    toastEl = document.createElement("div");
    toastEl.id = "wvfs-toast";
    toastEl.style.display = "none";

    const text = document.createElement("span");
    text.id = "wvfs-toast-text";
    toastEl.appendChild(text);

    const close = document.createElement("button");
    close.id = "wvfs-toast-close";
    close.type = "button";
    close.title = "Dismiss";
    close.textContent = "×";
    close.addEventListener("click", hideToast);
    toastEl.appendChild(close);

    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(html, { error = false, sticky = false } = {}) {
    const el = ensureToast();
    el.querySelector("#wvfs-toast-text").innerHTML = html;
    el.classList.toggle("wvfs-error", error);
    el.style.display = "flex";
    if (toastTimer) clearTimeout(toastTimer);
    if (!sticky) {
      toastTimer = setTimeout(() => {
        el.style.display = "none";
      }, 6000);
    }
  }

  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastEl) toastEl.style.display = "none";
  }

  function micIconSvg() {
    return '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';
  }

  function createButton() {
    if (document.getElementById("wvfs-btn")) return;
    const btn = document.createElement("div");
    btn.id = "wvfs-btn";
    btn.title = "Send an audio file as a voice message";
    btn.innerHTML = micIconSvg();
    btn.style.position = "fixed";
    btn.style.right = "24px";
    btn.style.bottom = "100px";
    btn.style.zIndex = "999998";
    btn.style.background = "#202c33";
    document.body.appendChild(btn);

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.style.display = "none";
    document.body.appendChild(input);

    btn.addEventListener("click", () => {
      input.value = "";
      input.click();
    });

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (file) handleFile(file);
    });
  }

  // ---------- Flow ----------

  function handleFile(file) {
    const btn = document.getElementById("wvfs-btn");
    currentFileName = file.name;
    if (btn) btn.classList.add("wvfs-busy");
    showToast(
      `Preparing <b>${escapeHtml(file.name)}</b>&hellip;`,
      { sticky: true }
    );

    file.arrayBuffer().then((arrayBuffer) => {
      window.postMessage(
        {
          source: NS + "-content",
          type: "start",
          detail: {
            arrayBuffer,
            mimeType: file.type,
            selectors: parseSelectors(settings.micSelectors),
            pauseSelectors: parseSelectors(settings.pauseSelectors),
            autoPress: settings.autoPress,
            autoPause: settings.autoPause,
            pendingTimeoutMs: Math.max(5, Number(settings.pendingTimeoutSeconds) || 60) * 1000,
          },
        },
        "*",
        [arrayBuffer]
      );
    }).catch((err) => {
      if (btn) btn.classList.remove("wvfs-busy");
      showToast(`Could not read that file: ${escapeHtml(err.message)}`, { error: true });
    });
  }

  function parseSelectors(text) {
    return String(text || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== NS + "-inject") return;

    const btn = document.getElementById("wvfs-btn");

    switch (data.type) {
      case "ready": {
        const dur = fmtDuration(data.detail.duration);
        showToast(
          `Loaded <b>${escapeHtml(currentFileName)}</b> (${dur}). ` +
          `Now press &amp; hold the microphone button in WhatsApp as usual ` +
          `&mdash; it will record this file instead of your real mic.`,
          { sticky: true }
        );
        break;
      }
      case "auto-press":
        if (!data.detail.found) {
          showToast(
            `Ready &mdash; couldn&rsquo;t find WhatsApp&rsquo;s mic button automatically, ` +
            `so press &amp; hold it yourself now to start recording ` +
            `<b>${escapeHtml(currentFileName)}</b>.`,
            { sticky: true }
          );
        }
        break;
      case "recording-started":
        if (btn) btn.classList.remove("wvfs-busy");
        showToast(
          `Recording &ldquo;${escapeHtml(currentFileName)}&rdquo; ` +
          `(${fmtDuration(data.detail.duration)})&hellip; ` +
          `keep the mic held / locked until it finishes.`,
          { sticky: true }
        );
        break;
      case "playback-ended":
        if (data.detail.autoPaused) {
          showToast(
            `Done playing <b>${escapeHtml(currentFileName)}</b> &mdash; ` +
            `paused the recording. Tap send in WhatsApp when you&rsquo;re ready.`,
            { sticky: true }
          );
        } else {
          showToast(
            `Done playing <b>${escapeHtml(currentFileName)}</b> &mdash; ` +
            `couldn&rsquo;t auto-pause, so pause/send it yourself in WhatsApp now.`,
            { sticky: true }
          );
        }
        break;
      case "timeout":
        if (btn) btn.classList.remove("wvfs-busy");
        hideToast();
        break;
      case "error":
        if (btn) btn.classList.remove("wvfs-busy");
        showToast(escapeHtml(data.detail.message), { error: true });
        break;
      case "cleared":
        if (btn) btn.classList.remove("wvfs-busy");
        break;
      default:
        break;
    }
  });

  // ---------- Boot ----------

  function boot() {
    injectPageScript();
    createButton();
    // Re-create the button if WhatsApp Web re-renders its root and wipes it.
    const observer = new MutationObserver(() => {
      if (!document.getElementById("wvfs-btn")) createButton();
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  loadSettings().then(boot);

  try {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      for (const key of Object.keys(changes)) {
        settings[key] = changes[key].newValue;
      }
    });
  } catch (e) {
    /* storage API unavailable in some contexts; settings stay at defaults */
  }
})();
