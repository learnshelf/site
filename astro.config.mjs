// The learnshelf course site: Starlight, on one course at a time. The course's name, address and sidebar come from
// src/generated/course.json, which scripts/sync-content.mjs writes, so run this through `npm run dev`, `build` or
// `preview` with a course folder; see README.md.

import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

const COURSE_FILE = new URL('./src/generated/course.json', import.meta.url);
if (!existsSync(COURSE_FILE)) {
    throw new Error('No course to build. Run `npm run dev`, `build` or `preview` with the course folder: npm run build -- ../learnshelf--some-course');
}
const course = JSON.parse(readFileSync(COURSE_FILE, 'utf8'));

export default defineConfig({
    site: 'https://learnshelf.github.io',
    base: course.base,
    // One folder per course, so a build of one never removes another's. GitHub Pages serves dist/<slug>/ at /<slug>/.
    outDir: `./dist/${course.slug}`,
    // Astro's default Markdown processor takes no remark or rehype plugins; the maths in the lessons ($a = -g$) needs
    // these two, so the course uses the unified processor.
    markdown: {
        processor: unified({
            remarkPlugins: [remarkMath],
            rehypePlugins: [rehypeKatex],
        }),
    },
    integrations: [
        starlight({
            title: course.name,
            favicon: '/favicon.ico',
            // The header is the learnshelf mark and the course's name on the left and the light/dark toggle on the right.
            components: {
                SiteTitle: './src/components/site-title.astro',
                SocialIcons: './src/components/no-links.astro',
                ThemeProvider: './src/components/theme-provider.astro',
                ThemeSelect: './src/components/theme-toggle.astro',
            },
            customCss: ['katex/dist/katex.min.css', './src/styles/learnshelf.css'],
            sidebar: course.sidebar,
        }),
    ],
});
