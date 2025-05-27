
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, DocumentData, collection, query, where, onSnapshot, QuerySnapshot, Timestamp } from 'firebase/firestore';
import { auth, db, isConfigValid } from '@/config/firebase'; // Import isConfigValid
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
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [totalUnreadChats, setTotalUnreadChats] = useState(0);

  const fetchUserProfile = useCallback(async (currentUser: FirebaseUser | null) => {
    if (!db) {
      console.warn("Firestore (db) not initialized, skipping profile fetch.");
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

    if (!isConfigValid) {
      console.error("Firebase Context: Firebase configuration is invalid due to missing environment variables.");
      setInitializationError("Firebase configuration is invalid. Required environment variables are missing. Please check your .env.local file and restart the development server.");
      setFirebaseInitialized(false);
      setLoading(false);
      setUser(null);
      setUserProfile(null);
      setRole(null);
      return;
    }

    // If isConfigValid is true, then auth and db should be initialized.
    setFirebaseInitialized(true);
    setInitializationError(null); // Clear any previous errors

    if (auth) { // Check if auth is available after config validation
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
      // This case should ideally not be hit if isConfigValid is true and auth initializes
      console.error("Firebase context: Auth service is null despite config appearing valid.");
      setInitializationError("Failed to initialize Firebase Auth service. Check configuration.");
      setFirebaseInitialized(false);
      setLoading(false);
    }
    
    return () => {
      if (unsubscribeAuth) {
        console.log("Unsubscribing from auth state changes.");
        unsubscribeAuth();
      }
    };
  }, [fetchUserProfile, isConfigValid]); // Added isConfigValid to dependency array

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

  if (!firebaseInitialized && initializationError && isClient) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/90 z-[999] p-4">
        <div className="text-center text-destructive-foreground bg-destructive p-6 rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-semibold mb-2">Configuration Error</h2>
          <p className="text-sm">{initializationError}</p>
          <p className="text-xs mt-4">Please ensure Firebase is configured correctly (check <code>.env.local</code>) and restart the application.</p>
        </div>
      </div>
    );
  }

  // Fallback error if services are somehow null after loading and no specific initializationError was caught by the !isConfigValid check
   if (!loading && isClient && (!auth || !db) && !initializationError) {
     return (
       <div className="fixed inset-0 flex items-center justify-center bg-background/90 z-[999] p-4">
         <div className="text-center text-destructive-foreground bg-destructive p-6 rounded-lg shadow-lg max-w-md">
            <h2 className="text-xl font-semibold mb-2">Configuration Error</h2>
            <p className="text-sm">
              There seems to be an issue with the Firebase services initialization. Please check the environment variables (<code>.env.local</code>) and ensure they are correct. Restart the development server after making changes.
            </p>
           <p className="text-xs mt-4">Core Firebase services (Auth/Firestore) are not available.</p>
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

    