/* ============================================================
   QUERYREAL — INTERMEDIATE LEVEL BACKEND (v2 — River water quality)
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

   Scope: rivers in the Île-de-France region (departments 75, 77,
   78, 91, 92, 93, 94, 95), to keep the data volume manageable.

   Same fallback strategy as the other levels: if the API is
   unavailable, fall back to a sample dataset with the same schema.
   ============================================================ */

(function (global) {
  "use strict";

  var BASE_URL = "https://hubeau.eaufrance.fr/api/v2/qualite_rivieres/";
  var IDF_DEPARTMENTS = "75,77,78,91,92,93,94,95";

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
  async function fetchStations() {
    var url = BASE_URL + "station_pc" +
      "?code_departement=" + IDF_DEPARTMENTS +
      "&fields=code_station,libelle_station,libelle_commune,nom_cours_eau" +
      "&size=1000&format=json";
    var res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    var json = await res.json();
    var data = json && json.data;
    if (!Array.isArray(data) || data.length === 0) {
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

  async function fetchMeasurements() {
    var url = BASE_URL + "analyse_pc" +
      "?code_departement=" + IDF_DEPARTMENTS +
      "&date_debut_prelevement=2023-01-01" +
      "&fields=code_station,libelle_parametre,date_prelevement,resultat,symbole_unite" +
      "&size=1000&format=json";
    var res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    var json = await res.json();
    var data = json && json.data;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Empty or unexpected analyse_pc response");
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
      source = "live (Hub'Eau API — River water quality, Île-de-France)";
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