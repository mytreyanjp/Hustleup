
import { initializeApp, getApps, getApp, FirebaseOptions, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getDatabase, Database } from "firebase/database"; // If using Realtime DB for chat

// --- User Provided Configuration ---
// IMPORTANT: For production, move these values to a .env.local file
// and use process.env.NEXT_PUBLIC_FIREBASE_* variables instead.
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyCAW-Fm9vI1P5SwA7Zhfuf426A6l8Zrwp0", // process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "hustleup-ntp15.firebaseapp.com", // process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: "hustleup-ntp15", // process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: "hustleup-ntp15.appspot.com", // Corrected storage bucket domain // process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: "992524001569", // process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: "1:992524001569:web:58e8b945cfb34000f41e60" // process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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
        // This block might be less relevant now with hardcoded values, but kept for structure
        if (typeof window !== 'undefined') {
            console.error("Firebase configuration is incomplete or invalid (using hardcoded values). Firebase services will not be available.");
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
export { isConfigValid, firebaseConfig }; // Export config for context if needed

