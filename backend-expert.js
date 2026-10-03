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
  async function fetchBalances() {
    var url = BASE_URL +
      "?select=exer,numero_compte,compte_libelle,poste,nature_budgetaire,domaine_fonctionnel,solde" +
      "&where=exer >= 2014" +
      "&limit=100&format=json";
    var rows = [];
    var nextUrl = url;
    var pageCount = 0;
    var maxPages = 50;

    while (nextUrl && pageCount < maxPages) {
      try {
        var res = await fetch(nextUrl);
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        var data = json && json.results;
        if (!Array.isArray(data)) throw new Error("Unexpected response");
        rows = rows.concat(data);
        pageCount += 1;
        console.log("[backend-expert] page " + pageCount + ": +" + data.length + " rows (total: " + rows.length + ")");
        nextUrl = json.links && json.links.next ? json.links.next : null;
      } catch (e) {
        console.warn("[backend-expert] API fetch failed:", e.message);
        throw e;
      }
    }

    if (rows.length === 0) throw new Error("No data returned from API");
    return rows.map(function (r) {
      return {
        year: r.exer,
        code: r.numero_compte,
        name: r.compte_libelle,
        category: r.poste,
        nature: r.nature_budgetaire,
        program: r.domaine_fonctionnel,
        balance: r.solde
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
        "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js first"
      );
    }

    var SQL = await initFn({
      locateFile: function (f) {
        return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/" + f;
      }
    });
    var db = new SQL.Database();

    var balances = null;
    var source = "sample (Ministère API unavailable)";
    try {
      balances = await fetchBalances();
      source = "live (Ministère de l'Économie et des Finances, " + balances.length + " records)";
      console.log("[backend-expert] ✅ API loaded successfully");
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