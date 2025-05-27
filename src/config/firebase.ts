
import { initializeApp, getApps, getApp, FirebaseOptions, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider, OAuthProvider, GithubAuthProvider } from "firebase/auth"; // Import GoogleAuthProvider, OAuthProvider, GithubAuthProvider
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getDatabase, Database } from "firebase/database"; // If using Realtime DB for chat
import { getStorage, FirebaseStorage } from "firebase/storage";

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
  if (typeof window !== 'undefined') {
    const errorMessage = `Missing Firebase configuration environment variables: ${missingEnvVars.join(', ')}. Please ensure they are set in your .env.local file and the Next.js development server is restarted.`;
    console.error(errorMessage);
  }
} else {
  try {
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
    googleAuthProvider = new GoogleAuthProvider();
    appleAuthProvider = new OAuthProvider('apple.com');
    githubAuthProvider = new GithubAuthProvider();

  } catch (error: any) {
    console.error("Firebase initialization error:", error.message, error.code);
    // Set all to null if initialization fails
    app = null;
    auth = null;
    db = null;
    functions = null;
    realtimeDb = null;
    storage = null;
    googleAuthProvider = null;
    appleAuthProvider = null;
    githubAuthProvider = null;
  }
}

const isConfigValid = missingEnvVars.length === 0 && app !== null;


export { app, auth, db, functions, realtimeDb, storage, googleAuthProvider, appleAuthProvider, githubAuthProvider, firebaseConfig, isConfigValid };
