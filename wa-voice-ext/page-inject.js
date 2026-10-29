/*
 * WA Voice File Sender — page-context script.
 *
 * This file is injected with a <script> tag (not as a content script), so it
 * runs with the *page's own* JavaScript privileges. That's required because
 * Firefox content scripts see the DOM through "Xray" wrappers: reassigning
 * navigator.mediaDevices.getUserMedia from a content script would only be
 * visible to the content script itself, not to WhatsApp Web's own code. A
 * real <script> tag has no such wrapper, so the patch below is seen by
 * WhatsApp Web exactly as if the browser's real getUserMedia had been
 * replaced.
 *
 * What it does, conceptually: when the user picks an audio file, we decode
 * it into an AudioBuffer and build a MediaStream carrying that audio via
 * createMediaStreamDestination(). We then wait for the *next* microphone
 * request WhatsApp Web makes (i.e. when the user presses the record button)
 * and hand back our synthetic stream instead of the real microphone. From
 * WhatsApp's point of view it looks exactly like a normal mic, so its own
 * recording / voice-note pipeline (encoding, the "ptt" flag, etc.) is used
 * unmodified — we never touch WhatsApp's internals or send anything on the
 * user's behalf.
 */
(function () {
  const NS = "wvfs";
  const origGetUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    : null;

  let pending = null; // { stream, audioEl, timeoutId, source, ctx }

  function post(type, detail) {
    window.postMessage({ source: NS + "-inject", type, detail }, "*");
  }

  function clearPending(reason) {
    if (!pending) return;
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    pending = null;
    if (reason) post("cleared", { reason });
  }

  if (origGetUserMedia && navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = function (constraints) {
      const wantsAudio = !!(constraints && constraints.audio);
      const wantsVideo = !!(constraints && constraints.video);
      if (pending && wantsAudio && !wantsVideo) {
        const fake = pending;
        pending = null;
        if (fake.timeoutId) clearTimeout(fake.timeoutId);
        try {
          fake.source.start(0);
        } catch (e) {
          // already started or context closed; fall through to real mic
          post("error", { message: "Could not start playback: " + e.message });
          return origGetUserMedia(constraints);
        }
        post("recording-started", { duration: fake.duration });
        return Promise.resolve(fake.stream);
      }
      return origGetUserMedia(constraints);
    };
  }

  function findButton(selectors) {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const btn = el.closest('button, [role="button"]') || el;
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return btn;
        }
      } catch (e) {
        /* invalid selector from user config; ignore */
      }
    }
    return null;
  }

  function dispatchPress(el) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
    } catch (e) { /* PointerEvent may not be fully supported */ }
    el.dispatchEvent(new MouseEvent("mousedown", opts));
  }

  function dispatchClick(el) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
    } catch (e) { /* ignore */ }
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  async function startFlow(arrayBuffer, mimeType, selectors, pauseSelectors, autoPress, autoPause, pendingTimeoutMs) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const dest = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);
      source.onended = () => {
        if (autoPause) {
          const pauseBtn = findButton(pauseSelectors);
          if (pauseBtn) {
            dispatchClick(pauseBtn);
            post("playback-ended", { autoPaused: true });
          } else {
            post("playback-ended", { autoPaused: false });
          }
        } else {
          post("playback-ended", { autoPaused: false });
        }
      };

      pending = {
        stream: dest.stream,
        source,
        ctx,
        duration: audioBuffer.duration,
      };

      pending.timeoutId = setTimeout(() => {
        clearPending("timeout");
        post("timeout", {});
      }, pendingTimeoutMs);

      post("ready", { duration: audioBuffer.duration });

      if (autoPress) {
        const btn = findButton(selectors);
        if (btn) {
          dispatchPress(btn);
          post("auto-press", { found: true });
        } else {
          post("auto-press", { found: false });
        }
      }
    } catch (err) {
      post("error", { message: "Could not decode audio file: " + (err && err.message ? err.message : err) });
      clearPending();
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== NS + "-content") return;

    if (data.type === "start") {
      const { arrayBuffer, mimeType, selectors, pauseSelectors, autoPress, autoPause, pendingTimeoutMs } = data.detail;
      clearPending();
      startFlow(
        arrayBuffer,
        mimeType,
        selectors || [],
        pauseSelectors || [],
        !!autoPress,
        !!autoPause,
        pendingTimeoutMs || 60000
      );
    } else if (data.type === "cancel") {
      if (pending && pending.ctx) {
        try { pending.ctx.close(); } catch (e) {}
      }
      clearPending("cancelled-by-user");
    }
  });

  post("inject-ready", {});
})();
