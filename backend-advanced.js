/* ============================================================
   QUERYREAL — ADVANCED LEVEL BACKEND (v1 — French public high schools)
   ------------------------------------------------------------
   Source: Éducation Nationale Directory (Etalab / Ministère de
   l'Éducation nationale)
   https://data.education.gouv.fr/explore/dataset/fr-en-annuaire-education/
   Open access, no API key, OpenDataSoft "Explore API v2.1" — using the
   /exports/json endpoint (accepts the same select/where filters as the
   paginated /records endpoint, but returns every matching row in a
   single call instead of requiring manual pagination).

   Two separate calls to the SAME dataset, selecting different
   columns each time, produce two tables:

     school      -->  reference table (uai, name, type, department, city)
     enrollment  -->  a second table (uai, student_count)

   Note: unlike the Intermediate level's station/measurement pair,
   this is a 1-to-1 relationship (one enrollment row per school), not
   a true fact table. It's split into two tables anyway so JOIN stays
   in practice, while keeping the field names 100% verified against
   the official data.gouv.fr documentation — after several rounds of
   trial and error with Hub'Eau's field names, reliability took
   priority over a "perfect" fact/reference split here.

   Restricted to public lycées (WHERE type_etablissement="Lycée" and
   statut_public_prive="Public") to keep the dataset a focused,
   browser-friendly size (~2600 nationally) instead of the full
   ~66000 establishments of every type.

   Same fallback strategy as the other levels: if the API is
   unavailable, fall back to a sample dataset with the same schema.
   ============================================================ */

