/* ============================================================
   QUERYREAL — EXPERT LEVEL BACKEND (v2 — French State Accounting)
   ============================================================
   Source: Ministère de l'Économie et des Finances
   https://data.economie.gouv.fr/explore/dataset/balances_des_comptes_etat/
   
   Compte Général de l'État (CGE) — Public accounting data 2014-2024
   
   Two tables:
     balance     → fact table (year, account_code, account_name, posting_category, nature_budgetaire, program, balance)
     account_ref → reference table (account_code, account_name, posting_category)
   ============================================================ */

(function (global) {
  "use strict";

  var BASE_URL = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/balances_des_comptes_etat/records";

  // ------------------------------------------------------------------
  // 1. FALLBACK DATA (SAMPLE — representative French state accounts)
  // ------------------------------------------------------------------
  var FALLBACK_BALANCES = [
    { year: 2014, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 45000000 },
    { year: 2014, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -125000000 },
    { year: 2014, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 250000000 },
    { year: 2014, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -180000000 },
    
    { year: 2015, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 48000000 },
    { year: 2015, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -135000000 },
    { year: 2015, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 260000000 },
    { year: 2015, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -185000000 },
    
    { year: 2016, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 50000000 },
    { year: 2016, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -142000000 },
    { year: 2016, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 268000000 },
    { year: 2016, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -188000000 },
    
    { year: 2017, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 52000000 },
    { year: 2017, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -145000000 },
    { year: 2017, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 275000000 },
    { year: 2017, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -190000000 },
    
    { year: 2018, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 55000000 },
    { year: 2018, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -150000000 },
    { year: 2018, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 280000000 },
    { year: 2018, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -192000000 },
    
    { year: 2019, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 58000000 },
    { year: 2019, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -155000000 },
    { year: 2019, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 285000000 },
    { year: 2019, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -195000000 },
    
    { year: 2020, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 60000000 },
    { year: 2020, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -165000000 },
    { year: 2020, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 270000000 },
    { year: 2020, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -200000000 },
    
    { year: 2021, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 62000000 },
    { year: 2021, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -170000000 },
    { year: 2021, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 290000000 },
    { year: 2021, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -202000000 },
    
    { year: 2022, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 65000000 },
    { year: 2022, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -175000000 },
    { year: 2022, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 295000000 },
    { year: 2022, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -205000000 },
    
    { year: 2023, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 68000000 },
    { year: 2023, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -180000000 },
    { year: 2023, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 300000000 },
    { year: 2023, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -208000000 },
    
    { year: 2024, code: "1001", name: "Trésor Public", category: "Assets", nature: "LOLF_Titre_1", program: "Tresorerie", balance: 70000000 },
    { year: 2024, code: "2001", name: "Dettes Publiques", category: "Liabilities", nature: "LOLF_Titre_2", program: "Tresorerie", balance: -185000000 },
    { year: 2024, code: "7001", name: "Recettes Fiscales", category: "Revenue", nature: "LOLF_Titre_3", program: "Fiscalite", balance: 305000000 },
    { year: 2024, code: "6001", name: "Dépenses Fonctionnement", category: "Expenses", nature: "LOLF_Titre_4", program: "Fonctionnement", balance: -210000000 }
  ];

  // ------------------------------------------------------------------
  // 2. LIVE CALL TO MINISTÈRE API (fallback to sample if unavailable)
  // ------------------------------------------------------------------
  // Helper: fetch with timeout (10 seconds)
  async function fetchWithTimeout(url, timeout = 10000) {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, timeout);
    try {
      var res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  async function fetchBalances() {
    // OpenDataSoft API v2.1 uses offset/limit pagination (no "next" links)
    // Response format: { data: { total_count: N, results: [...] } }
    // Field names from actual API: annee, compte, libellemission, nature_budgetaire, programme, balance_sortie
    var rows = [];
    var offset = 0;
    var limit = 100;
    var pageCount = 0;
    var maxPages = 30; // Reasonable limit: 30 * 100 = 3000 rows max

    while (pageCount < maxPages) {
      var url = BASE_URL +
        "?limit=" + limit +
        "&offset=" + offset +
        "&format=json";

      try {
        console.log("[backend-expert] Fetching offset=" + offset);
        var res = await fetchWithTimeout(url, 10000);
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        
        // Response is at top level: { total_count, results: [...] }
        var data = json && json.results;
        if (!Array.isArray(data)) throw new Error("Unexpected response (no results array)");
        
        rows = rows.concat(data);
        pageCount += 1;
        console.log("[backend-expert] page " + pageCount + ": +" + data.length + " rows (total: " + rows.length + ")");
        
        // Stop if we got fewer rows than the limit (we're at the last page)
        if (data.length < limit) break;
        offset += limit;
      } catch (e) {
        console.warn("[backend-expert] API fetch failed:", e.message);
        throw e;
      }
    }

    if (rows.length === 0) throw new Error("No data returned from API");
    
    return rows.map(function (r) {
      return {
        year: parseInt(r.annee, 10),
        code: r.compte,
        name: r.libellemission,
        category: r.postes || "",
        nature: r.nature_budgetaire || "",
        program: r.programme || "",
        balance: r.balance_sortie || 0
      };
    });
  }

  // ------------------------------------------------------------------
  // 3. SQL.JS INITIALIZATION + TABLE CREATION
  // ------------------------------------------------------------------
  async function loadExpertDB(opts) {
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

    var balances = null;
    var source = "sample (Ministère API unavailable)";
    
    try {
      balances = await fetchBalances();
      source = "live (Ministère de l'Économie et des Finances, " + balances.length + " records)";
      console.log("[backend-expert] ✅ API loaded successfully with " + balances.length + " records");
    } catch (e) {
      console.warn("[backend-expert] ⚠️ API unavailable, falling back to sample:", e.message);
      balances = FALLBACK_BALANCES;
    }

    // Create balance table: 7 columns
    db.run(
      "CREATE TABLE balance (" +
      "year INTEGER, account_code TEXT, account_name TEXT, posting_category TEXT, " +
      "nature_budgetaire TEXT, program TEXT, balance REAL" +
      ")"
    );

    var stmt = db.prepare(
      "INSERT INTO balance (year, account_code, account_name, posting_category, " +
      "nature_budgetaire, program, balance) VALUES (?,?,?,?,?,?,?)"
    );

    balances.forEach(function (b) {
      try {
        stmt.run([b.year, b.code, b.name, b.category, b.nature, b.program, b.balance]);
      } catch (e) {
        console.error("[backend-expert] Insert error:", e.message, "Row:", b);
      }
    });
    stmt.free();

    // Create account_ref table: 3 columns (deduplicated from balance)
    db.run(
      "CREATE TABLE account_ref (" +
      "account_code TEXT, account_name TEXT, posting_category TEXT" +
      ")"
    );

    // Deduplicate and insert into account_ref
    var seen = {};
    var stmtRef = db.prepare(
      "INSERT INTO account_ref (account_code, account_name, posting_category) VALUES (?,?,?)"
    );

    balances.forEach(function (b) {
      var key = b.code + "|" + b.category;
      if (!seen[key]) {
        seen[key] = true;
        stmtRef.run([b.code, b.name, b.category]);
      }
    });
    stmtRef.free();

    db.__queryRealDataSource = source;
    return db;
  }

  // ------------------------------------------------------------------
  // 4. EXPORTS
  // ------------------------------------------------------------------
  global.QueryRealExpertBackend = {
    FALLBACK_BALANCES: FALLBACK_BALANCES,
    fetchBalances: fetchBalances,
    loadExpertDB: loadExpertDB
  };
  global.loadExpertDB = loadExpertDB;

})(typeof window !== "undefined" ? window : globalThis);