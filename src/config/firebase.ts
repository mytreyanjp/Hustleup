
import { initializeApp, getApps, getApp, FirebaseOptions, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getDatabase, Database } from "firebase/database"; // If using Realtime DB for chat

// Define the configuration structure
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
  // databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, // Optional (Realtime DB)
};

// Helper function to check if the config is valid
const isConfigValid = (config: FirebaseOptions): boolean => {
    return !!(config.apiKey && config.authDomain && config.projectId && config.storageBucket && config.messagingSenderId && config.appId);
};

// Client-side check for missing variables during development
if (typeof window !== 'undefined' && !isConfigValid(firebaseConfig)) {
    const requiredEnvVars = [
        'NEXT_PUBLIC_FIREBASE_API_KEY',
        'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
        'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
        'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
        'NEXT_PUBLIC_FIREBASE_APP_ID',
    ];
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    const errorMessage = `Missing Firebase configuration environment variables: ${missingEnvVars.join(', ')}. Please ensure they are set in your .env.local file and the Next.js development server is restarted.`;
    console.error(errorMessage);
    // You might want to throw an error or display a message to the user here
    // depending on how critical Firebase is at startup.
}

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
            console.log("Firebase initialized successfully.");
        } else {
            app = getApp();
             console.log("Firebase app already initialized.");
        }
        auth = getAuth(app);
        db = getFirestore(app);
        functions = getFunctions(app);
        // realtimeDb = getDatabase(app); // Uncomment if using Realtime DB
    } else {
        // Log error only if on client, as server might lack env vars during build
        if (typeof window !== 'undefined') {
            console.error("Firebase configuration is incomplete. Firebase services will not be available.");
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
export { isConfigValid }; // Export the validation function if needed elsewhere

// Example usage in another file:
// import { auth, db, isConfigValid } from '@/config/firebase';
//
// function MyComponent() {
//   useEffect(() => {
//     if (auth && db) {
//       // Use Firebase services
//       console.log("Firebase is configured and ready.");
//     } else {
//       // Handle the case where Firebase is not available
//       console.warn("Firebase services are not available.");
//       if (!isConfigValid({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, ... })) {
//         // Show message about missing config
//       }
//     }
//   }, []);
//   // ...
// }
