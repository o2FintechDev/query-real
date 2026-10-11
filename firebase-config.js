/* ============================================================
   FIREBASE CONFIGURATION & AUTHENTICATION
   Mode dégradé : si Firebase ne se charge pas, l'app reste
   utilisable en local (localStorage) sans page de connexion.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyDDTAjRqa6ehzg5VfXshsHG8Ew14H119Wc",
  authDomain: "queryreal-88900.firebaseapp.com",
  projectId: "queryreal-88900",
  storageBucket: "queryreal-88900.firebasestorage.app",
  messagingSenderId: "660115641040",
  appId: "1:660115641040:web:c859eba688df22a0c8c4d5"
};

let auth = null;
let db = null;
let currentUser = null;

try {
  if (typeof firebase === 'undefined') {
    throw new Error('SDK Firebase non chargé (CDN bloqué ou lent ?)');
  }
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
} catch (e) {
  console.warn('⚠️ Firebase indisponible, mode local uniquement :', e.message);
}

if (auth) {
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
      console.log('✅ User logged in:', user.email);
      showPage('home');
      syncProgressFromFirestore().then(updateLevelsPageUI);
    } else {
      console.log('🔐 No user logged in');
      showPage('auth');
    }
  });
} else {
  // Pas de Firebase : on va directement à l'accueil, progression locale
  document.addEventListener('DOMContentLoaded', () => showPage('home'));
}

// ============================================================
// AUTHENTICATION FUNCTIONS
// ============================================================
async function signInWithGoogle() {
  if (!auth) return alert('Connexion indisponible pour le moment.');
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (error) {
    console.error('❌ Google sign-in failed:', error);
    alert('Erreur Google: ' + error.message);
  }
}

async function signInWithGitHub() {
  if (!auth) return alert('Connexion indisponible pour le moment.');
  try {
    await auth.signInWithPopup(new firebase.auth.GithubAuthProvider());
  } catch (error) {
    console.error('❌ GitHub sign-in failed:', error);
    alert('Erreur GitHub: ' + error.message);
  }
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

    await db.collection('users').doc(result.user.uid).set({
      email: email,
      createdAt: new Date(),
      progress: {
        beginner:     { challengeIndex: 0, completed: [], answers: [] },
        intermediate: { challengeIndex: 0, completed: [], answers: [] },
        advanced:     { challengeIndex: 0, completed: [], answers: [] },
        expert:       { challengeIndex: 0, completed: [], answers: [] },
        mega:         { challengeIndex: 0, completed: [], answers: [] }
      }
    });

    msgBox.textContent = '✅ Compte créé ! Bienvenue.';
    msgBox.style.color = '#3fb950';
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
  if (!auth) return showPage('home');
  try {
    await auth.signOut();
    currentUser = null;
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
  loginTab.style.borderBottomColor = isLogin ? '#58a6ff' : 'transparent';
  signupTab.style.borderBottomColor = isLogin ? 'transparent' : '#58a6ff';
}