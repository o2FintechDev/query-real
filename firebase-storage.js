/* ============================================================
   STOCKAGE DE LA PROGRESSION
   Local d'abord (instantané), cloud ensuite si connecté.
   ============================================================ */

const PROGRESS_KEY = 'queryreal_progress_v4';
const OWNER_KEY = 'queryreal_owner';

function challengeCount(levelId) {
  return (typeof levels !== 'undefined' && levels[levelId])
    ? levels[levelId].challenges.length
    : 5;
}

function createEmptyProgress(levelId) {
  const n = challengeCount(levelId);
  return {
    challengeIndex: 0,
    completed: new Array(n).fill(false),
    answers: new Array(n).fill('')
  };
}

// Force une structure propre (tableaux pleins, types corrects).
// Indispensable : Firestore n'accepte pas les tableaux à trous.
function normalizeProgress(levelId, p) {
  const base = createEmptyProgress(levelId);
  if (!p || typeof p !== 'object') return base;

  const n = base.completed.length;
  const idx = parseInt(p.challengeIndex, 10);
  base.challengeIndex = Math.min(Math.max(isNaN(idx) ? 0 : idx, 0), n - 1);

  for (let i = 0; i < n; i++) {
    base.completed[i] = !!(Array.isArray(p.completed) && p.completed[i]);
    base.answers[i] = (Array.isArray(p.answers) && typeof p.answers[i] === 'string')
      ? p.answers[i]
      : '';
  }
  return base;
}

function countCompleted(p) {
  return p.completed.filter(Boolean).length;
}

// En cas de conflit local / cloud, on garde la version la plus avancée.
function mergeProgress(levelId, local, cloud) {
  const l = normalizeProgress(levelId, local);
  const c = normalizeProgress(levelId, cloud);
  return countCompleted(c) > countCompleted(l) ? c : l;
}

// ------------------------------------------------------------
// LOCAL (synchrone, toujours disponible)
// ------------------------------------------------------------
function readAllLocal() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function loadProgressLocal(levelId) {
  return normalizeProgress(levelId, readAllLocal()[levelId]);
}

function updateProgressLocal(levelId, data) {
  const all = readAllLocal();
  all[levelId] = normalizeProgress(levelId, data);
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('[QueryReal] Sauvegarde locale impossible :', e);
  }
}

// ------------------------------------------------------------
// CLOUD (asynchrone, facultatif)
// ------------------------------------------------------------
async function pushProgressCloud(levelId) {
  if (!currentUser || !db) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({
      progress: { [levelId]: loadProgressLocal(levelId) },
      lastUpdated: new Date()
    }, { merge: true });
  } catch (e) {
    console.error('[QueryReal] Synchronisation cloud échouée :', e);
  }
}

// Enregistre localement tout de suite, puis envoie au cloud sans attendre.
function setProgress(levelId, data) {
  updateProgressLocal(levelId, data);
  pushProgressCloud(levelId);
}

// Appelée à la connexion : fusionne local et cloud pour chaque niveau.
async function syncProgressFromFirestore() {
  if (!currentUser || !db || typeof levels === 'undefined') return;

  // Évite de mélanger la progression d'un autre compte sur un ordinateur partagé
  const previousOwner = localStorage.getItem(OWNER_KEY);
  if (previousOwner && previousOwner !== currentUser.uid) {
    localStorage.removeItem(PROGRESS_KEY);
  }
  localStorage.setItem(OWNER_KEY, currentUser.uid);

  try {
    const ref = db.collection('users').doc(currentUser.uid);
    const doc = await ref.get();
    const cloud = (doc.exists && doc.data().progress) || {};

    const merged = {};
    Object.keys(levels).forEach(id => {
      merged[id] = mergeProgress(id, loadProgressLocal(id), cloud[id]);
      updateProgressLocal(id, merged[id]);
    });

    await ref.set({ progress: merged, lastUpdated: new Date() }, { merge: true });
  } catch (e) {
    console.error('[QueryReal] Synchronisation impossible :', e);
  }
}