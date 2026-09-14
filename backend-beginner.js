/* ============================================================
   QUERYREAL — BEGINNER LEVEL BACKEND (v5 — all communes of France)
   ------------------------------------------------------------
   Source: French Administrative Boundaries API (Etalab / DINUM)
   https://geo.api.gouv.fr — French communes, no API key required,
   CORS enabled, flat JSON response.

   SQL table created:
     city(insee_code, name, department_code, population)

   Every French commune with a known population is loaded
   (~35,000 rows). No size filter is applied on purpose, so the
   table genuinely represents "every commune in France" rather
   than an arbitrarily chosen subset. The number of rows shown
   in the UI is capped client-side (RESULT_DISPLAY_CAP in
   index.html), but challenge validation always compares the
   full result set.

   Strategy: attempt the live API call from the player's browser.
   If it fails (network, CORS, response shape change...),
   automatically fall back to a sample dataset with the same
   schema.
   ============================================================ */

(function (global) {
  "use strict";

  // ------------------------------------------------------------------
  // 1. FALLBACK DATA (SAMPLE — largest French cities)
  // ------------------------------------------------------------------
  // Rounded, approximate population figures (fallback only — do not
  // use as a source of demographic truth). This is only a sample:
  // it isn't practical to hardcode all ~35,000 real communes for
  // fallback mode.
  var FALLBACK_CITIES = [
    { name: "Paris",                dept: "75", pop: 2145000 },
    { name: "Marseille",            dept: "13", pop: 870000 },
    { name: "Lyon",                 dept: "69", pop: 522000 },
    { name: "Toulouse",             dept: "31", pop: 493000 },
    { name: "Nice",                 dept: "06", pop: 343000 },
    { name: "Nantes",               dept: "44", pop: 318000 },
    { name: "Montpellier",          dept: "34", pop: 301000 },
    { name: "Strasbourg",           dept: "67", pop: 287000 },
    { name: "Bordeaux",             dept: "33", pop: 257000 },
    { name: "Lille",                dept: "59", pop: 233000 },
    { name: "Rennes",               dept: "35", pop: 220000 },
    { name: "Reims",                dept: "51", pop: 182000 },
    { name: "Saint-Étienne",        dept: "42", pop: 172000 },
    { name: "Le Havre",             dept: "76", pop: 170000 },
    { name: "Toulon",               dept: "83", pop: 171000 },
    { name: "Grenoble",             dept: "38", pop: 158000 },
    { name: "Dijon",                dept: "21", pop: 156000 },
    { name: "Angers",               dept: "49", pop: 152000 },
    { name: "Nîmes",                dept: "30", pop: 150000 },
    { name: "Villeurbanne",         dept: "69", pop: 150000 },
    { name: "Le Mans",              dept: "72", pop: 143000 },
    { name: "Aix-en-Provence",      dept: "13", pop: 143000 },
    { name: "Clermont-Ferrand",     dept: "63", pop: 140000 },
    { name: "Brest",                dept: "29", pop: 139000 },
    { name: "Tours",                dept: "37", pop: 136000 },
    { name: "Amiens",               dept: "80", pop: 133000 },
    { name: "Limoges",              dept: "87", pop: 132000 },
    { name: "Boulogne-Billancourt", dept: "92", pop: 121000 },
    { name: "Perpignan",            dept: "66", pop: 119000 },
    { name: "Metz",                 dept: "57", pop: 117000 },
    { name: "Besançon",             dept: "25", pop: 116000 },
    { name: "Orléans",              dept: "45", pop: 116000 },
    { name: "Saint-Denis",          dept: "93", pop: 112000 },
    { name: "Rouen",                dept: "76", pop: 110000 },
    { name: "Argenteuil",           dept: "95", pop: 110000 },
    { name: "Montreuil",            dept: "93", pop: 109000 },
    { name: "Mulhouse",             dept: "68", pop: 108000 },
    { name: "Caen",                 dept: "14", pop: 105000 },
    { name: "Nancy",                dept: "54", pop: 104000 },
    { name: "Roubaix",              dept: "59", pop: 96000 },
    { name: "Tourcoing",            dept: "59", pop: 97000 },
    { name: "Dunkerque",            dept: "59", pop: 86000 },
    { name: "Calais",               dept: "62", pop: 71000 },
    { name: "Béthune",              dept: "62", pop: 25000 },
    { name: "Saint-Quentin",        dept: "02", pop: 53000 },
    { name: "Compiègne",            dept: "60", pop: 41000 }
  ];

  function buildFallbackCitiesWithCodes() {
    var counters = {};
    return FALLBACK_CITIES.map(function (c) {
      counters[c.dept] = (counters[c.dept] || 0) + 1;
      var suffix = String(counters[c.dept]).padStart(3, "0");
      return {
        code: c.dept + suffix,
        name: c.name,
        department_code: c.dept,
        population: c.pop
      };
    });
  }

  // ------------------------------------------------------------------
  // 2. LIVE CALL TO THE ADMINISTRATIVE BOUNDARIES API
  // ------------------------------------------------------------------
  // No population filter here: we fetch EVERY commune in France
  // (~35,000, response of a few MB), only dropping rows where the
  // API doesn't report a population.
  async function fetchCitiesFrance() {
    var url = "https://geo.api.gouv.fr/communes" +
      "?fields=nom,code,codeDepartement,population" +
      "&format=json&geometry=none";
    var res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    var json = await res.json();
    if (!Array.isArray(json) || json.length === 0) {
      throw new Error("Empty or unexpected response");
    }
    var rows = json
      .filter(function (c) {
        return typeof c.population === "number";
      })
      .map(function (c) {
        return {
          code: c.code,
          name: c.nom,
          department_code: c.codeDepartement,
          population: c.population
        };
      });
    if (!rows.length) {
      throw new Error("No commune with a usable population in the response");
    }
    return rows;
  }

  // ------------------------------------------------------------------
  // 3. SQL.JS INITIALIZATION + TABLE CREATION
  // ------------------------------------------------------------------
  async function loadBeginnerDB(opts) {
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

    var cities = null;
    var source = "sample (Administrative Boundaries API unavailable — reduced fallback dataset)";
    try {
      cities = await fetchCitiesFrance();
      source = "live (Administrative Boundaries API — geo.api.gouv.fr, " + cities.length + " communes)";
    } catch (e) {
      console.warn("[backend-beginner] API unavailable, falling back to sample data:", e.message);
      cities = buildFallbackCitiesWithCodes();
    }

    db.run(
      "CREATE TABLE city (" +
      "insee_code TEXT, name TEXT, department_code TEXT, population INTEGER" +
      ")"
    );
    var stmt = db.prepare("INSERT INTO city VALUES (?,?,?,?)");
    cities.forEach(function (c) {
      stmt.run([c.code, c.name, c.department_code, c.population]);
    });
    stmt.free();

    db.__queryRealDataSource = source;
    return db;
  }

  // ------------------------------------------------------------------
  // 4. EXPORTS
  // ------------------------------------------------------------------
  global.QueryRealBeginnerBackend = {
    FALLBACK_CITIES: FALLBACK_CITIES,
    fetchCitiesFrance: fetchCitiesFrance,
    loadBeginnerDB: loadBeginnerDB
  };
  global.loadBeginnerDB = loadBeginnerDB;

})(typeof window !== "undefined" ? window : globalThis);