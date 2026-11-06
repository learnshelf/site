// Runs the dev server on a course and keeps it in step with the course's files: saving a lesson updates its page
// within a second. Adding, removing or renaming a page, or changing a chapter's heading, changes the sidebar, which
// only a restart picks up, so the server is restarted for those by touching astro.config.mjs.
// Search does not work in the dev server; build and preview for that.
// Usage: npm run dev -- <course repo folder> [--slug <name>] [astro options]

import { existsSync, utimesSync, watch } from 'node:fs';
import path from 'node:path';
import { root, parseCli, runAstro, syncOrExit } from './lib/cli.mjs';
import { CourseError } from './lib/course.mjs';
import { syncCourse } from './sync-content.mjs';

const { repo, slug, astroArgs } = parseCli(process.argv.slice(2));
syncOrExit({ repo, slug });

const courseDir = path.join(repo, 'course');
const configFile = path.join(root, 'astro.config.mjs');
let timer;

function resync() {
    try {
        const result = syncCourse({ repo, slug });
        for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
        if (result.structureChanged) {
            process.stdout.write('The sidebar changed: restarting the dev server\n');
            const now = new Date();
            utimesSync(configFile, now, now);
        }
    } catch (error) {
        if (!(error instanceof CourseError)) throw error;
        // A file half-edited, or a chapter just created without its overview: say so and wait for the next save.
        process.stderr.write(`error: ${error.message}\n`);
    }
}

if (existsSync(courseDir)) {
    watch(courseDir, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(resync, 200);
    });
}

const started = Date.now();
const code = await runAstro('dev', astroArgs);
if (code === 0 && Date.now() - started < 10_000) {
    // Astro starts the dev server in the background when an AI agent runs it, and returns at once. The watcher has to
    // outlive that, so wait here, and stop the server when this is stopped.
    process.stdout.write('The dev server is running in the background. This keeps the course in sync; Ctrl+C stops both.\n');
    const stop = async () => {
        await runAstro('dev', ['stop']);
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    await new Promise(() => {});
}
process.exit(code);
