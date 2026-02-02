# ChatGPT Response Jumper

A Chrome (Manifest V3) content-script extension that adds a **right-side “Responses” panel** for ChatGPT pages. The panel lists assistant replies and lets you click to jump directly to them.

This project is intentionally built so:
- **Sizing/layout lives in CSS** (widths, padding, margins, font-size, line-height, etc.)
- **JavaScript only** creates the panel, rebuilds the list, and handles click-to-jump + lightweight state

---

## Features

- **Right rail panel** with clickable list of assistant responses
- **Jump to Latest** button
- **Filter** responses by text
- **Collapsed mode** (optional CSS behavior)
- Optional “code ready” highlighting (if your CSS supports `.bbj-code-pending` / `.bbj-code-ready`)

---

## Where it runs

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

---

## Install (Unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the extension folder (the folder containing `manifest.json`)
5. Open ChatGPT and refresh the page

To apply changes:
- Click **Reload** on the extension in `chrome://extensions`, then refresh ChatGPT.

---

## Project structure

```txt
ChatGPT_Response_Jumper/
  manifest.json
  scripts/
    content.js
  styles/
    css-vars.css
    upper.css
    composer.css
    panel.css
    common.css
    (any extra files you add: backgrounds.css, fonts.css, etc.)
  icons/
    icon16.png
    icon32.png
    icon48.png
    icon128.png