(function (global) {
  "use strict";

  var BASE_URL = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/exports/json";
  var WHERE_FILTER = 'statut_public_prive="Public" and type_etablissement like "Lycee"';

  // ------------------------------------------------------------------
  // 1. FALLBACK DATA (SAMPLE)
  // ------------------------------------------------------------------
  var FALLBACK_SCHOOLS = [
    { uai: "0750001A", name: "Lyc\u00e9e Louis-le-Grand",        type: "Lyc\u00e9e", dep: "75", city: "Paris" },
    { uai: "0750002B", name: "Lyc\u00e9e Henri-IV",              type: "Lyc\u00e9e", dep: "75", city: "Paris" },
    { uai: "0690003C", name: "Lyc\u00e9e du Parc",               type: "Lyc\u00e9e", dep: "69", city: "Lyon" },
    { uai: "0330004D", name: "Lyc\u00e9e Montaigne",             type: "Lyc\u00e9e", dep: "33", city: "Bordeaux" },
    { uai: "0130005E", name: "Lyc\u00e9e Thiers",                type: "Lyc\u00e9e", dep: "13", city: "Marseille" },
    { uai: "0310006F", name: "Lyc\u00e9e Pierre-de-Fermat",      type: "Lyc\u00e9e", dep: "31", city: "Toulouse" },
    { uai: "0590007G", name: "Lyc\u00e9e Faidherbe",             type: "Lyc\u00e9e", dep: "59", city: "Lille" },
    { uai: "0670008H", name: "Lyc\u00e9e Kl\u00e9ber",           type: "Lyc\u00e9e", dep: "67", city: "Strasbourg" },
    { uai: "0440009J", name: "Lyc\u00e9e Clemenceau",            type: "Lyc\u00e9e", dep: "44", city: "Nantes" },
    { uai: "0060010K", name: "Lyc\u00e9e Mass\u00e9na",          type: "Lyc\u00e9e", dep: "06", city: "Nice" },
    { uai: "7500011L", name: "Lyc\u00e9e Jacques-Decour",        type: "Lyc\u00e9e", dep: "75", city: "Paris" },
    { uai: "6900012M", name: "Lyc\u00e9e Ampere",                type: "Lyc\u00e9e", dep: "69", city: "Lyon" },
    { uai: "3300013N", name: "Lyc\u00e9e Camille-Jullian",       type: "Lyc\u00e9e", dep: "33", city: "Bordeaux" },
    { uai: "1300014P", name: "Lyc\u00e9e Saint-Charles",         type: "Lyc\u00e9e", dep: "13", city: "Marseille" },
    { uai: "3100015Q", name: "Lyc\u00e9e Saint-Sernin",          type: "Lyc\u00e9e", dep: "31", city: "Toulouse" },
    { uai: "5900016R", name: "Lyc\u00e9e Baggio",                type: "Lyc\u00e9e", dep: "59", city: "Lille" },
    { uai: "6700017S", name: "Lyc\u00e9e Jean-Monnet",           type: "Lyc\u00e9e", dep: "67", city: "Strasbourg" },
    { uai: "4400018T", name: "Lyc\u00e9e Gabriel-Guist'hau",     type: "Lyc\u00e9e", dep: "44", city: "Nantes" },
    { uai: "0060019U", name: "Lyc\u00e9e Calmette",              type: "Lyc\u00e9e", dep: "06", city: "Nice" },
    { uai: "7500020V", name: "Lyc\u00e9e Victor-Hugo",           type: "Lyc\u00e9e", dep: "75", city: "Paris" }
  ];

  var FALLBACK_ENROLLMENT = [
    1450, 1180, 1620, 980, 1340, 1510, 890, 1050, 1220, 760,
    1090, 1380, 940, 1600, 870, 1010, 1150, 720, 1290, 1470
  ];

  function buildFallbackEnrollment() {
    return FALLBACK_SCHOOLS.map(function (s, i) {
      return { uai: s.uai, student_count: FALLBACK_ENROLLMENT[i] };
    });
  }

  // ------------------------------------------------------------------
  // 2. LIVE CALLS TO THE ÉDUCATION NATIONALE DIRECTORY API
  // ------------------------------------------------------------------
  // Switched from /exports/json (single call, no row limit, but meant
  // for triggering file downloads rather than being called with fetch()
  // from a browser — it's flaky/CORS-unfriendly in practice on this
  // portal) to /records with pagination — the endpoint the portal's own
  // "Reuse this dataset > API" code generator recommends for JS usage.
  // /records caps each page at limit=100, with offset+limit < 10000
  // (per the official ODS v2.1 docs), so we page through with offset.
  // ~2600 public lycées nationally means ~27 calls — well under the
  // anonymous quota (5000 calls/day/IP), so no API key is needed (and
  // embedding one in client-side JS would expose it to anyone viewing
  // the page source, which is bad practice for a public data key too).
  var RECORDS_URL = BASE_URL + "/records";
  var PAGE_LIMIT = 100;
  var MAX_OFFSET = 9900; // stay under offset+limit < 10000

  async function fetchAnnuaireExport(selectFields) {
    var rows = [];
    var offset = 0;
    while (true) {
      var url = RECORDS_URL +
        "?select=" + encodeURIComponent(selectFields) +
        "&where=" + encodeURIComponent(WHERE_FILTER) +
        "&limit=" + PAGE_LIMIT +
        "&offset=" + offset +
        "&lang=fr";
      var res = await fetch(url);
      if (!res.ok) {
        var errBody = "";
        try { errBody = await res.text(); } catch (e2) { /* ignore */ }
        console.error("[education] HTTP " + res.status + " for URL:", url, "\nResponse body:", errBody);
        throw new Error("HTTP " + res.status);
      }
      var json = await res.json();
      var page = json && Array.isArray(json.results) ? json.results : null;
      if (!page) throw new Error("Unexpected response shape from /records");
      rows = rows.concat(page);
      console.log(
        "[education] /records offset=" + offset + ": +" + page.length + " rows (total so far: " + rows.length + "),",
        "API total_count field:", json.total_count
      );
      if (page.length < PAGE_LIMIT) break; // last page reached
      offset += PAGE_LIMIT;
      if (offset > MAX_OFFSET) break; // safety net: stay under the API's depth cap
    }
    if (!rows.length) throw new Error("No rows returned from /records (empty result set)");
    console.log("[education] exports/json returned " + rows.length + " rows for select=" + selectFields + ", url:", url);
    return rows;
  }

  async function fetchSchools() {
    var rows = await fetchAnnuaireExport(
      "identifiant_de_l_etablissement,nom_etablissement,type_etablissement,code_departement,nom_commune"
    );
    var mapped = rows
      .filter(function (r) { return r.identifiant_de_l_etablissement && r.nom_etablissement; })
      .map(function (r) {
        return {
          uai: r.identifiant_de_l_etablissement,
          name: r.nom_etablissement,
          type: r.type_etablissement,
          department_code: r.code_departement,
          city: r.nom_commune
        };
      });
    if (!mapped.length) throw new Error("No usable school rows after filtering (missing/renamed fields?)");
    return mapped;
  }

  async function fetchEnrollment() {
    var rows = await fetchAnnuaireExport("identifiant_de_l_etablissement,nombre_d_eleves");
    var mapped = rows
      .filter(function (r) { return r.identifiant_de_l_etablissement && typeof r.nombre_d_eleves === "number"; })
      .map(function (r) {
        return { uai: r.identifiant_de_l_etablissement, student_count: r.nombre_d_eleves };
      });
    if (!mapped.length) throw new Error("No usable enrollment rows after filtering (missing/renamed fields?)");
    return mapped;
  }

  // ------------------------------------------------------------------
  // 3. SQL.JS INITIALIZATION + TABLE CREATION
  // ------------------------------------------------------------------
  async function loadAdvancedDB(opts) {
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

    var schools = null;
    var enrollment = null;
    var source = "sample (Education Directory API unavailable)";
    try {
      var results = await Promise.all([fetchSchools(), fetchEnrollment()]);
      schools = results[0];
      enrollment = results[1];
      source = "live (\u00c9ducation Nationale Directory API, public lyc\u00e9es)";
    } catch (e) {
      console.warn("[backend-advanced] API unavailable, falling back to sample data:", e.message);
      schools = FALLBACK_SCHOOLS.map(function (s) {
        return { uai: s.uai, name: s.name, type: s.type, department_code: s.dep, city: s.city };
      });
      enrollment = buildFallbackEnrollment();
    }

    db.run(
      "CREATE TABLE school (" +
      "uai TEXT, name TEXT, type TEXT, department_code TEXT, city TEXT" +
      ")"
    );
    var stmtS = db.prepare("INSERT INTO school VALUES (?,?,?,?,?)");
    schools.forEach(function (s) {
      stmtS.run([s.uai, s.name, s.type, s.department_code, s.city]);
    });
    stmtS.free();

    db.run("CREATE TABLE enrollment (uai TEXT, student_count INTEGER)");
    var stmtE = db.prepare("INSERT INTO enrollment VALUES (?,?)");
    enrollment.forEach(function (e) {
      stmtE.run([e.uai, e.student_count]);
    });
    stmtE.free();

    db.__queryRealDataSource = source;
    return db;
  }

  // ------------------------------------------------------------------
  // 4. EXPORTS
  // ------------------------------------------------------------------
  global.QueryRealAdvancedBackend = {
    FALLBACK_SCHOOLS: FALLBACK_SCHOOLS,
    fetchSchools: fetchSchools,
    fetchEnrollment: fetchEnrollment,
    loadAdvancedDB: loadAdvancedDB
  };
  global.loadAdvancedDB = loadAdvancedDB;

})(typeof window !== "undefined" ? window : globalThis);