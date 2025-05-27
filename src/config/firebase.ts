
import { initializeApp, getApps, getApp, FirebaseOptions, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider, OAuthProvider, GithubAuthProvider } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getDatabase, Database } from "firebase/database";
import { getStorage, FirebaseStorage } from "firebase/storage";

// IMPORTANT: Firebase configuration is loaded from environment variables.
// Ensure you have a .env.local file in the ROOT of your project
// (the same directory as package.json) with the following content,
// replacing YOUR_ACTUAL_VALUE with the values from your Firebase project settings:
//
// NEXT_PUBLIC_FIREBASE_API_KEY="YOUR_ACTUAL_API_KEY"
// NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="YOUR_ACTUAL_AUTH_DOMAIN"
// NEXT_PUBLIC_FIREBASE_PROJECT_ID="YOUR_ACTUAL_PROJECT_ID"
// NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="YOUR_ACTUAL_STORAGE_BUCKET"
// NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="YOUR_ACTUAL_MESSAGING_SENDER_ID"
// NEXT_PUBLIC_FIREBASE_APP_ID="YOUR_ACTUAL_APP_ID"
//
// After creating or modifying .env.local, YOU MUST RESTART your Next.js development server.

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

export let firebaseInitializationDetails: {
  isSuccessfullyInitialized: boolean;
  errorMessage: string | null;
  areEnvVarsMissing: boolean;
  didCoreServicesFail: boolean;
} = {
  isSuccessfullyInitialized: false,
  errorMessage: null,
  areEnvVarsMissing: false,
  didCoreServicesFail: false,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let realtimeDb: Database | null = null;
let storage: FirebaseStorage | null = null;
let googleAuthProvider: GoogleAuthProvider | null = null;
let appleAuthProvider: OAuthProvider | null = null;
let githubAuthProvider: GithubAuthProvider | null = null;

if (missingEnvVars.length > 0) {
  firebaseInitializationDetails.areEnvVarsMissing = true;
  const msg = `Missing Firebase configuration environment variables: ${missingEnvVars.join(', ')}. Please ensure they are set in your .env.local file and the Next.js development server is restarted.`;
  firebaseInitializationDetails.errorMessage = msg;
  if (typeof window !== 'undefined') { // Only log on client-side, server logs are handled by Next.js
    console.error("Firebase Config Error (Missing Vars):", msg);
  }
} else {
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    db = getFirestore(app);
    // Only initialize functions if you intend to use them, to avoid unnecessary setup/errors.
    // functions = getFunctions(app); 
    storage = getStorage(app);
    googleAuthProvider = new GoogleAuthProvider();
    appleAuthProvider = new OAuthProvider('apple.com');
    githubAuthProvider = new GithubAuthProvider();

    if (app && auth && db && storage) { // Ensure core services used by the app are initialized
      firebaseInitializationDetails.isSuccessfullyInitialized = true;
      console.log("Firebase initialized successfully.");
    } else {
      firebaseInitializationDetails.didCoreServicesFail = true;
      const missingServices = [];
      if (!app) missingServices.push("App");
      if (!auth) missingServices.push("Auth");
      if (!db) missingServices.push("Firestore (db)");
      if (!storage) missingServices.push("Storage");
      const msg = `Core Firebase services (${missingServices.join('/') || 'unknown'}) did not initialize correctly. This can happen if environment variables are present but contain invalid values (e.g., incorrect API key format), or if there's a network issue preventing connection to Firebase services.`;
      firebaseInitializationDetails.errorMessage = msg;
      if (typeof window !== 'undefined') console.error("Firebase Config Error (Service Init Failure):", msg);
      app = null; auth = null; db = null; functions = null; realtimeDb = null; storage = null;
      googleAuthProvider = null; appleAuthProvider = null; githubAuthProvider = null;
    }
  } catch (error: any) {
    firebaseInitializationDetails.didCoreServicesFail = true;
    const msg = `Firebase core services initialization failed: ${error.message} (Code: ${error.code}). This often indicates an issue with the Firebase project configuration (e.g., an invalid API key, or a service like Firestore/Storage not being enabled in the Firebase console) or a network problem. Please verify your .env.local values and Firebase project settings.`;
    firebaseInitializationDetails.errorMessage = msg;
    if (typeof window !== 'undefined') console.error("Firebase Config Error (Catch Block):", msg);
    app = null; auth = null; db = null; functions = null; realtimeDb = null; storage = null;
    googleAuthProvider = null; appleAuthProvider = null; githubAuthProvider = null;
  }
}

// Conditional export for Functions if you enable it
// export { app, auth, db, functions, realtimeDb, storage, googleAuthProvider, appleAuthProvider, githubAuthProvider, firebaseConfig };
export { app, auth, db, functions, storage, googleAuthProvider, appleAuthProvider, githubAuthProvider, firebaseConfig };
