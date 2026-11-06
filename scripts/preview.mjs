// Serves the last build of a course, as it would be deployed.
// Usage: npm run preview -- <course repo folder> [--slug <name>]

import { parseCli, runAstro, syncOrExit } from './lib/cli.mjs';

const { repo, slug, astroArgs } = parseCli(process.argv.slice(2));
syncOrExit({ repo, slug });
process.exit(await runAstro('preview', astroArgs));
