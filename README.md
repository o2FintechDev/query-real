# Query Real

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

Three difficulty levels are currently implemented:

### Beginner — French communes (all 35,000+)

- **Backend:** `backend-beginner.js`
- **Data source:** French Administrative Boundaries API (`geo.api.gouv.fr`)
  - ✅ No API key required
  - CORS enabled, flat JSON response
  - Public, no rate limits for reasonable usage
- **Tables:** `city` (insee_code, name, department_code, population)
- **Challenges:** Basic `SELECT`, `ORDER BY`, filtering by department and population thresholds
- **Status:** ✅ Complete and working

### Intermediate — River water quality in France

- **Backend:** `backend-intermediate.js`
- **Data source:** Hub'Eau API (`hubeau.eaufrance.fr`)
  - ✅ No API key required
  - Open data from BRGM / OFB / French Ministry for Ecological Transition
  - Naïades dataset: physico-chemical river measurements
  - Rate limit: reasonable for educational use (no documented cap for non-commercial queries)
- **Tables:**
  - `station` (station_code, station_name, city_name, river)
  - `measurement` (station_code, parameter, sample_date, result, unit)
- **Query pattern:** Demonstrates `LEFT JOIN` (stations may have no measurements yet)
- **Challenges:** Filtering by parameter, date ranges, aggregation, and multi-table queries
- **Status:** ✅ Complete and working

### Advanced — French public high schools (lycées)

- **Backend:** `backend-advanced.js`
- **Data source:** French National Education Directory (`data.education.gouv.fr`)
  - Etalab / Ministry of Education open data
  - ✅ **No API key required** — OpenDataSoft "Explore API v2.1" with pagination
  - Anonymous quota: 5,000 calls/day/IP (well under limit for ~27 paginated calls across ~2,600 schools)
- **Tables:**
  - `school` (uai, name, type, department_code, city)
  - `enrollment` (uai, student_count)
- **Scope:** ~2,600 public lycées nationally (filtered: `type_etablissement="Lycée"` and `statut_public_prive="Public"`)
- **Query pattern:** `JOIN` on UAI (school identifier)
- **Challenges:** Filtering by department, city, enrollment size; aggregation over school listings
- **Status:** ✅ Complete and working

### Fallback strategy (all levels)

All three levels implement the same reliability pattern:
- Each backend attempts a live API call first
- **If the API is unavailable**, the backend silently switches to a hardcoded fallback dataset with **identical schema**
- The UI labels the data source clearly: "réelles (live)" or "factices (fallback)" so players know which dataset they're querying
- This ensures the game remains playable even if an upstream API goes down temporarily

No fallback data is included for the full dataset — fallbacks are reduced samples that show the schema but not 35,000 communes or 2,600 lycées. This is intentional, so players aren't misled about query results on the live vs. fallback paths.

## Data sources currently in use

- **geo.api.gouv.fr** (Beginner) — French Administrative Boundaries, communes with population
- **hubeau.eaufrance.fr** (Intermediate) — Hub'Eau API, river water quality measurements
- **data.education.gouv.fr** (Advanced) — Éducation Nationale Directory, school listings and enrollment

## Tech stack

- **sql.js** — SQLite compiled to WebAssembly, running entirely client-side.
- **Vanilla JS/HTML/CSS** — no framework, no build step, no backend.
- **Public data APIs** — Eurostat and other official portals as the source of truth for each level's dataset.

## What's next

- Build out the **Expert** and **Méga Expert** levels, each with its own dataset and challenge progression
- Find and integrate suitable high-complexity datasets for Expert+ levels (e.g. public research datasets with multiple dimensions, complex temporal patterns, or large fact tables)
- Continue refining the challenge design so difficulty scales smoothly:
  - Beginner: single-table filtering and sorting
  - Intermediate: multi-table joins and aggregation
  - Advanced: moderate complexity joins with enrollment analysis
  - Expert: complex multi-table queries with subqueries or window functions
  - Méga Expert: optimization challenges or very large real-world datasets

## Getting started

No installation required:

1. Clone or download this repository.
2. Open the HTML file directly in a browser.
3. Start solving SQL challenges — the database explorer sidebar shows you the schema for each level.

## Design principles

- **Real data over synthetic data.** The educational value comes from querying genuine public datasets, not toy examples.
- **Transparency about data state.** The UI always makes clear whether you're querying live data or a fallback, never silently substituting one for the other.
- **Iterative, single-file development.** The project is built incrementally within one HTML file, with navigation and interaction bugs isolated and tested in minimal files before being integrated into the main app.