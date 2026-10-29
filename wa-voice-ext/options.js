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

const el = {
  autoPress: document.getElementById("autoPress"),
  autoPause: document.getElementById("autoPause"),
  timeout: document.getElementById("timeout"),
  selectors: document.getElementById("selectors"),
  pauseSelectors: document.getElementById("pauseSelectors"),
  save: document.getElementById("save"),
  status: document.getElementById("status"),
};

function load() {
  browser.storage.local.get(DEFAULTS).then((stored) => {
    el.autoPress.checked = !!stored.autoPress;
    el.autoPause.checked = !!stored.autoPause;
    el.timeout.value = stored.pendingTimeoutSeconds;
    el.selectors.value = stored.micSelectors;
    el.pauseSelectors.value = stored.pauseSelectors;
  });
}

el.save.addEventListener("click", () => {
  browser.storage.local
    .set({
      autoPress: el.autoPress.checked,
      autoPause: el.autoPause.checked,
      pendingTimeoutSeconds: Math.max(5, Number(el.timeout.value) || 60),
      micSelectors: el.selectors.value,
      pauseSelectors: el.pauseSelectors.value,
    })
    .then(() => {
      el.status.textContent = "Saved.";
      setTimeout(() => (el.status.textContent = ""), 2000);
    });
});

load();
