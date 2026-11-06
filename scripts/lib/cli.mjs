// What dev.mjs, build.mjs and preview.mjs share: reading the command line, syncing the course, running Astro.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CourseError, slugify } from './course.mjs';
import { syncCourse } from '../sync-content.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const USAGE = `Usage: npm run <dev|build|preview> -- <course repo folder> [--slug <name>] [astro options]

  <course repo folder>   the folder that holds course/, such as ../learnshelf--ap-physics-1
  --slug <name>          the course's address, learnshelf.github.io/<name>/. Default: the folder's name without
                         a leading "learnshelf--", which is the repo's name on GitHub`;

/** The course folder, the slug and the options left over for Astro. */
export function parseCli(argv) {
    let course;
    let slug;
    const astroArgs = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--slug') slug = argv[++i];
        else if (arg.startsWith('--slug=')) slug = arg.slice('--slug='.length);
        else if (!course && !arg.startsWith('-')) course = arg;
        else astroArgs.push(arg);
    }
    if (!course) {
        process.stderr.write(`${USAGE}\n`);
        process.exit(2);
    }
    const repo = path.resolve(course);
    return { repo, slug: slugify(slug ?? path.basename(repo).replace(/^learnshelf--/, '')), astroArgs };
}

/** Prints what a sync found. */
export function report(result) {
    process.stdout.write(`${result.name}: ${result.pages} pages, ${result.files} files, at ${result.base}/\n`);
    if (result.ignored.length) process.stdout.write(`Not on the site (outside the layout): ${result.ignored.join(', ')}\n`);
    for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
}

/** Syncs, and turns a mistake in the course into a plain message and a failed exit. */
export function syncOrExit(options) {
    try {
        const result = syncCourse(options);
        report(result);
        return result;
    } catch (error) {
        if (!(error instanceof CourseError)) throw error;
        process.stderr.write(`error: ${error.message}\n`);
        process.exit(1);
    }
}

/** Runs `astro <command>` in this folder and resolves with its exit code. */
export function runAstro(command, args = []) {
    const astro = path.join(root, 'node_modules', 'astro', 'bin', 'astro.mjs');
    return new Promise(resolve => {
        const child = spawn(process.execPath, [astro, command, ...args], { stdio: 'inherit', cwd: root });
        child.on('exit', code => resolve(code ?? 0));
    });
}
