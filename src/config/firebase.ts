
import { initializeApp, getApps, getApp, FirebaseOptions, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider, OAuthProvider, GithubAuthProvider } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
// import { getDatabase, Database } from "firebase/database"; // Only if using Realtime DB
import { getStorage, FirebaseStorage } from "firebase/storage";

// ========================================================================================
// IMPORTANT: Firebase Configuration from Environment Variables
// ========================================================================================
// This application loads its Firebase configuration from environment variables.
// These variables MUST be prefixed with NEXT_PUBLIC_ to be exposed to the browser.
//
// 1. Create a file named `.env.local` in the ROOT of your project
//    (the same directory as your `package.json` file).
//
// 2. Add the following lines to your `.env.local` file, replacing
//    `YOUR_ACTUAL_VALUE` with the values from your Firebase project settings:
//
//    NEXT_PUBLIC_FIREBASE_API_KEY="YOUR_ACTUAL_API_KEY"
//    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="YOUR_ACTUAL_AUTH_DOMAIN"
//    NEXT_PUBLIC_FIREBASE_PROJECT_ID="YOUR_ACTUAL_PROJECT_ID"
//    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="YOUR_ACTUAL_STORAGE_BUCKET"
//    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="YOUR_ACTUAL_MESSAGING_SENDER_ID"
//    NEXT_PUBLIC_FIREBASE_APP_ID="YOUR_ACTUAL_APP_ID"
//
// 3. CRITICAL: After creating or modifying the `.env.local` file,
//    you MUST COMPLETELY STOP your Next.js development server and then RESTART it.
//    (e.g., `Ctrl+C` in the terminal, then `npm run dev` or `yarn dev`).
//    Hot-reloading WILL NOT load new environment variables.
// ========================================================================================

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// For diagnostics, this object will be part of the error message
const currentConfigForDiagnostics = {
  apiKey: firebaseConfig.apiKey || "UNDEFINED_OR_EMPTY",
  authDomain: firebaseConfig.authDomain || "UNDEFINED_OR_EMPTY",
  projectId: firebaseConfig.projectId || "UNDEFINED_OR_EMPTY",
  storageBucket: firebaseConfig.storageBucket || "UNDEFINED_OR_EMPTY",
  messagingSenderId: firebaseConfig.messagingSenderId || "UNDEFINED_OR_EMPTY",
  appId: firebaseConfig.appId || "UNDEFINED_OR_EMPTY",
};

// Define which keys in firebaseConfig are essential
const essentialConfigKeys: (keyof FirebaseOptions)[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

// Check if any of the essential values in the firebaseConfig object are missing or empty strings
const missingOrEmptyConfigValues = essentialConfigKeys.filter(key => {
  const value = firebaseConfig[key];
  return typeof value !== 'string' || value.trim() === '';
});

// Map these keys back to their corresponding environment variable names for a clearer error message
const envVarEquivalents: Record<string, string> = {
    apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
    authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
};
const missingEnvVarNames = missingOrEmptyConfigValues.map(key => envVarEquivalents[key] || `CONFIG_KEY_${key.toUpperCase()}`);


export let firebaseInitializationDetails: {
  isSuccessfullyInitialized: boolean;
  errorMessage: string | null;
  areEnvVarsMissing: boolean; // True if essential config values are missing/empty
  didCoreServicesFail: boolean; // True if Firebase services like auth, db fail to init
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
// let realtimeDb: Database | null = null; // Only if using Realtime DB
let storage: FirebaseStorage | null = null;
let googleAuthProvider: GoogleAuthProvider | null = null;
let appleAuthProvider: OAuthProvider | null = null;
let githubAuthProvider: GithubAuthProvider | null = null;


if (missingOrEmptyConfigValues.length > 0) {
  firebaseInitializationDetails.areEnvVarsMissing = true;
  const msg = `Firebase Config Error: Essential Firebase configuration values are missing or empty. Please ensure all NEXT_PUBLIC_FIREBASE_ prefixed variables are correctly set in your .env.local file (root directory) and the Next.js server is RESTARTED.\nMissing or empty values for keys corresponding to: ${missingEnvVarNames.join(', ')}\nValues as read into config: ${JSON.stringify(currentConfigForDiagnostics, null, 2)}`;
  firebaseInitializationDetails.errorMessage = msg;
  if (typeof window !== 'undefined') { // Only log on client-side, server logs are handled by Next.js
    console.error("Firebase Config Error (Values Missing/Empty in Config Object):", msg);
  }
} else {
  firebaseInitializationDetails.areEnvVarsMissing = false; // Explicitly set
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig); // Use the firebaseConfig object
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    db = getFirestore(app);
    // Only initialize functions if you intend to use them.
    // functions = getFunctions(app);
    storage = getStorage(app);
    googleAuthProvider = new GoogleAuthProvider();
    appleAuthProvider = new OAuthProvider('apple.com');
    githubAuthProvider = new GithubAuthProvider();


    if (app && auth && db && storage) { // Check core services
      firebaseInitializationDetails.isSuccessfullyInitialized = true;
      // The console.log that was here has been removed.
    } else {
      firebaseInitializationDetails.didCoreServicesFail = true;
      const missingServices = [];
      if (!app) missingServices.push("App");
      if (!auth) missingServices.push("Auth");
      if (!db) missingServices.push("Firestore (db)");
      if (!storage) missingServices.push("Storage");
      // Note: googleAuthProvider, etc., are helpers, not core services for this check
      const msg = `Core Firebase services (${missingServices.join('/') || 'unknown'}) did not initialize correctly despite config values appearing valid. This can happen if environment variables contain invalid values (e.g., incorrect API key format), or if there's a network issue preventing connection to Firebase services. Check console for specific errors from Firebase SDKs.`;
      firebaseInitializationDetails.errorMessage = msg;
      if (typeof window !== 'undefined') console.error("Firebase Config Error (Service Init Failure):", msg);
      // Nullify to prevent partial initialization issues
      app = null; auth = null; db = null; functions = null; storage = null;
      googleAuthProvider = null; appleAuthProvider = null; githubAuthProvider = null;
    }

  } catch (error: any) {
    firebaseInitializationDetails.didCoreServicesFail = true;
    const msg = `Firebase core services initialization failed: ${error.message} (Code: ${error.code}). This often indicates an issue with the Firebase project configuration values (e.g., an invalid API key, or a service like Firestore/Storage not being enabled in the Firebase console) or a network problem. Please verify your .env.local values and Firebase project settings.\nCurrently read config values: ${JSON.stringify(currentConfigForDiagnostics, null, 2)}`;
    firebaseInitializationDetails.errorMessage = msg;
    if (typeof window !== 'undefined') console.error("Firebase Config Error (Catch Block During Init):", msg);
    app = null; auth = null; db = null; functions = null; storage = null;
    googleAuthProvider = null; appleAuthProvider = null; githubAuthProvider = null;
  }
}

export { app, auth, db, functions, storage, googleAuthProvider, appleAuthProvider, githubAuthProvider, firebaseConfig };
    