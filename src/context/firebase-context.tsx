
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, DocumentData, collection, query, where, onSnapshot, QuerySnapshot, Timestamp } from 'firebase/firestore';
import { auth, db, firebaseInitializationDetails } from '@/config/firebase';
import { Loader2 } from 'lucide-react';
import type { ChatMetadata } from '@/types/chat';

type UserRole = 'student' | 'client' | null;

export interface UserProfile extends DocumentData {
  uid: string;
  email: string | null;
  role: UserRole;
  username?: string;
  profilePictureUrl?: string;
  bio?: string; // Student bio
  skills?: string[]; // Student skills
  portfolioLinks?: string[]; // Student portfolio links
  bookmarkedGigIds?: string[]; // Student bookmarked gigs
  averageRating?: number; // Student average rating
  totalRatings?: number; // Student total ratings
  // Client-specific fields
  companyName?: string;
  website?: string;
  companyDescription?: string; // Added for client's company description
}

interface FirebaseContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  role: UserRole;
  refreshUserProfile: () => Promise<void>;
  totalUnreadChats: number;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(null);
  const [firebaseActuallyInitialized, setFirebaseActuallyInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [totalUnreadChats, setTotalUnreadChats] = useState(0);

  const fetchUserProfile = useCallback(async (currentUser: FirebaseUser | null) => {
    if (!db) {
      console.warn("Firestore (db) not initialized, skipping profile fetch. This is expected if Firebase setup failed.");
      setUserProfile(null);
      setRole(null);
      return;
    }

    if (currentUser) {
      const userDocRef = doc(db, 'users', currentUser.uid);
      try {
        console.log("Fetching profile for UID:", currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const profileData = {
            uid: currentUser.uid,
            email: currentUser.email,
            ...docSnap.data(),
            bookmarkedGigIds: docSnap.data().bookmarkedGigIds || [],
            averageRating: docSnap.data().averageRating || 0,
            totalRatings: docSnap.data().totalRatings || 0,
          } as UserProfile;
          setUserProfile(profileData);
          if (profileData.role === 'student' || profileData.role === 'client') {
            setRole(profileData.role);
          } else {
            setRole(null);
            console.warn(`User profile for UID ${currentUser.uid} found, but 'role' field is missing, invalid, or not 'student'/'client'. Actual role value: '${profileData.role}'. Setting role to null.`);
          }
          console.log("User profile loaded:", profileData);
        } else {
          console.warn("No user profile found in Firestore for UID:", currentUser.uid);
          const basicProfile: UserProfile = {
            uid: currentUser.uid,
            email: currentUser.email,
            role: null, // This will prompt for profile completion
            bookmarkedGigIds: [],
            averageRating: 0,
            totalRatings: 0,
          };
          setUserProfile(basicProfile);
          setRole(null);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        setUserProfile({
          uid: currentUser.uid,
          email: currentUser.email,
          role: null,
          bookmarkedGigIds: [],
          averageRating: 0,
          totalRatings: 0,
        });
        setRole(null);
      }
    } else {
      setUserProfile(null);
      setRole(null);
      console.log("No current user, profile cleared.");
    }
  }, []);

  const refreshUserProfile = useCallback(async () => {
    if (user) {
      setLoading(true);
      await fetchUserProfile(user);
      setLoading(false);
    }
  }, [user, fetchUserProfile]);

  useEffect(() => {
    setLoading(true);
    let unsubscribeAuth: (() => void) | null = null;

    if (!firebaseInitializationDetails.isSuccessfullyInitialized) {
      let specificErrorMessage = firebaseInitializationDetails.errorMessage || "An unknown Firebase initialization error occurred.";
      if (firebaseInitializationDetails.areEnvVarsMissing) {
        console.error("Firebase Context: Firebase initialization failed due to missing environment variables.", firebaseInitializationDetails.errorMessage);
        specificErrorMessage = `CRITICAL: Firebase environment variables are missing or not loaded. Please ensure your '.env.local' file in the project root is correctly set up with all NEXT_PUBLIC_FIREBASE_ prefixed variables and then RESTART your Next.js development server. Details: ${firebaseInitializationDetails.errorMessage}`;
      } else if (firebaseInitializationDetails.didCoreServicesFail) {
        console.error("Firebase Context: Firebase core services failed to initialize.", firebaseInitializationDetails.errorMessage);
        specificErrorMessage = `Firebase core services (App/Auth/Firestore/Storage) failed to initialize. This can happen if environment variables are present but contain invalid values (e.g., incorrect API key format), or if there's a network issue preventing connection to Firebase services. Original error: ${firebaseInitializationDetails.errorMessage}`;
      }
      setInitializationError(specificErrorMessage);
      setFirebaseActuallyInitialized(false);
      setLoading(false);
      setUser(null);
      setUserProfile(null);
      setRole(null);
      return;
    }

    setFirebaseActuallyInitialized(true);
    setInitializationError(null); 

    if (auth) {
      unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        console.log("Auth state changed. Current user:", currentUser?.uid || 'None');
        setUser(currentUser);
        await fetchUserProfile(currentUser);
        setLoading(false);
      }, (error) => {
        console.error("Auth state error:", error);
        setInitializationError(`Firebase Auth error: ${error.message}`);
        setUser(null);
        setUserProfile(null);
        setRole(null);
        setLoading(false);
      });
    } else {
      const authErrorMessage = "Firebase context: Auth service is unexpectedly null after successful initialization check.";
      console.error(authErrorMessage);
      setInitializationError(authErrorMessage);
      setFirebaseActuallyInitialized(false); 
      setLoading(false);
    }

    return () => {
      if (unsubscribeAuth) {
        console.log("Unsubscribing from auth state changes.");
        unsubscribeAuth();
      }
    };
  }, [fetchUserProfile]); 

  useEffect(() => {
    if (!user || !db) {
      setTotalUnreadChats(0);
      return;
    }

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribeChats = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
      let unreadCount = 0;
      querySnapshot.forEach((docSnap) => {
        const chat = docSnap.data() as ChatMetadata;
        if (
          chat.lastMessageSenderId &&
          chat.lastMessageSenderId !== user.uid &&
          (!chat.lastMessageReadBy || !chat.lastMessageReadBy.includes(user.uid))
        ) {
          unreadCount++;
        }
      });
      console.log(`Total unread chats for ${user.uid}: ${unreadCount}`);
      setTotalUnreadChats(unreadCount);
    }, (error) => {
      console.error("Error fetching chat list for unread count:", error);
      setTotalUnreadChats(0);
    });

    return () => {
      if (typeof unsubscribeChats === 'function') {
        console.log("Unsubscribing from chat list for unread count.");
        unsubscribeChats();
      }
    };
  }, [user]);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);


  if (loading && isClient) { 
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[999]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!firebaseActuallyInitialized && initializationError && isClient) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/90 z-[999] p-4">
        <div className="text-center text-destructive-foreground bg-destructive p-6 rounded-lg shadow-lg max-w-lg">
          <h2 className="text-xl font-semibold mb-2">Firebase Configuration Error!</h2>
          <p className="text-sm whitespace-pre-wrap mb-3">{initializationError}</p>
          
          {firebaseInitializationDetails.areEnvVarsMissing && (
            <div className="text-left text-xs mt-4 bg-destructive-foreground/10 p-3 rounded-md text-destructive-foreground/80">
              <p className="font-bold mb-1 text-destructive-foreground">CRITICAL: To fix this, please meticulously check the following:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li><strong><code>.env.local</code> File Location:</strong> Ensure this file is located in the <strong>absolute root directory</strong> of your project (the same folder as <code>package.json</code> and <code>next.config.ts</code>). It should NOT be inside the `src` folder.</li>
                <li><strong>Variable Naming:</strong> All Firebase environment variables inside the <code>.env.local</code> file <strong>MUST</strong> start with the prefix <code>NEXT_PUBLIC_</code> (e.g., <code>NEXT_PUBLIC_FIREBASE_API_KEY="your_key"</code>). Check for typos.</li>
                <li><strong>Correct Values:</strong> Verify the API keys and other identifiers are copied exactly from your Firebase project settings. Ensure there are no extra quotes or spaces unless they are part of the actual value.</li>
                <li><strong>SERVER RESTART:</strong> After creating or modifying the <code>.env.local</code> file, you <strong>MUST COMPLETELY STOP</strong> your Next.js development server (e.g., press <code>Ctrl+C</code> in the terminal) and then <strong>RESTART</strong> it (e.g., run <code>npm run dev</code> or <code>yarn dev</code> again). Changes to <code>.env.local</code> are only picked up by Next.js when the server starts. Hot-reloading WILL NOT load new environment variables.</li>
                <li><strong>No Comments in `.env.local` (Usually):</strong> While some systems support comments (e.g., starting with `#`), it's safest to avoid them in `.env.local` files to prevent parsing issues, unless you are sure your specific setup handles them.</li>
              </ol>
              <p className="mt-2">If the problem persists after carefully checking all these steps, ensure there are no hidden characters or formatting issues in your <code>.env.local</code> file.</p>
            </div>
          )}

           {!firebaseInitializationDetails.areEnvVarsMissing && firebaseInitializationDetails.didCoreServicesFail && (
             <div className="text-left text-xs mt-4 bg-destructive-foreground/10 p-3 rounded-md text-destructive-foreground/80">
               <p className="font-bold mb-1 text-destructive-foreground">Action Required - Please double-check:</p>
               <ol className="list-decimal list-inside space-y-1">
                 <li><strong>Firebase Project Settings:</strong> Verify your API key, Auth Domain, Project ID, etc., in your <code>.env.local</code> file match *exactly* with the values from your Firebase project console.</li>
                 <li><strong>Firebase Services Enabled:</strong> Ensure Authentication, Firestore Database, and Storage are enabled in your Firebase project.</li>
                 <li><strong>Network Connectivity:</strong> Check your internet connection.</li>
                 <li><strong>Correct `storageBucket` URL:</strong> Verify the `storageBucket` in `.env.local` matches the one from your Firebase project settings (e.g., `your-project-id.appspot.com` vs `your-project-id.firebasestorage.app`). The correct one for new projects is usually `your-project-id.firebasestorage.app`.</li>
               </ol>
             </div>
           )}
        </div>
      </div>
    );
  }

  const value = { user, userProfile, loading, role, refreshUserProfile, totalUnreadChats };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
    
