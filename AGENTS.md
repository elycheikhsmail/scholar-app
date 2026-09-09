# Instructions for Contributors

- After implementing each feature, run the relevant tests or validation checks.
- Commit each completed feature with a clear, focused commit message.
- Push the commit to the configured GitHub repository on the `main` branch.
- Before pushing, verify `git status`, review the diff, and make sure no secrets, local databases, backups, build output, or test artifacts are included.
- Keep commits focused and do not include unrelated changes.

## Project map

Node.js >=22.16, Electron, plain browser JavaScript, SQLite. Run commands here.
No bundler or framework. UI text is Arabic (RTL); preserve existing wording.

| Task | Start here |
| --- | --- |
| HTTP routes, authentication, sessions | `server.js` |
| Persistence, validation, migration | `db.js`, `tests/db.test.js` |
| Fee calculation (shared browser/server) | `public/fees.js`, `tests/fees.test.js` |
| Shared UI state, API, dialogs, navigation | `public/core.js` |
| Students, individual fee form and ledger | `public/students.js` |
| Fees table, collections, CSV, receipts | `public/fees-ui.js` |
| Staff, salaries, advances | `public/staff.js` |
| Expenses, dashboard, reports | `public/reports.js` |
| School settings, departments, application mode | `public/settings.js` |
| Exams, templates, result printing | `public/exams.js` |
| Startup, replacement session | `public/app.js` |
| Markup / styles | `public/index.html` / `public/style.css` |
| Desktop lifecycle / bridge | `main.js` / `preload.js` |
| Demo data | `scripts/seed-demo.js`, `tests/seed-demo.test.js` |

Browser files are classic scripts sharing global bindings. Preserve the explicit
order in `index.html`: fees engine, core, feature scripts, app startup last.
Do not add `async`, module wrappers, or eager cross-file calls without checking startup.
Fee rules belong in `fees.js`; validation and persistence belong in `db.js`.

## Focused verification

- `npm run check`: syntax only, concise output, no application startup.
- `npm test`: all unit/integration tests (temporary databases).
- `npm run test:fees`, `npm run test:db`, `npm run test:seed`: focused suites.
- `npm run test:ui`: Chromium smoke test with a mocked API and temporary data;
  requires Playwright Chromium (`npx playwright install chromium`), or `E2E_BROWSER_PATH`.
- `npm run test:e2e`: existing live-server journey; needs a prepared database.
- After browser changes, run `check` and `test:ui`; add domain tests for changed rules.

## Keep context focused

- Use this map, then `rg -n` for relevant symbols and bounded file excerpts.
- Read dependencies as needed; avoid dumping the entire repository or long test logs.
- Keep useful names and business-rule comments; do not minify source to save tokens.
- Skip dependencies, lockfiles, databases, backups, builds and test artifacts unless relevant.
- `README.md` describes current usage. `REVIEW*.md`, `REFACTORING.md`,
  `NOTES-SCHEMA-JSON.md`, and `README.txt` are historical/reference material:
  read only when relevant and verify claims against current code.
- Report changed behavior, verification and remaining limitations briefly.
