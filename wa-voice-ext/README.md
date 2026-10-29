# WA Voice File Sender (Firefox extension)

Lets you send any audio file to a WhatsApp Web chat so it shows up as a
real **voice message** (the waveform bubble), instead of uploading it as a
regular document/audio attachment.

## How it works

WhatsApp Web only turns an upload into a "voice message" bubble when the
audio comes from its own recorder (mic button), not from the regular file
picker. This extension doesn't fight that — it feeds your chosen audio file
into WhatsApp's recorder *as if it were your microphone*:

1. You pick an audio file via the extension's floating button.
2. The extension decodes it and builds a fake "microphone" stream from it.
3. The next time WhatsApp asks for mic access (i.e. when you press its own
   mic button), it gets your audio file instead of your real mic.
4. WhatsApp handles the rest — encoding, the voice-note flag, sending —
   exactly as it would for a normal recording, so this keeps working even
   if WhatsApp changes unrelated parts of its page.

The extension tries to auto-press WhatsApp's mic button for you, but that
part is best-effort (WhatsApp's layout can change). If it can't find the
button, a prompt tells you to press & hold it yourself — the important
part (your file being "heard" as the mic) still works either way.

## Install (temporary, for testing)

1. Open Firefox, go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` inside this folder.
4. Go to `web.whatsapp.com`, open a chat — a round mic button appears
   near the bottom-right of the page.

This load lasts until Firefox restarts. For a permanent install you'd need
to sign the extension via Mozilla's add-on developer hub (self-distribution
is free) or load it unsigned in Firefox Developer Edition / Nightly with
`xpinstall.signatures.required` set to `false`.

## Use

1. Click the floating mic button.
2. Pick an audio file (mp3, wav, m4a, ogg, etc. — anything your browser's
   Web Audio API can decode).
3. A message tells you the file is ready. Press & hold WhatsApp's own mic
   button (or tap it, depending on your WhatsApp version) like you
   normally would to record a voice note.
4. When the toast says playback has finished, release / tap send in
   WhatsApp as usual.

## Settings

Click the toolbar icon → Settings to:
- Turn the auto-press convenience feature on/off.
- Edit the CSS selectors used to find WhatsApp's mic button, if a WhatsApp
  update breaks auto-detection (right-click the mic button → Inspect to
  find a new selector).
- Change how long the extension waits for you to press the mic before
  giving up.

## Limitations

- This is unofficial and depends on WhatsApp Web's current behavior; a
  future WhatsApp update could change how recording works and require
  tweaks.
- Only works for audio WhatsApp Web itself can play (standard codecs like
  MP3/AAC/Opus/WAV).
- Auto-pressing the mic button is best-effort; manually pressing it always
  works as a fallback.
