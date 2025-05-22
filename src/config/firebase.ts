
import { initializeApp, getApps, getApp, FirebaseOptions, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getDatabase, Database } from "firebase/database"; // If using Realtime DB for chat

// --- User Provided Configuration ---
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyCAW-Fm9vI1P5SwA7Zhfuf426A6l8Zrwp0",
  authDomain: "hustleup-ntp15.firebaseapp.com",
  projectId: "hustleup-ntp15",
  storageBucket: "hustleup-ntp15.firebasestorage.app", // Corrected storage bucket
  messagingSenderId: "992524001569",
  appId: "1:992524001569:web:58e8b945cfb34000f41e60"
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
  // databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, // Optional (Realtime DB)
};
// --- End User Provided Configuration ---


// Helper function to check if the config is valid
const isConfigValid = (config: FirebaseOptions): boolean => {
    // Basic check for essential fields
    return !!(config.apiKey && config.authDomain && config.projectId && config.appId);
};

// Initialize Firebase App (conditionally)
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let realtimeDb: Database | null = null;

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
        // realtimeDb = getDatabase(app); // Uncomment if using Realtime DB
    } else {
        if (typeof window !== 'undefined') {
            console.error("Firebase configuration is incomplete or invalid. Firebase services will not be available.");
        }
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
    // Set services to null on error
    app = null;
    auth = null;
    db = null;
    functions = null;
    realtimeDb = null;
}

// Export potentially null services. Components using them should handle null checks.
export { app, auth, db, functions, realtimeDb };
export { isConfigValid, firebaseConfig };
