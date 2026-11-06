// Turns a course's markdown into the content Starlight builds. The course is never changed.
//
// Written, all git-ignored and rewritten on every run:
//   src/content/docs/        one markdown file per page, with the title and description in its frontmatter
//   public/course-files/     the images, and any other file a lesson links to, served as they are
//   src/generated/course.json   the course's name, base path and sidebar, which astro.config.mjs reads
//
// What it does to a lesson:
//   - the first "# Heading" becomes the page title, and is taken out of the body, as Starlight prints the title
//   - the description is the frontmatter's, or the first paragraph long enough to describe the page
//   - links between lessons ("02-next.md", "../02-git/01-save-points.md#top") become the pages' URLs
//   - links and images that point at a file in the course ("images/map.svg") point at the copy that is served
//   - any other frontmatter is dropped
//
// Numbers in folder and file names set the order and are not in the URLs, so renumbering never moves a page.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { rewriteTargets } from './lib/convert.mjs';
import { readCourse, servedPath } from './lib/course.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = path.join(root, 'src/content/docs');
const FILES_DIR = path.join(root, 'public/course-files');
const META_FILE = path.join(root, 'src/generated/course.json');

/** Every file under a folder, relative to it. */
function listFiles(dir, rel = '') {
    if (!existsSync(path.join(dir, rel))) return [];
    return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(entry => {
        const next = rel ? `${rel}/${entry.name}` : entry.name;
        return entry.isDirectory() ? listFiles(dir, next) : [next];
    });
}

function removeEmptyFolders(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) removeEmptyFolders(path.join(dir, entry.name));
    }
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
}

/** Makes a folder hold exactly the wanted files, writing only the ones that differ so a watcher sees only real changes. */
function reconcile(dir, wanted) {
    mkdirSync(dir, { recursive: true });
    for (const rel of listFiles(dir)) {
        if (!wanted.has(rel)) rmSync(path.join(dir, rel));
    }
    for (const [rel, source] of wanted) {
        const dest = path.join(dir, rel);
        const content = typeof source === 'string' ? Buffer.from(source) : readFileSync(source.from);
        if (existsSync(dest) && readFileSync(dest).equals(content)) continue;
        mkdirSync(path.dirname(dest), { recursive: true });
        if (typeof source === 'string') writeFileSync(dest, source);
        else copyFileSync(source.from, dest);
    }
    removeEmptyFolders(dir);
}

/**
 * Syncs one course. `repo` is the course repo's folder, which holds `course/`, and `slug` is the repo's name on
 * GitHub, the first segment of every URL.
 *
 * Returns what the site needs (`name`, `slug`, `base`, `sidebar`), the problems found (`warnings`, `ignored`), and
 * whether the sidebar or the name changed since the last run (`structureChanged`), which only a restart picks up.
 */
export function syncCourse({ repo, slug }) {
    const courseDir = path.join(repo, 'course');
    const course = readCourse(courseDir);
    const base = `/${slug}`;
    const warnings = [];
    const bySource = new Map(course.pages.map(page => [page.source, page]));
    const docs = new Map();
    const files = new Map();
    for (const asset of course.assets) files.set(asset.to, { from: asset.from });

    const urlOf = page => (page.slug === 'index' ? `${base}/` : `${base}/${page.slug}/`);

    const targetRewriter = page => target => {
        const [, pathPart, rest = ''] = target.match(/^([^#?]*)([#?].*)?$/);
        if (!pathPart) return target;
        let resolved;
        try {
            resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page.source), decodeURI(pathPart)));
        } catch {
            warnings.push(`${page.source}: cannot read the link ${target}`);
            return target;
        }
        if (resolved.startsWith('../')) {
            warnings.push(`${page.source}: ${target} goes outside the course folder, so it is not on the site`);
            return target;
        }
        const linked = bySource.get(resolved);
        if (linked) return urlOf(linked) + rest;
        const file = path.join(courseDir, resolved);
        if (existsSync(file) && statSync(file).isFile()) {
            if (resolved.endsWith('.md')) {
                warnings.push(`${page.source}: ${target} is a page the layout leaves out, so the link goes nowhere`);
                return target;
            }
            const served = servedPath(resolved);
            files.set(served, { from: file });
            return `${base}/course-files/${encodeURI(served)}${rest}`;
        }
        warnings.push(`${page.source}: ${target} does not exist`);
        return target;
    };

    for (const page of course.pages) {
        const front = { title: page.title, ...(page.description ? { description: page.description } : {}) };
        const body = rewriteTargets(page.body, targetRewriter(page)).trimEnd();
        docs.set(page.slug === 'index' ? 'index.md' : `${page.slug}.md`, `---\n${stringify(front, { lineWidth: 0 })}---\n\n${body}\n`);
    }

    // A course without a landing page gets a plain one, so the site's front address is not a 404.
    if (!course.landing) {
        const front = { title: course.config.name, ...(course.config.description ? { description: String(course.config.description) } : {}) };
        const list = course.chapters.map(chapter => `- [${chapter.overview.title}](${base}/${chapter.overview.slug}/)`).join('\n');
        const intro = course.config.description ? `${course.config.description}\n\n` : '';
        docs.set('index.md', `---\n${stringify(front, { lineWidth: 0 })}---\n\n${intro}${list ? `## Chapters\n\n${list}\n` : ''}`);
    }

    reconcile(DOCS_DIR, docs);
    reconcile(FILES_DIR, files);

    const meta = { name: course.config.name.trim(), slug, base, sidebar: course.sidebar };
    const next = JSON.stringify(meta, null, 4) + '\n';
    const previous = existsSync(META_FILE) ? readFileSync(META_FILE, 'utf8') : '';
    const structureChanged = next !== previous;
    if (structureChanged) {
        mkdirSync(path.dirname(META_FILE), { recursive: true });
        writeFileSync(META_FILE, next);
    }
    return { ...meta, pages: course.pages.length, files: files.size, warnings, ignored: course.ignored, structureChanged };
}
