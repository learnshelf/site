// Reads a course folder and works out its pages and its sidebar. The layout it expects is in README.md.
//
//   course/
//     config.yml          name: the course's name (required)
//     index.md            the landing page (optional)
//     01-chapter-name/    a chapter; the number only sets the order
//       00-overview.md    the chapter's name (its # heading) and first page (required)
//       01-lesson.md      a lesson, "1.1" in the sidebar: chapter number, then lesson number
//       images/           the lessons' images and files, copied as they are (images/src is left out)
//       practice/         pages in a "Practice" group under the chapter
//     reference/          numbered pages, a "Reference" section after the chapters
//
// Anything else in the course folder is ignored, and listed so a mistyped name does not go unnoticed.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, splitFrontmatter, takeHeading } from './convert.mjs';

const NUMBERED_DIR = /^(\d{2})-(.+)$/;
const NUMBERED_FILE = /^(\d{2})-(.+)\.md$/;

/** A mistake in the course's files, reported to the author as it is, without a stack trace. */
export class CourseError extends Error {}

const fail = message => {
    throw new CourseError(message);
};

/** A name as a URL segment: lower case, letters and digits, hyphens between. */
export const slugify = name =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

/** The visible entries of a folder, in name order. */
function entries(dir) {
    return readdirSync(dir, { withFileTypes: true })
        .filter(entry => !entry.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function readPage(courseDir, source, slug, kind) {
    const text = readFileSync(path.join(courseDir, source), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    let parsed;
    try {
        parsed = splitFrontmatter(text);
    } catch (error) {
        return fail(`${source}: the frontmatter is not valid YAML (${error.message.split('\n')[0]})`);
    }
    const heading = takeHeading(parsed.body);
    const title = parsed.data.title ?? heading.title;
    if (!title) return fail(`${source}: no title. Start the file with a "# Heading" or give it a title in its frontmatter`);
    return {
        source,
        slug,
        kind,
        title: String(title),
        description: parsed.data.description ? String(parsed.data.description) : describe(heading.body),
        body: heading.body,
    };
}

/** The pages of numbered files in a folder: the number, the name without it and the page, in number order. */
function numberedPages(courseDir, folder, ignored, slugPrefix, kind) {
    const pages = [];
    for (const entry of entries(path.join(courseDir, folder))) {
        const match = entry.isFile() && entry.name.match(NUMBERED_FILE);
        if (!match) {
            if (!(entry.isDirectory() && ['images', 'practice'].includes(entry.name))) ignored.push(`${folder}/${entry.name}`);
            continue;
        }
        const name = slugify(match[2]);
        pages.push({ number: Number(match[1]), name, page: readPage(courseDir, `${folder}/${entry.name}`, `${slugPrefix}/${name}`, kind) });
    }
    const seen = new Map();
    for (const { name, page } of pages) {
        if (seen.has(name)) fail(`${page.source} and ${seen.get(name)} would both be at ${slugPrefix}/${name}/. Give them different names`);
        seen.set(name, page.source);
    }
    return pages;
}

/** Every file under a folder, as paths relative to it, leaving out any folder called `src`. */
function filesUnder(dir, rel = '') {
    const files = [];
    for (const entry of entries(path.join(dir, rel))) {
        const next = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (entry.name !== 'src') files.push(...filesUnder(dir, next));
        } else {
            files.push(next);
        }
    }
    return files;
}

/** Where a course file is served from: its numbered folders lose their numbers, so renumbering never moves a link. */
export function servedPath(relative) {
    const parts = relative.split('/');
    return parts.map((part, i) => (i < parts.length - 1 && NUMBERED_DIR.test(part) ? slugify(part.match(NUMBERED_DIR)[2]) : part)).join('/');
}

export function readCourse(courseDir) {
    if (!existsSync(courseDir)) fail(`There is no course folder at ${courseDir}`);
    const configFile = path.join(courseDir, 'config.yml');
    if (!existsSync(configFile)) fail(`${configFile} is missing. It needs at least:\n  name: The course's name`);
    const config = parseYaml(readFileSync(configFile, 'utf8')) ?? {};
    if (typeof config.name !== 'string' || !config.name.trim()) fail(`config.yml has no "name"`);

    const ignored = [];
    const pages = [];
    const assets = [];
    const chapters = [];
    let landing = null;
    let reference = null;

    if (existsSync(path.join(courseDir, 'index.md'))) {
        landing = readPage(courseDir, 'index.md', 'index', 'index');
        pages.push(landing);
    }

    const chapterNumbers = new Map();
    const chapterSlugs = new Map();
    for (const entry of entries(courseDir)) {
        if (entry.name === 'config.yml' || entry.name === 'index.md') continue;
        if (entry.isDirectory() && entry.name === 'reference') {
            const items = numberedPages(courseDir, 'reference', ignored, 'reference', 'reference');
            reference = items.map(item => item.page);
            continue;
        }
        const match = entry.isDirectory() && entry.name.match(NUMBERED_DIR);
        if (!match) {
            ignored.push(entry.name);
            continue;
        }
        const number = Number(match[1]);
        const slug = slugify(match[2]);
        if (chapterNumbers.has(number)) fail(`${entry.name} and ${chapterNumbers.get(number)} have the same number. A chapter's number is its place in the order`);
        if (chapterSlugs.has(slug)) fail(`${entry.name} and ${chapterSlugs.get(slug)} would both be at /${slug}/. Give them different names`);
        chapterNumbers.set(number, entry.name);
        chapterSlugs.set(slug, entry.name);

        const found = numberedPages(courseDir, entry.name, ignored, slug, 'lesson');
        const overviews = found.filter(item => item.number === 0);
        if (overviews.length === 0) fail(`${entry.name}/ has no 00-overview.md. Its # heading is the chapter's name in the sidebar`);
        if (overviews.length > 1) fail(`${entry.name}/ has more than one file numbered 00`);
        const overview = overviews[0].page;
        overview.slug = `${slug}/overview`;
        overview.kind = 'overview';

        const lessons = found.filter(item => item.number > 0).map(item => ({ number: item.number, page: item.page }));

        let practice = [];
        if (existsSync(path.join(courseDir, entry.name, 'practice'))) {
            practice = numberedPages(courseDir, `${entry.name}/practice`, ignored, `${slug}/practice`, 'practice').map(item => item.page);
        }

        if (existsSync(path.join(courseDir, entry.name, 'images'))) {
            const root = path.join(courseDir, entry.name, 'images');
            for (const file of filesUnder(root)) assets.push({ from: path.join(root, file), to: `${slug}/images/${file}` });
        }

        chapters.push({ number, name: entry.name, slug, overview, lessons, practice });
        pages.push(overview, ...lessons.map(l => l.page), ...practice);
    }
    chapters.sort((a, b) => a.number - b.number);
    if (reference) pages.push(...reference);

    // "1.2 Title": the chapter's number and the lesson's. A title that already starts with that number ("1.2: Title",
    // as a course written before the layout may have it) is left as it is, so the number is not said twice.
    const numbered = (prefix, title) => (new RegExp(`^${prefix.replace('.', '\\.')}(?![\\d.])`).test(title) ? title : `${prefix} ${title}`);

    const sidebar = chapters.map(chapter => ({
        label: chapter.overview.title,
        collapsed: true,
        items: [
            { label: 'Overview', slug: chapter.overview.slug },
            ...chapter.lessons.map(l => ({ label: numbered(`${chapter.number}.${l.number}`, l.page.title), slug: l.page.slug })),
            ...(chapter.practice.length
                ? [{ label: 'Practice', collapsed: true, items: chapter.practice.map(page => ({ label: page.title, slug: page.slug })) }]
                : []),
        ],
    }));
    if (reference?.length) sidebar.push({ label: 'Reference', collapsed: true, items: reference.map(page => ({ label: page.title, slug: page.slug })) });

    return { config, landing, chapters, reference, pages, sidebar, assets, ignored };
}
