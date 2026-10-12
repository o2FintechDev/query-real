/* ============================================================
   FIREBASE STORAGE LAYER (v5 — progression liée au compte)
   ============================================================
   Source de vérité : le document Firestore users/{uid}.
   - Au login : on fusionne (cloud + cache local du compte +
     ancienne progression locale non liée à un compte), puis on
     renvoie le résultat fusionné vers Firestore.
   - Ensuite toutes les lectures se font dans un cache mémoire
     (synchrone), tenu à jour en temps réel via onSnapshot :
     une validation faite sur le PC apparaît sur le téléphone.
   - localStorage n'est plus qu'un cache hors-ligne, isolé par
     compte (clé suffixée par l'uid).
   ============================================================ */

const LEGACY_PROGRESS_KEY = 'queryreal_progress_v4';   // ancienne clé, non liée au compte
const PROGRESS_KEY_PREFIX = 'queryreal_progress_v5_';  // + uid
const SYNC_TIMEOUT = 8000;

let progressCache = {};
let progressUnsubscribe = null;

// ============================================================
// HELPERS
// ============================================================
function userDocRef(uid) {
  return db.collection('users').doc(uid);
}

function localKey(uid) {
  return PROGRESS_KEY_PREFIX + uid;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('Firestore timeout')); }, ms);
    })
  ]);
}

function createEmptyProgress() {
  return { challengeIndex: 0, completed: [], answers: [] };
}

// Firestore refuse les valeurs `undefined` (trous dans les tableaux) :
// on renvoie toujours des tableaux denses et typés.
function sanitizeProgress(p) {
  p = p || {};
  var completed = Array.isArray(p.completed) ? p.completed : [];
  var answers = Array.isArray(p.answers) ? p.answers : [];
  return {
    challengeIndex: Number.isInteger(p.challengeIndex) && p.challengeIndex >= 0 ? p.challengeIndex : 0,
    completed: Array.from({ length: completed.length }, function (_, i) { return !!completed[i]; }),
    answers: Array.from({ length: answers.length }, function (_, i) {
      return typeof answers[i] === 'string' ? answers[i] : '';
    })
  };
}

// Fusion de deux progressions : un défi validé sur n'importe quel
// appareil reste validé, on garde l'index le plus avancé.
function mergeProgress(a, b) {
  a = sanitizeProgress(a);
  b = sanitizeProgress(b);
  var n = Math.max(a.completed.length, b.completed.length, a.answers.length, b.answers.length);
  var out = {
    challengeIndex: Math.max(a.challengeIndex, b.challengeIndex),
    completed: [],
    answers: []
  };
  for (var i = 0; i < n; i++) {
    out.completed[i] = !!(a.completed[i] || b.completed[i]);
    out.answers[i] = b.answers[i] || a.answers[i] || '';
  }
  return out;
}

function mergeAll(target, source) {
  if (!source || typeof source !== 'object') return target;
  Object.keys(source).forEach(function (levelId) {
    target[levelId] = mergeProgress(target[levelId], source[levelId]);
  });
  return target;
}

function readLocal(uid) {
  try { return JSON.parse(localStorage.getItem(localKey(uid))) || {}; }
  catch (e) { return {}; }
}

function writeLocal(uid, all) {
  try { localStorage.setItem(localKey(uid), JSON.stringify(all)); }
  catch (e) { console.error('localStorage error:', e); }
}

function notifyProgressChanged() {
  if (typeof onProgressChanged === 'function') {
    try { onProgressChanged(); } catch (e) { console.error(e); }
  }
}

