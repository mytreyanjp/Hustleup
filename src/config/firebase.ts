
import { initializeApp, getApps, getApp, FirebaseOptions, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider } from "firebase/auth"; // Import GoogleAuthProvider
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getDatabase, Database } from "firebase/database"; // If using Realtime DB for chat
import { getStorage, FirebaseStorage } from "firebase/storage";

// --- User Provided Configuration ---
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyCAW-Fm9vI1P5SwA7Zhfuf426A6l8Zrwp0",
  authDomain: "hustleup-ntp15.firebaseapp.com",
  projectId: "hustleup-ntp15",
  storageBucket: "hustleup-ntp15.appspot.com",
  messagingSenderId: "992524001569",
  appId: "1:992524001569:web:58e8b945cfb34000f41e60"
};
// --- End User Provided Configuration ---

const isConfigValid = (config: FirebaseOptions): boolean => {
    return !!(config.apiKey && config.authDomain && config.projectId && config.appId);
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let realtimeDb: Database | null = null;
let storage: FirebaseStorage | null = null;
let googleAuthProvider: GoogleAuthProvider | null = null; // Declare GoogleAuthProvider

try {
    if (isConfigValid(firebaseConfig)) {
        if (!getApps().length) {
            app = initializeApp(firebaseConfig);
            console.log("Firebase initialized successfully with provided config.");
        } else {
            app = getApp();
             console.log("Firebase app already initialized.");
        }
        auth = getAuth(app);
        db = getFirestore(app);
        functions = getFunctions(app);
        storage = getStorage(app);
        googleAuthProvider = new GoogleAuthProvider(); // Initialize GoogleAuthProvider
    } else {
        if (typeof window !== 'undefined') {
            console.error("Firebase configuration is incomplete or invalid. Firebase services will not be available.");
        }
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
    app = null;
    auth = null;
    db = null;
    functions = null;
    realtimeDb = null;
    storage = null;
    googleAuthProvider = null;
}

export { app, auth, db, functions, realtimeDb, storage, googleAuthProvider, firebaseConfig, isConfigValid };
