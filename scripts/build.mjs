// Builds a course's site into dist/<slug>/, with its search index.
// Usage: npm run build -- <course repo folder> [--slug <name>]

import { parseCli, runAstro, syncOrExit } from './lib/cli.mjs';

const { repo, slug, astroArgs } = parseCli(process.argv.slice(2));
syncOrExit({ repo, slug });
process.exit(await runAstro('build', astroArgs));
