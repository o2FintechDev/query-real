/* ============================================================
   QUERYREAL — INTERMEDIATE LEVEL BACKEND (v3 — River water quality, France)
   ------------------------------------------------------------
   Source: Hub'Eau API — River water quality
   https://hubeau.eaufrance.fr/api/v2/qualite_rivieres
   (BRGM / OFB / French Ministry for Ecological Transition —
   Naïades dataset, open access, no API key, CORS enabled)

   Two separate API calls = two tables, to illustrate the classic
   "reference" + "fact" schema pattern:

     station_pc  -->  reference table: station(...)
                       (fixed list of sampling locations)
     analyse_pc  -->  fact table: measurement(...)
                       (physico-chemical analysis results,
                       one row per measurement)

   A JOIN between station and measurement links the two tables on
   station_code. Since the two calls are independent, a station in
   the reference table may not (yet) have any associated
   measurement — which is what makes a LEFT JOIN genuinely useful
   to demonstrate at this level.

   Scope: all of France, no department/commune filter (per Hub'Eau's
   own documented example, scaled up to the whole country instead of
   two named communes). Page size is set to the API's documented
   maximum (20000). analyse_pc is still bounded by a start date
   (date_debut_prelevement) to keep the payload a reasonable size,
   since the underlying Naïades database holds many years of history.

   Same fallback strategy as the other levels: if the API is
   unavailable, fall back to a sample dataset with the same schema.
   ============================================================ */

