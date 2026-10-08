/* ============================================================
   FIREBASE STORAGE LAYER
   ============================================================
   Manages progress synchronization between Firestore (cloud)
   and localStorage (local cache + offline fallback)
   ============================================================ */

const PROGRESS_KEY = 'queryreal_progress_v4';
const SYNC_TIMEOUT = 5000; // 5 seconds before fallback to localStorage

// ============================================================
// LOAD PROGRESS FROM FIRESTORE (or fallback to localStorage)
// ============================================================
async function loadProgress(levelId) {
  if (!currentUser) {
    // Not logged in: use localStorage only
    return loadProgressLocal(levelId);
  }

  try {
    // Try to fetch from Firestore with timeout
    const docRef = db.collection('users').doc(currentUser.uid);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore timeout')), SYNC_TIMEOUT)
    );
    
    const docPromise = docRef.get();
    const doc = await Promise.race([docPromise, timeout]);
    
    if (doc.exists && doc.data().progress && doc.data().progress[levelId]) {
      console.log(`✅ Loaded ${levelId} from Firestore`);
      const fsProgress = doc.data().progress[levelId];
      
      // Also update localStorage as backup
      updateProgressLocal(levelId, fsProgress);
      
      return fsProgress;
    }
  } catch (error) {
    console.warn(`⚠️ Firestore fetch failed for ${levelId}, falling back to localStorage:`, error.message);
  }

  // Fallback: use localStorage
  return loadProgressLocal(levelId);
}

// ============================================================
// SAVE PROGRESS TO FIRESTORE (and localStorage)
// ============================================================
async function saveProgress(levelId, progressData) {
  // Always save to localStorage immediately (offline support)
  updateProgressLocal(levelId, progressData);

  if (!currentUser) {
    console.log('ℹ️ Not logged in, saved to localStorage only');
    return;
  }

  try {
    // Save to Firestore in background (async, don't wait)
    const docRef = db.collection('users').doc(currentUser.uid);
    await docRef.update({
      [`progress.${levelId}`]: progressData,
      lastUpdated: new Date()
    });
    console.log(`✅ Saved ${levelId} to Firestore`);
  } catch (error) {
    console.error(`❌ Failed to save ${levelId} to Firestore:`, error);
    // Progress is already in localStorage, so we're not losing data
  }
}

// ============================================================
// SYNC ALL PROGRESS FROM FIRESTORE ON APP START
// ============================================================
async function syncProgressFromFirestore() {
  if (!currentUser) return;

  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists && doc.data().progress) {
      console.log('🔄 Syncing all progress from Firestore...');
      const allProgress = doc.data().progress;
      
      // Update localStorage with all levels
      Object.keys(allProgress).forEach(levelId => {
        updateProgressLocal(levelId, allProgress[levelId]);
      });
      
      console.log('✅ Sync complete');
    }
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

// ============================================================
// LOCAL STORAGE FUNCTIONS (as backup + offline support)
// ============================================================
function loadProgressLocal(levelId) {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
    if (all[levelId]) {
      return all[levelId];
    }
    
    // Crée une structure vide si nécessaire
    // (sera remplie quand le jeu charge les niveaux)
    return createEmptyProgress(levelId);
  } catch (e) {
    return createEmptyProgress(levelId);
  }
}

function updateProgressLocal(levelId, progressData) {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
    all[levelId] = progressData;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('localStorage error:', e);
  }
}

function createEmptyProgress(levelId) {
  return {
    challengeIndex: 0,
    completed: [], // Vide pour commencer
    answers: []
  };
}

// ============================================================
// CLOUD BACKUP UTILITIES
// ============================================================

// Check if user has unsynced local changes
async function hasUnsyncedChanges() {
  if (!currentUser) return false;

  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (!doc.exists) return true;

    const cloudLastUpdate = doc.data().lastUpdated?.toDate() || new Date(0);
    const localData = localStorage.getItem(PROGRESS_KEY);
    
    // If there's local data and cloud is older, there are unsynced changes
    return localData && cloudLastUpdate.getTime() < new Date().getTime() - 60000; // 1 min threshold
  } catch (error) {
    console.error('Error checking sync status:', error);
    return false;
  }
}

// Force full sync: push all local progress to Firestore
async function forceFullSync() {
  if (!currentUser) {
    alert('Vous devez être connecté pour synchroniser');
    return;
  }

  try {
    const localData = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
    
    // Reconstruct complete progress object with default values
    const completeProgress = {};
    Object.keys(levels).forEach(levelId => {
      completeProgress[levelId] = localData[levelId] || createEmptyProgress(levelId);
    });

    await db.collection('users').doc(currentUser.uid).update({
      progress: completeProgress,
      lastUpdated: new Date()
    });

    alert('✅ Synchronisation réussie ! Votre progression a été sauvegardée.');
    console.log('✅ Full sync complete');
  } catch (error) {
    alert('❌ Erreur lors de la synchronisation: ' + error.message);
    console.error('Full sync error:', error);
  }
}

// ============================================================
// REPLACED PROGRESS FUNCTIONS (from original index.html)
// These now use Firebase instead of pure localStorage
// ============================================================

async function getProgress(levelId) {
  return await loadProgress(levelId);
}

function setProgress(levelId, progress) {
  saveProgress(levelId, progress);
}