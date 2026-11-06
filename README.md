# learnshelf site

The site template for learnshelf courses: [Starlight](https://starlight.astro.build/) on Astro, with search, a
light/dark toggle, chapters as collapsible sections and lessons as pages. A course repo holds only its content, in a
`course/` folder. This repo turns that into a site, and its reusable workflow deploys the site to the course's own
GitHub Pages, at `https://learnshelf.github.io/<course repo name>/`.

## A course repo

```
README.md              not on the site (everything outside course/ is ignored)
course/
  config.yml           name: the course's name, shown in the header (required)
  index.md             the landing page (optional; without one, a plain list of the chapters)
  01-getting-started/  a chapter
    00-overview.md     the chapter's first page (required); its # heading is the section's name in the sidebar
    01-first-lesson.md a lesson
    02-second-lesson.md
    images/            the chapter's images and any file a lesson links to (images/src/ is left out)
    practice/          pages in a "Practice" group under the chapter
      01-problems.md
  02-next-chapter/
    ...
  reference/           a "Reference" section after the chapters
    01-roadmap.md
```

- **Numbers** are two digits, restart in each chapter, and only set the order. The sidebar shows chapter and lesson
  together, "1.2 Second lesson". Numbers are not in the URLs (`/<course>/getting-started/second-lesson/`), so
  renumbering never moves a page.
- **A page's title** is its first `# Heading`, which the site prints as the page's own heading. A `title:` in the
  frontmatter wins. Write the heading without a number: a title that already starts with the lesson's own number
  ("1.2: Second lesson") is shown as it is, not numbered a second time. A `description:` in the frontmatter is the page's
  description; without one it is the first paragraph long enough to describe the page. Any other frontmatter is dropped.
- **Links** between lessons are plain relative links to the files (`[next](02-second-lesson.md#the-idea)`,
  `[git](../02-git/01-save-points.md)`), so they work on GitHub and in an editor too, and the site rewrites them.
  A link or an image that points at a file in the course (`images/map.svg`) points at the copy the site serves.
  A link that goes nowhere is listed as a warning when the site is built.
- **Maths** is LaTeX between dollar signs, `$a = -g$`, and `$$ ... $$` for a display, rendered with KaTeX.
- **Mistakes** (a chapter without `00-overview.md`, a page without a title, two pages with the same name) stop the
  build with a message that names the file. Files and folders the layout does not name are listed as "Not on the
  site" and otherwise ignored.

## Working on a course

Clone this repo beside the course, install once, and run it against the course's folder. A course repo has no site code, so it is
the template that is run.

```
cd learnshelf--site
npm install
npm run dev -- ../learnshelf--webapp-course
```

| Command | What it does |
|---|---|
| `npm run dev -- <course repo>` | Dev server at `http://localhost:4321/<course>/`. Saving a file updates its page within a second; adding or removing a page, or changing a chapter's heading, restarts the server to rebuild the sidebar. Search is not available here |
| `npm run build -- <course repo>` | Builds the site into `dist/<course>/`, with the search index. A build of one course leaves the others' alone |
| `npm run preview -- <course repo>` | Serves the last build, as it is deployed |

`<course>` is the repo's name on GitHub. Locally the folder is `learnshelf--<course>`, so the prefix is dropped; give
`--slug <name>` to use another.

## Deploying a course

Copy `examples/course-deploy.yml` into the course repo as `.github/workflows/deploy.yml`, set the repo's
*Settings > Pages > Source* to *GitHub Actions*, and push. The workflow checks out the course and this template,
runs `npm run build`, and deploys `dist/<course>/`. It builds with this repo's `main` unless the course names a
tag in `site-ref`.

## How it works

`scripts/sync-content.mjs` reads the course (`scripts/lib/course.mjs`) and writes, all git-ignored:
`src/content/docs/` (the pages), `public/course-files/` (the images and files the lessons link to) and
`src/generated/course.json` (the name, address and sidebar, which `astro.config.mjs` reads). The sidebar is built
from the folders, so adding a chapter or a lesson needs no configuration. The header (`src/components/`) is the
learnshelf mark and the course's name on the left and the theme toggle on the right.