(function (global) {
  "use strict";

  var BASE_URL = "https://hubeau.eaufrance.fr/api/v2/qualite_rivieres/";

  // ------------------------------------------------------------------
  // 1. FALLBACK DATA (SAMPLE)
  // ------------------------------------------------------------------
  var FALLBACK_STATIONS = [
    { code: "IDF001", name: "The Seine at Paris",           city: "Paris",                       river: "The Seine" },
    { code: "IDF002", name: "The Marne at Charenton",       city: "Charenton-le-Pont",            river: "The Marne" },
    { code: "IDF003", name: "The Seine at Melun",           city: "Melun",                        river: "The Seine" },
    { code: "IDF004", name: "The Oise at Cergy",            city: "Cergy",                        river: "The Oise" },
    { code: "IDF005", name: "The Essonne at Corbeil",       city: "Corbeil-Essonnes",             river: "The Essonne" },
    { code: "IDF006", name: "The Marne at Meaux",           city: "Meaux",                        river: "The Marne" },
    { code: "IDF007", name: "The Seine at Mantes",          city: "Mantes-la-Jolie",              river: "The Seine" },
    { code: "IDF008", name: "The Yerres at Villeneuve",     city: "Villeneuve-Saint-Georges",     river: "The Yerres" }
  ];

  var PARAMETERS = [
    { name: "Nitrates",     unit: "mg/L", base: 18 },
    { name: "Total phosphorus", unit: "mg/L", base: 0.3 },
    { name: "Ammonium",     unit: "mg/L", base: 0.15 },
    { name: "Water temperature", unit: "°C", base: 14 }
  ];

  function buildFallbackMeasurements() {
    var rows = [];
    var dates = ["2024-03-12", "2024-06-18", "2024-09-05"];
    FALLBACK_STATIONS.forEach(function (s, si) {
      PARAMETERS.forEach(function (p, pi) {
        dates.forEach(function (d, di) {
          // Pseudo-random but deterministic variation, just so
          // values aren't all identical.
          var jitter = 0.8 + (((si * 7 + pi * 13 + di * 5) % 40) / 100);
          var result = Math.round(p.base * jitter * 100) / 100;
          rows.push({
            station_code: s.code,
            parameter: p.name,
            sample_date: d,
            result: result,
            unit: p.unit
          });
        });
      });
    });
    return rows;
  }

  // ------------------------------------------------------------------
  // 2. LIVE CALLS TO THE HUB'EAU API (2 calls = 2 tables)
  // ------------------------------------------------------------------
  // A single page (even at the API's max size of 20000) only ever
  // returns one arbitrary slice of a much larger national dataset, in
  // whatever order the API applies by default — not a representative
  // sample. To cover the whole country without filtering on anything
  // (no department, no parameter), we follow the API's own pagination
  // ("next" link) across several pages and aggregate the results.
  async function fetchAllPages(firstUrl, maxPages) {
    var all = [];
    var url = firstUrl;
    var pageCount = 0;
    while (url && pageCount < maxPages) {
      var res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      var json = await res.json();
      var data = json && json.data;
      if (!Array.isArray(data)) throw new Error("Unexpected response (no data array)");
      all = all.concat(data);
      pageCount += 1;
      // Temporary diagnostic logging — check the browser console (F12) to
      // see the real total count reported by the API, how many pages were
      // actually fetched, and whether "next" kept going or stopped early.
      console.log(
        "[hubeau] page " + pageCount + ": +" + data.length + " rows (total so far: " + all.length + "),",
        "API count field:", json.count, ", next:", json.next
      );
      url = json.next || null;
    }
    return all;
  }

  async function fetchStations() {
    var firstUrl = BASE_URL + "station_pc" +
      "?fields=code_station,libelle_station,libelle_commune,nom_cours_eau" +
      "&size=20000&format=json";
    var data = await fetchAllPages(firstUrl, 3);
    if (data.length === 0) {
      throw new Error("Empty or unexpected station_pc response");
    }
    var rows = data
      .filter(function (s) { return s.code_station && s.libelle_station; })
      .map(function (s) {
        return {
          code: s.code_station,
          name: s.libelle_station,
          city: s.libelle_commune || "",
          river: s.nom_cours_eau || ""
        };
      });
    if (!rows.length) {
      throw new Error("No usable station after filtering (missing/renamed fields?)");
    }
    return rows;
  }

  // Filtering by parameter is not an arbitrary restriction here — it's
  // a necessity. The live site reports ~39 million analyses nationally
  // for 2023-2026 alone (~236 distinct parameters tested per sampling
  // operation: nitrates, but also pesticides, heavy metals,
  // bacteriology...). No browser-side SQLite database can hold that.
  // Restricting to the 4 parameters actually used in the challenges
  // cuts the volume by roughly that same factor (~236x) without losing
  // anything relevant, and without introducing any geographic bias.
  var TRACKED_PARAMETERS = ["Nitrates", "Phosphore total", "Ammonium", "Temp\u00e9rature de l'eau"];

  // Hub'Eau caps the *access depth* of any single query at 20000
  // (depth = page_number * page_size — see the API's own documented
  // limit). Once size is already at its max of 20000, page 2 would
  // require depth 40000, so pagination on a single combined query
  // can never go past that first page in practice.
  //
  // To collect more than 20000 rows in total, we therefore split the
  // combined "libelle_parametre=A,B,C,D" query into 4 independent
  // queries (one per tracked parameter), run in parallel, and
  // concatenate their results. Each one is still capped at 20000,
  // but the cap now applies per parameter instead of globally —
  // up to 4 x 20000 = 80000 rows total for analyse_pc.
  function buildMeasurementsUrl(parameterName) {
    return BASE_URL + "analyse_pc" +
      "?libelle_parametre=" + encodeURIComponent(parameterName) +
      "&date_debut_prelevement=2016-01-01" +
      "&fields=code_station,libelle_parametre,date_prelevement,resultat,symbole_unite" +
      "&size=20000&format=json";
  }

  async function fetchMeasurementsForParameter(parameterName) {
    var firstUrl = buildMeasurementsUrl(parameterName);
    // maxPages stays as a safety net only: with size already at
    // 20000, the depth limit means a real "next" page is not
    // expected in practice for a single parameter (unless a
    // parameter alone exceeds 20000 samples since 2016).
    return fetchAllPages(firstUrl, 2);
  }

  async function fetchMeasurements() {
    var results = await Promise.all(
      TRACKED_PARAMETERS.map(function (p) {
        // Isolate failures per parameter: if one call fails (e.g. a
        // timeout on a single heavy parameter), the others can still
        // succeed instead of the whole fetchMeasurements() call
        // throwing and triggering the full sample-data fallback.
        return fetchMeasurementsForParameter(p).catch(function (e) {
          console.warn("[hubeau] parameter \"" + p + "\" failed:", e.message);
          return [];
        });
      })
    );
    var data = results.reduce(function (acc, rows) { return acc.concat(rows); }, []);
    if (data.length === 0) {
      throw new Error("Empty or unexpected analyse_pc response (all parameter queries failed or returned nothing)");
    }
    var rows = data
      .filter(function (a) {
        return a.code_station && a.libelle_parametre && typeof a.resultat === "number";
      })
      .map(function (a) {
        return {
          station_code: a.code_station,
          parameter: a.libelle_parametre,
          sample_date: a.date_prelevement || "",
          result: a.resultat,
          unit: a.symbole_unite || ""
        };
      });
    if (!rows.length) {
      throw new Error("No usable measurement after filtering (missing/renamed fields?)");
    }
    return rows;
  }

  // ------------------------------------------------------------------
  // 3. SQL.JS INITIALIZATION + TABLE CREATION
  // ------------------------------------------------------------------
  async function loadIntermediateDB(opts) {
    opts = opts || {};
    var initFn = opts.initSqlJs || global.initSqlJs;
    if (typeof initFn !== "function") {
      throw new Error(
        "sql.js is not loaded. Include " +
        "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js first"
      );
    }

    var SQL = await initFn({
      locateFile: function (f) {
        return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + f;
      }
    });
    var db = new SQL.Database();

    var stations = null;
    var measurements = null;
    var source = "sample (Hub'Eau API unavailable)";
    try {
      var results = await Promise.all([fetchStations(), fetchMeasurements()]);
      stations = results[0];
      measurements = results[1];
      source = "live (Hub'Eau API — River water quality, France)";
    } catch (e) {
      console.warn("[backend-intermediate] API unavailable, falling back to sample data:", e.message);
      stations = FALLBACK_STATIONS.map(function (s) {
        return { code: s.code, name: s.name, city: s.city, river: s.river };
      });
      measurements = buildFallbackMeasurements();
    }

    db.run(
      "CREATE TABLE station (" +
      "station_code TEXT, station_name TEXT, city_name TEXT, river TEXT" +
      ")"
    );
    var stmtS = db.prepare("INSERT INTO station VALUES (?,?,?,?)");
    stations.forEach(function (s) {
      stmtS.run([s.code, s.name, s.city, s.river]);
    });
    stmtS.free();

    db.run(
      "CREATE TABLE measurement (" +
      "station_code TEXT, parameter TEXT, sample_date TEXT, result REAL, unit TEXT" +
      ")"
    );
    var stmtA = db.prepare("INSERT INTO measurement VALUES (?,?,?,?,?)");
    measurements.forEach(function (m) {
      stmtA.run([m.station_code, m.parameter, m.sample_date, m.result, m.unit]);
    });
    stmtA.free();

    db.__queryRealDataSource = source;
    return db;
  }

  // ------------------------------------------------------------------
  // 4. EXPORTS
  // ------------------------------------------------------------------
  global.QueryRealIntermediateBackend = {
    FALLBACK_STATIONS: FALLBACK_STATIONS,
    PARAMETERS: PARAMETERS,
    fetchStations: fetchStations,
    fetchMeasurements: fetchMeasurements,
    loadIntermediateDB: loadIntermediateDB
  };
  global.loadIntermediateDB = loadIntermediateDB;

})(typeof window !== "undefined" ? window : globalThis);