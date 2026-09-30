/* ============================================================
   QUERYREAL — ADVANCED LEVEL BACKEND (v3 — French universities)
   ------------------------------------------------------------
   Source: Ministère de l'Enseignement Supérieur et de la Recherche
   https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur/records
   
   Open access, no API key, OpenDataSoft "Explore API v2.1"
   
   Two tables:
     university   -->  reference table (uai, name, type, department_code, city)
     enrollment   -->  a second table (uai, student_count) — REAL DATA from inscrits_2024
   
   65 public universities have the "Université" designation, but only 58 have official 2024 enrollment data (inscrits_2024).
   ============================================================ */

(function (global) {
  "use strict";

  var BASE_URL = "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur";
  var WHERE_FILTER = 'secteur_d_etablissement="public" AND typologie_d_universites_et_assimiles IS NOT NULL';
  var RECORDS_URL = BASE_URL + "/records";
  var PAGE_LIMIT = 100;
  var MAX_OFFSET = 9900;

  // ------------------------------------------------------------------
  // 1. FALLBACK DATA (SAMPLE)
  // ------------------------------------------------------------------
  var FALLBACK_SCHOOLS = [
    { uai: "0750662Z", name: "Sorbonne Université",                type: "Université", dep: "75", city: "Paris" },
    { uai: "0750654J", name: "Université Paris Cité",              type: "Université", dep: "75", city: "Paris" },
    { uai: "0750673K", name: "Université Paris-Saclay",            type: "Université", dep: "91", city: "Orsay" },
    { uai: "0750665C", name: "Université PSL",                     type: "Université", dep: "75", city: "Paris" },
    { uai: "0690033X", name: "Université Claude Bernard Lyon 1",    type: "Université", dep: "69", city: "Lyon" },
    { uai: "0690034Y", name: "Université Lumière Lyon 2",           type: "Université", dep: "69", city: "Lyon" },
    { uai: "0330073P", name: "Université de Bordeaux",              type: "Université", dep: "33", city: "Bordeaux" },
    { uai: "0130091M", name: "Aix-Marseille Université",            type: "Université", dep: "13", city: "Marseille" },
    { uai: "0310078L", name: "Université Toulouse III",             type: "Université", dep: "31", city: "Toulouse" },
    { uai: "0590032U", name: "Université de Lille",                 type: "Université", dep: "59", city: "Lille" },
    { uai: "0670035W", name: "Université de Strasbourg",            type: "Université", dep: "67", city: "Strasbourg" },
    { uai: "0440054G", name: "Université de Nantes",                type: "Université", dep: "44", city: "Nantes" },
    { uai: "0060041C", name: "Université Côte d'Azur",              type: "Université", dep: "06", city: "Nice" },
    { uai: "0380058A", name: "Université Grenoble Alpes",           type: "Université", dep: "38", city: "Grenoble" },
    { uai: "0210017S", name: "Université de Bourgogne",             type: "Université", dep: "21", city: "Dijon" },
    { uai: "0870011F", name: "Université de Limoges",               type: "Université", dep: "87", city: "Limoges" },
    { uai: "0450069H", name: "Université d'Orléans",                type: "Université", dep: "45", city: "Orléans" },
    { uai: "0720009T", name: "Université du Maine",                 type: "Université", dep: "72", city: "Le Mans" },
    { uai: "0240012E", name: "Université de Caen Normandie",        type: "Université", dep: "14", city: "Caen" },
    { uai: "0760033Q", name: "Université de Rouen Normandie",       type: "Université", dep: "76", city: "Rouen" }
  ];

  var FALLBACK_ENROLLMENT = [
    45000, 38000, 28000, 32000, 35000, 28000, 43000, 53000, 30000, 55000,
    45000, 38000, 25000, 42000, 30000, 18000, 15000, 12000, 20000, 18000
  ];

  function buildFallbackEnrollment() {
    return FALLBACK_SCHOOLS.map(function (s, i) {
      return { uai: s.uai, student_count: FALLBACK_ENROLLMENT[i] };
    });
  }

  // ------------------------------------------------------------------
  // 2. LIVE CALLS TO THE MINISTÈRE API
  // ------------------------------------------------------------------
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
      
      console.log("[universities] Fetching offset=" + offset);
      
      var res = await fetch(url);
      if (!res.ok) {
        var errBody = "";
        try { errBody = await res.text(); } catch (e2) { /* ignore */ }
        console.error("[universities] HTTP " + res.status, "Body:", errBody);
        throw new Error("HTTP " + res.status);
      }
      
      var json = await res.json();
      var page = json && Array.isArray(json.results) ? json.results : [];
      
      console.log("[universities] Got " + page.length + " rows (total: " + (rows.length + page.length) + ")");
      
      rows = rows.concat(page);
      if (page.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
      if (offset > MAX_OFFSET) break;
    }
    
    if (!rows.length) throw new Error("No rows returned from API");
    return rows;
  }

  async function fetchUniversities() {
    var rows = await fetchAnnuaireExport(
      "uai,uo_lib_officiel,dep_nom,com_nom"
    );
    var mapped = rows
      .filter(function (r) { return r.uai && r.uo_lib_officiel; })
      .map(function (r) {
        return {
          uai: r.uai,
          name: r.uo_lib_officiel,
          type: "Université",
          department_code: r.dep_nom || "",
          city: r.com_nom || ""
        };
      });
    
    // Déduplique par UAI
    var seen = {};
    var deduped = [];
    mapped.forEach(function (u) {
      if (!seen[u.uai]) {
        seen[u.uai] = true;
        deduped.push(u);
      }
    });
    
    console.log("[universities] Universities before dedup: " + mapped.length + ", after: " + deduped.length);
    if (!deduped.length) throw new Error("No usable universities returned");
    return deduped;
  }

  async function fetchEnrollment() {
    var rows = await fetchAnnuaireExport("uai,inscrits_2024");
    var mapped = rows
      .filter(function (r) { return r.uai && typeof r.inscrits_2024 === "number"; })
      .map(function (r) {
        return {
          uai: r.uai,
          student_count: r.inscrits_2024
        };
      });
    
    // Déduplique par UAI
    var seen = {};
    var deduped = [];
    mapped.forEach(function (e) {
      if (!seen[e.uai]) {
        seen[e.uai] = true;
        deduped.push(e);
      }
    });
    
    console.log("[universities] Enrollment rows before dedup: " + mapped.length + ", after: " + deduped.length);
    if (!deduped.length) throw new Error("No usable enrollment returned");
    return deduped;
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

    var universities = null;
    var enrollment = null;
    var source = "sample (Ministère API unavailable)";
    try {
      var results = await Promise.all([fetchUniversities(), fetchEnrollment()]);
      universities = results[0];
      enrollment = results[1];
      source = "live (Ministère de l'Enseignement Supérieur et de la Recherche, " + universities.length + " universités publiques)";
      console.log("[backend-advanced] ✅ API loaded successfully with " + universities.length + " universities");
    } catch (e) {
      console.warn("[backend-advanced] ⚠️ API unavailable, using fallback data:", e.message);
      universities = FALLBACK_SCHOOLS;
      enrollment = buildFallbackEnrollment();
    }

    db.run(
      "CREATE TABLE university (" +
      "uai TEXT PRIMARY KEY, name TEXT, type TEXT, department_code TEXT, city TEXT" +
      ")"
    );
    var stmtU = db.prepare("INSERT INTO university VALUES (?,?,?,?,?)");
    universities.forEach(function (u) {
      stmtU.run([u.uai, u.name, u.type, u.department_code, u.city]);
    });
    stmtU.free();

    db.run(
      "CREATE TABLE enrollment (" +
      "uai TEXT PRIMARY KEY, student_count INTEGER" +
      ")"
    );
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
    fetchUniversities: fetchUniversities,
    fetchEnrollment: fetchEnrollment,
    loadAdvancedDB: loadAdvancedDB
  };
  global.loadAdvancedDB = loadAdvancedDB;

})(typeof window !== "undefined" ? window : globalThis);