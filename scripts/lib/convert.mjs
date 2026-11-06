// The small conversions the sync step applies to one lesson's markdown. Nothing here touches the disk.

import { parse as parseYaml } from 'yaml';

/** Splits a leading `---` YAML block from the body. A file without one has no data. */
export function splitFrontmatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    if (!match) return { data: {}, body: text };
    return { data: parseYaml(match[1]) ?? {}, body: text.slice(match[0].length) };
}

/**
 * Takes the first `# Heading` off the body when it is the first thing in it. Starlight prints the page title as
 * the page's own heading, so keeping this one would show the title twice.
 */
export function takeHeading(body) {
    const lines = body.split('\n');
    let first = 0;
    while (first < lines.length && lines[first].trim() === '') first++;
    const match = lines[first]?.match(/^#\s+(.+?)\s*#*\s*$/);
    if (!match) return { title: undefined, body };
    let rest = first + 1;
    while (rest < lines.length && lines[rest].trim() === '') rest++;
    return { title: match[1].trim(), body: lines.slice(rest).join('\n') };
}

/** Markdown inline marks off a line of text: links, code, emphasis. */
function plain(text) {
    return text
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[`*_]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 160;

/**
 * The first paragraph of prose long enough to describe the page, flattened to text and cut at a word near 160
 * characters. A short opening line such as "About 20 minutes." is skipped for the paragraph after it.
 */
export function describe(body) {
    const paragraphs = [];
    let current = [];
    let fence = null;
    const flush = () => {
        if (current.length) paragraphs.push(current.join(' '));
        current = [];
    };
    for (const line of body.split('\n')) {
        const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
        if (fence) {
            if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
            continue;
        }
        if (marker) {
            flush();
            fence = marker;
            continue;
        }
        // Anything that is not plain prose ends a paragraph and is not part of one.
        if (line.trim() === '' || /^\s*(#|>|\||[-*+]\s|\d+[.)]\s|<|!\[|\s{4})/.test(line)) {
            flush();
            continue;
        }
        current.push(line.trim());
    }
    flush();
    const text = paragraphs.map(plain).find(p => p.length >= MIN_DESCRIPTION);
    if (!text) return undefined;
    if (text.length <= MAX_DESCRIPTION) return text;
    const cut = text.slice(0, MAX_DESCRIPTION - 1);
    return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}

const INLINE_LINK = /(!?\[[^\]]*\])\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;

/**
 * Passes every relative link and image target of the body to `rewrite(target)`, which returns the new target. Code
 * blocks are left alone. Absolute URLs, mail links and in-page `#anchors` never reach it.
 */
export function rewriteTargets(body, rewrite) {
    let fence = null;
    return body
        .split('\n')
        .map(line => {
            const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
            if (fence) {
                if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
                return line;
            }
            if (marker) {
                fence = marker;
                return line;
            }
            return line.replace(INLINE_LINK, (whole, label, target, title) => {
                if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) return whole;
                return `${label}(${rewrite(target)}${title})`;
            });
        })
        .join('\n');
}
