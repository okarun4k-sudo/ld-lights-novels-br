import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    getDoc, 
    setDoc,
    query, 
    orderBy,
    updateDoc,
    deleteDoc,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Configuração atualizada do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD9LDSyd2x2n4Dt6PIQJjLrAltDBWgT2Do",
    authDomain: "mensagem-2f134.firebaseapp.com",
    projectId: "mensagem-2f134",
    storageBucket: "mensagem-2f134.firebasestorage.app",
    messagingSenderId: "1001126917394",
    appId: "1:1001126917394:web:7069c87f494af89cf66fcb",
    measurementId: "G-EC2F3870LP"
};

// Inicializa o Firebase e o Analytics
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Inicializa os Serviços (Auth e Banco de Dados)
const auth = getAuth(app);
const db = getFirestore(app);

// Configura o Provedor do Google para o Login
const googleProvider = new GoogleAuthProvider();
// CORREÇÃO DO ERRO NO GMAIL: Força a seleção de conta para evitar bloqueios de popup silenciosos
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// Exporta tudo para ser usado no app.js
export { 
    auth, 
    db, 
    googleProvider, 
    signInWithPopup, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    getDoc, 
    setDoc,
    query, 
    orderBy,
    updateDoc,
    deleteDoc,
    where
};
