
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, DocumentData, collection, query, where, onSnapshot, QuerySnapshot, Timestamp } from 'firebase/firestore';
import { auth, db, firebaseInitializationDetails } from '@/config/firebase'; // Import firebaseInitializationDetails
import { Loader2 } from 'lucide-react';
import type { ChatMetadata } from '@/types/chat';

type UserRole = 'student' | 'client' | null;

export interface UserProfile extends DocumentData {
  uid: string;
  email: string | null;
  role: UserRole;
  username?: string;
  profilePictureUrl?: string;
  bio?: string;
  skills?: string[];
  portfolioLinks?: string[];
  bookmarkedGigIds?: string[];
  averageRating?: number;
  totalRatings?: number;
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
            role: null,
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
        specificErrorMessage = `Firebase core services (App/Auth/Firestore/Storage) failed to initialize. This might be due to invalid values in your .env.local or a network issue. Details: ${firebaseInitializationDetails.errorMessage}`;
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
      console.error("Firebase context: Auth service is unexpectedly null after successful initialization check.");
      setInitializationError("Failed to initialize Firebase Auth service after initial checks passed.");
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
      console.log("Unsubscribing from chat list for unread count.");
      unsubscribeChats();
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
        <div className="text-center text-destructive-foreground bg-destructive p-6 rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-semibold mb-2">Configuration Error</h2>
          <p className="text-sm whitespace-pre-wrap">{initializationError}</p>
          {firebaseInitializationDetails.areEnvVarsMissing && (
            <p className="text-xs mt-4">
              <strong>Action Required:</strong> Check your <code>.env.local</code> file in the project root. Ensure all <code>NEXT_PUBLIC_FIREBASE_...</code> variables are correctly set. Then, <strong>restart your Next.js development server.</strong>
            </p>
          )}
        </div>
      </div>
    );
  }

   if (!loading && isClient && (!auth || !db) && !initializationError && firebaseActuallyInitialized) {
     return (
       <div className="fixed inset-0 flex items-center justify-center bg-background/90 z-[999] p-4">
         <div className="text-center text-destructive-foreground bg-destructive p-6 rounded-lg shadow-lg max-w-md">
            <h2 className="text-xl font-semibold mb-2">Runtime Error</h2>
            <p className="text-sm">
              Core Firebase services (Auth/Firestore) became unavailable after initial setup. This is unexpected.
            </p>
           <p className="text-xs mt-4">Please try refreshing the page or check your network connection.</p>
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