// ============================================================
// INITIALISATION AU LOGIN
// ============================================================
async function initProgressForUser(user) {
  stopProgressSync();
  var uid = user.uid;

  // 1. Cache local de CE compte
  var merged = mergeAll({}, readLocal(uid));

  // 2. Ancienne progression locale (avant v5, pas liée au compte) :
  //    on la rattache au compte connecté une seule fois.
  var legacy = null;
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_PROGRESS_KEY)); } catch (e) { /* ignore */ }
  mergeAll(merged, legacy);

  // 3. Progression cloud
  var cloudOk = false;
  try {
    var doc = await withTimeout(userDocRef(uid).get(), SYNC_TIMEOUT);
    if (doc.exists && doc.data().progress) mergeAll(merged, doc.data().progress);
    cloudOk = true;
  } catch (e) {
    console.warn('⚠️ Lecture Firestore impossible, cache local utilisé :', e.message);
  }

  progressCache = merged;
  writeLocal(uid, progressCache);

  // 4. On renvoie l'état fusionné vers le cloud (seulement si on a
  //    bien lu le cloud, pour ne jamais écraser une progression plus récente).
  //    set({merge:true}) crée le document s'il n'existe pas —
  //    c'est ce qui manquait pour les connexions Google / GitHub.
  if (cloudOk) {
    try {
      await userDocRef(uid).set({
        email: user.email || null,
        progress: progressCache,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      if (legacy) localStorage.removeItem(LEGACY_PROGRESS_KEY);
      console.log('✅ Progression synchronisée avec le compte');
    } catch (e) {
      console.error('❌ Écriture Firestore impossible (vérifiez les règles de sécurité) :', e);
    }
  }

  startProgressSync(uid);
}

// Écoute temps réel : une validation faite sur un autre appareil
// est répercutée ici sans recharger la page.
function startProgressSync(uid) {
  progressUnsubscribe = userDocRef(uid).onSnapshot(function (doc) {
    if (!doc.exists) return;
    var cloud = (doc.data() && doc.data().progress) || {};
    var before = JSON.stringify(progressCache);
    mergeAll(progressCache, cloud);
    if (JSON.stringify(progressCache) !== before) {
      writeLocal(uid, progressCache);
      notifyProgressChanged();
    }
  }, function (error) {
    console.error('❌ Écoute Firestore interrompue :', error);
  });
}

function stopProgressSync() {
  if (progressUnsubscribe) {
    progressUnsubscribe();
    progressUnsubscribe = null;
  }
}

function clearProgressCache() {
  stopProgressSync();
  progressCache = {};
}

// ============================================================
// LECTURE / ÉCRITURE (API utilisée par index.html)
// ============================================================
function getProgressSync(levelId) {
  if (!progressCache[levelId]) progressCache[levelId] = createEmptyProgress();
  return progressCache[levelId];
}

// Gardée async pour compatibilité avec le code existant (await getProgress)
async function getProgress(levelId) {
  return getProgressSync(levelId);
}

async function saveProgress(levelId, progressData) {
  progressCache[levelId] = sanitizeProgress(progressData);
  if (!currentUser) return;

  var uid = currentUser.uid;
  writeLocal(uid, progressCache);

  try {
    // Map imbriquée + merge:true → seul ce niveau est mis à jour,
    // et le document est créé s'il n'existe pas encore.
    var payload = { progress: {}, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() };
    payload.progress[levelId] = progressCache[levelId];
    await userDocRef(uid).set(payload, { merge: true });
    console.log('✅ ' + levelId + ' sauvegardé sur le compte');
  } catch (error) {
    console.error('❌ Sauvegarde Firestore échouée pour ' + levelId + ' :', error);
  }
}

function setProgress(levelId, progress) {
  return saveProgress(levelId, progress);
}

// Forcer l'envoi de toute la progression du cache vers le compte
async function forceFullSync() {
  if (!currentUser) {
    alert('Vous devez être connecté pour synchroniser');
    return;
  }
  try {
    var complete = {};
    Object.keys(levels).forEach(function (levelId) {
      complete[levelId] = sanitizeProgress(getProgressSync(levelId));
    });
    await userDocRef(currentUser.uid).set({
      progress: complete,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    alert('✅ Synchronisation réussie ! Votre progression a été sauvegardée.');
  } catch (error) {
    alert('❌ Erreur lors de la synchronisation : ' + error.message);
  }
}