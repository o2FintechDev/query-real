# SQL World

A browser-based game that teaches SQL through progressive challenges built on **real public data** — no backend, no installation, just open the HTML file and start querying.

## What is this?

SQL World is a single-file HTML application where players write real SQL queries against in-browser SQLite databases (powered by [sql.js](https://sql.js.org/)). Instead of toy tables with fake rows, each difficulty level is backed by data pulled from official public APIs — currently EU trade statistics from Eurostat, with more sources planned as the project grows.

The game is organized into five difficulty levels, each with its own dedicated database and challenge set:

- **Beginner**
- **Intermediate**
- **Advanced**
- **Expert**
- **Méga Expert**

Players progress through a sequence of challenges per level, starting with basic `SELECT` / `ORDER BY` statements and building up to more complex filtering, joins, and aggregation as the levels advance.

## Why this project exists

SQL World serves two purposes at once:

1. **A learning tool.** Most SQL tutorials rely on synthetic, disconnected datasets. SQL World's design philosophy is built around *authenticity*: real data, real queries, and full schema visibility, so that what you practice actually resembles the kind of querying you'd do on the job.
2. **A portfolio project.** It's also a demonstration piece — a way to show hands-on SQL, front-end, and data-sourcing skills through something functional and interactive, rather than a static writeup.

## Who is it for?

Primarily aimed at **students and career-changers moving into data roles** who want to practice SQL against realistic schemas and real-world datasets, without needing to set up a database server or an account. No installation, no sign-up — just open the file in a browser.

## Architecture

- **Single HTML file.** The entire application — UI, game logic, and level-specific backend scripts — lives in one self-contained file.
- **In-browser SQLite via sql.js.** `sql-wasm.js` (the sql.js WebAssembly runtime) is loaded just before `</body>`, followed by the level's backend script (e.g. `backend-debutant.js`), which is loaded ahead of the main game script.
- **Dynamic, API-driven schema.** Backend scripts prefer inferring fields dynamically from the live API response over hardcoding field names, so the schema stays honest to the real data source.
- **Fallback-first reliability.** Every live data fetch has a schema-identical hardcoded fallback. If the live API call fails, the backend silently switches to fake data with the same structure — and the UI clearly labels whether the data currently in play is "réelles" (real) or "factices (repli)" (fake / fallback), so players are never misled about what they're querying.
- **Database explorer sidebar.** An Athena-style sidebar lets players expand each table to see its columns and types before writing any query.

## Current state

Development is currently focused on the **Débutant** level:

- **Data source:** Eurostat EU trade data (`ext_lt_maineu` dataset) — exports, imports, and trade balance by country and product category.
- **Tables:** `trade` and `trade_by_product`.
- **Challenges:** five sequential challenges, progressing from basic `SELECT`/`ORDER BY` queries to filtering by product category and specific product codes.

**Known open item:** the exact Eurostat JSON-stat dimension names for `ext_lt_maineu` (the `id` array and the `dimension.indic_et.category.index` keys) still need to be verified directly against the raw API response. Some field-name assumptions (e.g. `indic_et`, codes like `MIO_EXP_VAL` / `MIO_IMP_VAL`) are not yet confirmed.

## Data sources

- **Eurostat dissemination API** — primary source for the Débutant level.
- **data.gouv.fr / data.economie.gouv.fr** — explored as candidate sources; the Douane dataset was ruled out (ZIP-only downloads, not a queryable API).
- **Opendatasoft v2.1 API** — explored but not currently used.
- Other data sources were evaluated and abandoned during development, including a data.gouv.fr electricity-flow dataset (not relevant to goods trade).

## Tech stack

- **sql.js** — SQLite compiled to WebAssembly, running entirely client-side.
- **Vanilla JS/HTML/CSS** — no framework, no build step, no backend.
- **Public data APIs** — Eurostat and other official portals as the source of truth for each level's dataset.

## What's next

- Verify the real Eurostat field/dimension names for the Débutant level and remove the "unverified assumption" flag once confirmed.
- Build out the **Intermédiaire**, **Confirmé**, **Expert**, and **Méga Expert** levels, each with its own dataset and challenge progression.
- Expand the range of public data sources beyond Eurostat as new levels are added.
- Continue refining the challenge design so difficulty scales smoothly from basic filtering to complex multi-table queries.

## Getting started

No installation required:

1. Clone or download this repository.
2. Open the HTML file directly in a browser.
3. Start solving SQL challenges — the database explorer sidebar shows you the schema for each level.

## Design principles

- **Real data over synthetic data.** The educational value comes from querying genuine public datasets, not toy examples.
- **Transparency about data state.** The UI always makes clear whether you're querying live data or a fallback, never silently substituting one for the other.
- **Iterative, single-file development.** The project is built incrementally within one HTML file, with navigation and interaction bugs isolated and tested in minimal files before being integrated into the main app.