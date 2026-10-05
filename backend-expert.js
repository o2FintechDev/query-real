/* ============================================================
   QUERYREAL — EXPERT LEVEL BACKEND (v3 — French Health Budget)
   ============================================================
   Source: Ministère de l'Économie et des Finances
   https://data.economie.gouv.fr/explore/dataset/balances_des_comptes_etat/
   
   Mission "Santé" budget analysis 2015-2025
   Focus: libellemission = 'Santé' with real accounting balances
   
   Two tables:
     balance     → fact table (year, mission, posting_category, program, 
                   account_code, nature_budgetaire, balance)
     posting_ref → reference table (posting_category, description)
   ============================================================ */

(function (global) {
  "use strict";

  var BASE_URL = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/balances_des_comptes_etat/records";
  var WHERE_FILTER = "libellemission='Santé' AND year(annee)>=2015 AND year(annee)<=2025";

  // ------------------------------------------------------------------
  // 1. FALLBACK DATA (SAMPLE — representative Health budget 2015-2025)
  // ------------------------------------------------------------------
  function buildLargeFallbackDataset() {
    var rows = [];
    var years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
    var categories = [
      "Charges de fonctionnement direct",
      "Achats, variations de stocks et prestations externes",
      "Autres charges de fonctionnement",
      "Dotations aux amortissements"
    ];
    var programs = [
      "PREVENTION ET SANTE ENVIRONNEMENTALE",
      "SANTE DE LA POPULATION",
      "SANTE PUBLIQUE",
      "SECURITE SANITAIRE",
      "SOINS ET URGENCES"
    ];
    var baseAccounts = [
      { code: "6001", name: "Personnel médical" },
      { code: "6050", name: "Personnels administratifs" },
      { code: "6100", name: "Matières premières" },
      { code: "6150", name: "Prestations externes" },
      { code: "6200", name: "Services extérieurs" },
      { code: "6250", name: "Télécommunications" },
      { code: "6800", name: "Autres charges" }
    ];
    
    years.forEach(function (year) {
      categories.forEach(function (cat) {
        programs.forEach(function (prog) {
          baseAccounts.forEach(function (acc, idx) {
            var seed = (year * 1000 + categories.indexOf(cat) * 100 + programs.indexOf(prog) * 20 + idx);
            var baseBalance = (seed % 500000000) + 100000000;
            var variance = ((seed * 13) % 50000000) - 25000000;
            var balance = baseBalance + variance;
            
            rows.push({
              year: year,
              mission: "Santé",
              posting_category: cat,
              program: prog,
              account_code: acc.code,
              account_name: acc.name,
              nature: "NAT_" + (seed % 3),
              balance: balance
            });
          });
        });
      });
    });
    
    return rows;
  }
  
  var FALLBACK_BALANCES = buildLargeFallbackDataset();

  // ------------------------------------------------------------------
  // 2. LIVE CALL TO MINISTÈRE API
  // ------------------------------------------------------------------
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function fetchWithTimeout(url, timeout = 30000) {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, timeout);
    try {
      var res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  async function fetchBalances() {
    var rows = [];
    var offset = 0;
    var limit = 100;
    var pageCount = 0;
    var maxRecords = 10000;

    console.log("[backend-expert] Fetching Health budget data (Santé 2015-2025)...");
    
    while (offset < maxRecords) {
      var url = BASE_URL +
        "?where=" + encodeURIComponent(WHERE_FILTER) +
        "&limit=" + limit +
        "&offset=" + offset +
        "&lang=fr";

      try {
        console.log("[backend-expert] Fetching page " + (pageCount + 1) + " (offset=" + offset + ")");
        var res = await fetchWithTimeout(url, 30000);
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        
        var data = json && json.results;
        if (!Array.isArray(data)) throw new Error("Unexpected response (no results array)");
        
        rows = rows.concat(data);
        pageCount += 1;
        console.log("[backend-expert] Page " + pageCount + ": +" + data.length + " rows (total: " + rows.length + ")");
        
        if (data.length < limit) break;
        offset += limit;
        
        await delay(200);
      } catch (e) {
        console.error("[backend-expert] API fetch failed at offset " + offset + ":", e.message);
        throw e;
      }
    }

    if (rows.length === 0) throw new Error("No data returned from API");
    
    var allData = rows.map(function (r) {
      return {
        year: parseInt(r.annee, 10),
        mission: r.libellemission || "Santé",
        posting_category: r.postes || "",
        sub_posting_category: r.sous_postes || "",
        program: r.programme || "",
        account_code: r.compte || "",
        account_name: r.libelle_ministere || "",
        nature: r.nature_budgetaire || "",
        balance: r.balance_sortie || 0
      };
    });
    
    var yearsPresent = {};
    allData.forEach(function (row) {
      yearsPresent[row.year] = (yearsPresent[row.year] || 0) + 1;
    });
    console.log("[backend-expert] Loaded " + allData.length + " real rows. Years: " + JSON.stringify(yearsPresent));
    
    return allData;
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
      source = "live (Ministère de l'Économie, Budget Santé 2015-2025, " + balances.length + " records)";
      console.log("[backend-expert] ✅ API loaded successfully with " + balances.length + " records");
    } catch (e) {
      console.warn("[backend-expert] ⚠️ API unavailable, using fallback:", e.message);
      balances = FALLBACK_BALANCES;
    }

    // Create balance table
    db.run(
      "CREATE TABLE balance (" +
      "year INTEGER, mission TEXT, posting_category TEXT, sub_posting_category TEXT, program TEXT, " +
      "account_code TEXT, account_name TEXT, nature_budgetaire TEXT, balance REAL" +
      ")"
    );

    var stmt = db.prepare(
      "INSERT INTO balance (year, mission, posting_category, sub_posting_category, program, " +
      "account_code, account_name, nature_budgetaire, balance) VALUES (?,?,?,?,?,?,?,?,?)"
    );

    balances.forEach(function (b) {
      try {
        stmt.run([b.year, b.mission, b.posting_category, b.sub_posting_category, b.program, b.account_code, b.account_name, b.nature, b.balance]);
      } catch (e) {
        console.error("[backend-expert] Insert error:", e.message);
      }
    });
    stmt.free();

    // Create posting_ref table (deduplicated posting categories)
    db.run(
      "CREATE TABLE posting_ref (" +
      "posting_category TEXT PRIMARY KEY, description TEXT" +
      ")"
    );

    var seen = {};
    var stmtRef = db.prepare(
      "INSERT INTO posting_ref (posting_category, description) VALUES (?,?)"
    );

    balances.forEach(function (b) {
      if (b.posting_category && !seen[b.posting_category]) {
        seen[b.posting_category] = true;
        stmtRef.run([b.posting_category, b.posting_category]);
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