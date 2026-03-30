# Chat Turbo

Chrome extension that fixes lag in long AI chat conversations by virtualizing off-screen messages.

Works on **Claude.ai** and **ChatGPT**.

## The Problem

Long conversations (500+ messages) on Claude.ai and ChatGPT become painfully slow. Scrolling stutters, clicking the text box takes seconds, and sending messages can hang for 10-15 seconds. The browser is drowning in thousands of DOM nodes.

## How It Works

Chat Turbo collapses old messages that aren't on screen, replacing them with lightweight spacer divs that preserve scroll position. When you scroll up, messages are seamlessly restored. When you scroll away, they collapse again.

- **No data collected** — runs entirely in your browser
- **No API calls** — pure DOM manipulation
- **Toggle on/off** from the popup
- **Adjustable** — control how many recent messages stay visible (10-100)

## Two Versions

### `stable/` — Safe Mode
Hides messages with `display: none`. The DOM nodes still exist but are removed from layout calculations. Zero risk of breaking the page.

### `experimental/` — Full DOM Removal
Actually removes message elements from the DOM and stores them in memory. Significantly smoother because the browser has far fewer nodes to manage. Slightly riskier — if the site's React does a full re-render, it may not find the removed nodes. In practice, this works well but could break with site updates.

**Recommendation:** Start with `experimental/`. Fall back to `stable/` if anything breaks.

## Install

1. Download or clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select either the `stable/` or `experimental/` folder
6. Open a long conversation on Claude.ai or ChatGPT

## Badge

The bottom-right badge shows the current state:

| Badge | Meaning |
|-------|---------|
| `scanning...` | Looking for the message container |
| `120 msgs` | Found messages, none collapsed yet |
| `90↓ 30↑ / 120` | 90 collapsed, 30 visible, 120 total |
| `OFF` | Extension disabled via popup |

## Technical Details

- **Site detection** — uses hostname to pick the right DOM selectors for each site
- **Chunked processing** — collapses messages in batches of 100 per `requestAnimationFrame`, yielding the main thread between batches so the page stays responsive
- **IntersectionObserver** — handles scroll-based restore/re-collapse with zero `getBoundingClientRect` calls
- **MutationObserver** — reacts instantly to new messages instead of polling
- **Read/write batching** — measures all heights first, then does all DOM mutations, avoiding layout thrashing

## Supported Sites

| Site | Message Selector | Status |
|------|-----------------|--------|
| claude.ai | `.flex-1.flex.flex-col.px-4.max-w-3xl` | Working |
| chatgpt.com | `[data-message-id]` | Working |
| chat.openai.com | `[data-message-id]` | Working |

## License

MIT
