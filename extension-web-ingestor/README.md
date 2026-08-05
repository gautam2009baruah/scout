# Scout Web Ingestor (browser extension)

A tiny, separate browser extension for pulling **login-protected** web pages into a
Scout knowledge-base folder. It is unrelated to the Guided Workflow Recorder
extension — install only what you need.

Because it runs inside your own browser, every page it fetches reuses the login
session you already have in another tab. No site credentials are ever given to
Scout; only the resulting page HTML is uploaded.

## Install (load unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension-web-ingestor/` folder.

## Use

1. In Scout, open **Web Ingestor**, pick the target folder, and click
   **Generate pairing token**. Copy the Scout URL and token.
2. Click the extension icon → open **Scout connection** → paste the Scout URL and
   token (stored locally in the browser).
3. Log into the target site in a normal browser tab.
4. Back in the extension, enter a **Start URL** and either:
   - **Crawl site** — walks same-origin links (tick *Crawl the entire site* to
     lift the page cap), or
   - **Capture this tab** — grabs just the page you are currently viewing
     (best for JavaScript-heavy pages).

Ingested pages appear in the chosen folder and run through the normal
parse → chunk → embed pipeline.

## Notes / limits

- Same-origin only; a hard ceiling of 5000 pages applies even for "entire site".
- The pairing token is scoped to one company + folder and expires (default 24h).
- Very JavaScript-driven apps (incl. Google Drive / SharePoint web UIs) are
  better handled by "Capture this tab" or the server-side connectors.
