// One emoji look on every device: emoji characters are replaced by bundled Twemoji pictures
// (CC-BY 4.0, https://github.com/jdecked/twemoji), both in the page (DOM) and on the canvas.
import { EMOJI_FILES } from './emoji-set.js?v=552';

export const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?|[\u{1F3FB}-\u{1F3FF}])*/gu;

function codeOf(e) {
  let cps = [...e].map((c) => c.codePointAt(0));
  if (!cps.includes(0x200d)) cps = cps.filter((c) => c !== 0xfe0f);   // Twemoji file names drop VS16 outside ZWJ sequences
  return cps.map((c) => c.toString(16)).join('-');
}
export function emojiSrc(e) { const c = codeOf(e); return EMOJI_FILES.has(c) ? `assets/emoji/${c}.png` : null; }

// ---- canvas ----
const cache = new Map();
export function emojiImage(e) {
  const src = emojiSrc(e); if (!src) return null;
  let im = cache.get(src);
  if (!im) { im = new Image(); im.src = src; cache.set(src, im); }
  return im.complete && im.naturalWidth ? im : null;
}
export function preloadEmoji() { for (const c of EMOJI_FILES) emojiImage(String.fromCodePoint(...c.split('-').map((h) => parseInt(h, 16)))); }

// ---- DOM ----
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
function fixTextNode(n) {
  const s = n.nodeValue; EMOJI_RE.lastIndex = 0;
  if (!s || !EMOJI_RE.test(s)) return;
  EMOJI_RE.lastIndex = 0;
  const frag = document.createDocumentFragment(); let last = 0, m, changed = false;
  while ((m = EMOJI_RE.exec(s))) {
    const src = emojiSrc(m[0]); if (!src) continue;
    if (m.index > last) frag.append(s.slice(last, m.index));
    const img = document.createElement('img'); img.className = 'em'; img.alt = m[0]; img.src = src; img.draggable = false;
    frag.append(img); last = m.index + m[0].length; changed = true;
  }
  if (!changed) return;
  if (last < s.length) frag.append(s.slice(last));
  n.replaceWith(frag);
}
export function emojifyDom(root) {
  if (root.nodeType === 3) { if (root.parentNode && !SKIP.has(root.parentNode.nodeName)) fixTextNode(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (SKIP.has(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const list = []; while (w.nextNode()) list.push(w.currentNode);
  list.forEach(fixTextNode);
}
export function watchEmoji() {
  emojifyDom(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') emojifyDom(m.target);
      else m.addedNodes.forEach((n) => emojifyDom(n));
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

// HTML strings get the pictures before they reach the page: no frame with text emoji, no blinking on re-render
export function emojiHtml(html) {
  return html.replace(EMOJI_RE, (e) => { const src = emojiSrc(e); return src ? `<img class="em" alt="${e}" src="${src}" draggable="false">` : e; });
}
