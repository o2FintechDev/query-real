/* ============================================================
   FIREBASE CONFIGURATION & AUTHENTICATION
   ============================================================
   Replace YOUR_* with values from Firebase Console
   Project Settings → Service Accounts → Web App Config
   ============================================================ */

  const firebaseConfig = {

    apiKey: "AIzaSyDDTAjRqa6ehzg5VfXshsHG8Ew14H119Wc",
    authDomain: "queryreal-88900.firebaseapp.com",
    projectId: "queryreal-88900",
    storageBucket: "queryreal-88900.firebasestorage.app",
    messagingSenderId: "660115641040",
    appId: "1:660115641040:web:c859eba688df22a0c8c4d5"
  };

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================
// AUTH STATE & USER MANAGEMENT
// ============================================================
let currentUser = null;

auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    // User is signed in
    console.log("✅ User logged in:", user.email);
    showPage('home'); // Show main app, not login
    syncProgressFromFirestore();
  } else {
    // User is signed out
    console.log("🔐 No user logged in");
    showPage('auth'); // Show login/signup page
  }
});

// ============================================================
// AUTHENTICATION FUNCTIONS
// ============================================================
async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    console.log('✅ Google sign-in success');
  } catch (error) {
    console.error('❌ Google sign-in failed:', error);
    alert('Erreur Google: ' + error.message);
  }
}

async function signInWithGitHub() {
  const provider = new firebase.auth.GithubAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    console.log('✅ GitHub sign-in success');
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
    
    // Initialize empty progress in Firestore
    await db.collection('users').doc(result.user.uid).set({
      email: email,
      createdAt: new Date(),
      progress: {
        beginner: { challengeIndex: 0, completed: [], answers: [] },
        intermediate: { challengeIndex: 0, completed: [], answers: [] },
        advanced: { challengeIndex: 0, completed: [], answers: [] },
        expert: { challengeIndex: 0, completed: [], answers: [] },
        mega: { challengeIndex: 0, completed: [], answers: [] }
      }
    });
    
    msgBox.textContent = '✅ Compte créé ! Bienvenue.';
    msgBox.style.color = '#3fb950';
    
    // Auto-redirect to home after 1s
    setTimeout(() => {
      showPage('home');
    }, 1000);
    
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
    currentUser = null;
    console.log('✅ Déconnecté');
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
  
  if (mode === 'login') {
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
    loginTab.style.borderBottomColor = '#58a6ff';
    signupTab.style.borderBottomColor = 'transparent';
  } else {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
    loginTab.style.borderBottomColor = 'transparent';
    signupTab.style.borderBottomColor = '#58a6ff';
  }
}