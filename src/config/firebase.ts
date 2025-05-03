
import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getDatabase } from "firebase/database"; // If using Realtime DB for chat

// Validate essential environment variables
const requiredEnvVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0 && typeof window !== 'undefined') {
    // Throw error only on the client-side where Firebase is used
    // This prevents build errors if env vars are only available at runtime
    const errorMessage = `Missing Firebase configuration environment variables: ${missingEnvVars.join(', ')}. Please ensure they are set in your .env.local file and the Next.js development server is restarted.`;
    console.error(errorMessage);
    // Optionally throw an error to halt execution if config is absolutely required immediately
    // throw new Error(errorMessage);
}


// Your web app's Firebase configuration
// It's recommended to load these from environment variables
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId is optional
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  // databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, // Only if using Realtime DB
};

let app: ReturnType<typeof initializeApp>;
let auth: ReturnType<typeof getAuth>;
let db: ReturnType<typeof getFirestore>;
let functions: ReturnType<typeof getFunctions>;
// let realtimeDb: ReturnType<typeof getDatabase>; // Only if using Realtime DB


// Initialize Firebase only if config is valid (client-side check added earlier)
// This avoids trying to initialize with invalid config which causes errors.
if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);
    // realtimeDb = getDatabase(app); // Only if using Realtime DB
} else {
    // Handle the case where config is missing (e.g., show error message to user, provide dummy objects)
    // For now, we'll log an error. The client-side check above should catch this in development.
    console.error("Firebase configuration is invalid or missing. Firebase services will not be initialized.");
    // Provide dummy/null objects or throw error depending on desired behavior
    // Example with dummy objects (use with caution, might hide issues):
    // app = null as any; auth = null as any; db = null as any; functions = null as any;
}


export { app, auth, db, functions }; // Export realtimeDb if needed

