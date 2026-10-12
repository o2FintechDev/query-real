/* ============================================================
   FIREBASE CONFIGURATION & AUTHENTICATION
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyDDTAjRqa6ehzg5VfXshsHG8Ew14H119Wc",
  authDomain: "queryreal-88900.firebaseapp.com",
  projectId: "queryreal-88900",
  storageBucket: "queryreal-88900.firebasestorage.app",
  messagingSenderId: "660115641040",
  appId: "1:660115641040:web:c859eba688df22a0c8c4d5"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================
// AUTH STATE & USER MANAGEMENT
// ============================================================
let currentUser = null;

// Mode invité : on joue sans compte, la progression reste en mémoire
// (perdue à la fermeture de l'onglet). Si l'invité se connecte ensuite,
// sa progression est rattachée au compte (voir initProgressForUser).
let isGuest = false;

function startGuestMode() {
  isGuest = true;
  if (typeof closeModal === 'function') closeModal('guest-modal');
  showPage('home');
  if (typeof updateLevelsPageUI === 'function') updateLevelsPageUI();
}

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (user) {
    console.log("✅ Utilisateur connecté :", user.email || user.uid);
    // On attend la progression du COMPTE avant d'afficher quoi que ce soit :
    // sinon les niveaux sont calculés sur un cache vide (bug téléphone).
    await initProgressForUser(user);
    isGuest = false;
    showPage('home');
    if (typeof updateLevelsPageUI === 'function') updateLevelsPageUI();
  } else {
    console.log("🔐 Aucun utilisateur connecté");
    if (isGuest) return; // l'invité continue de jouer
    clearProgressCache();
    showPage('auth');
  }
});

// Depuis le mode invité : retour à l'écran de connexion sans perdre la partie
function goToLogin() {
  showPage('auth');
}

// ============================================================
// AUTHENTICATION FUNCTIONS
// ============================================================
// Sur mobile, les popups sont souvent bloquées : repli sur une redirection.
async function signInWithProvider(provider, label) {
  try {
    await auth.signInWithPopup(provider);
  } catch (error) {
    const fallbackCodes = [
      'auth/popup-blocked',
      'auth/operation-not-supported-in-environment',
      'auth/web-storage-unsupported'
    ];
    if (fallbackCodes.includes(error.code)) {
      // La redirection recharge la page : on confie la partie de l'invité
      // à la session de l'onglet pour la rattacher au compte au retour.
      if (isGuest) {
        try { sessionStorage.setItem(GUEST_HANDOFF_KEY, JSON.stringify(progressCache)); } catch (e) { /* ignore */ }
      }
      window.__qrRedirecting = true; // pas d'alerte « quitter la page » ici
      await auth.signInWithRedirect(provider);
      return;
    }
    if (error.code === 'auth/popup-closed-by-user') return;
    console.error('❌ Connexion ' + label + ' échouée :', error);
    alert('Erreur ' + label + ' : ' + error.message);
  }
}

function signInWithGoogle() {
  return signInWithProvider(new firebase.auth.GoogleAuthProvider(), 'Google');
}

function signInWithGitHub() {
  return signInWithProvider(new firebase.auth.GithubAuthProvider(), 'GitHub');
}

async function signUp(email, password, passwordConfirm) {
  const msgBox = document.getElementById('auth-message');

  if (password !== passwordConfirm) {
    msgBox.textContent = '❌ Les mots de passe ne correspondent pas';
    msgBox.style.color = '#f85149';
    return;
  }
  if (password.length < 6) {
    msgBox.textContent = '❌ Le mot de passe doit contenir au moins 6 caractères';
    msgBox.style.color = '#f85149';
    return;
  }

  try {
    msgBox.textContent = '⏳ Création du compte...';
    msgBox.style.color = '#58a6ff';

    const result = await auth.createUserWithEmailAndPassword(email, password);

    // merge:true → ne jamais écraser la progression créée par initProgressForUser
    await db.collection('users').doc(result.user.uid).set({
      email: email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    msgBox.textContent = '✅ Compte créé ! Bienvenue.';
    msgBox.style.color = '#3fb950';
    // La redirection vers l'accueil est gérée par onAuthStateChanged
  } catch (error) {
    msgBox.textContent = '❌ ' + (error.message || 'Erreur lors de la création du compte');
    msgBox.style.color = '#f85149';
    console.error('Signup error:', error);
  }
}

async function logIn(email, password) {
  const msgBox = document.getElementById('auth-message');
  try {
    msgBox.textContent = '⏳ Connexion...';
    msgBox.style.color = '#58a6ff';
    await auth.signInWithEmailAndPassword(email, password);
    msgBox.textContent = '✅ Connecté !';
    msgBox.style.color = '#3fb950';
  } catch (error) {
    msgBox.textContent = '❌ ' + (error.message || 'Erreur de connexion');
    msgBox.style.color = '#f85149';
    console.error('Login error:', error);
  }
}

async function logOut() {
  try {
    await auth.signOut();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// ============================================================
// SWITCH BETWEEN LOGIN & SIGNUP FORMS
// ============================================================
function switchAuthMode(mode) {
  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  const loginTab = document.getElementById('auth-tab-login');
  const signupTab = document.getElementById('auth-tab-signup');

  const isLogin = mode === 'login';
  loginForm.style.display = isLogin ? 'block' : 'none';
  signupForm.style.display = isLogin ? 'none' : 'block';
  loginTab.classList.toggle('active', isLogin);
  signupTab.classList.toggle('active', !isLogin);
  loginTab.style.borderBottomColor = isLogin ? '#58a6ff' : 'transparent';
  signupTab.style.borderBottomColor = isLogin ? 'transparent' : '#58a6ff';
}