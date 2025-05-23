
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, DocumentData, collection, query, where, onSnapshot, QuerySnapshot, Timestamp } from 'firebase/firestore'; // Added collection, query, where, onSnapshot, QuerySnapshot, Timestamp
import { auth, db, isConfigValid, firebaseConfig } from '@/config/firebase';
import { Loader2 } from 'lucide-react';
import type { ChatMetadata } from '@/types/chat'; // Import ChatMetadata

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
}

interface FirebaseContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  role: UserRole;
  refreshUserProfile: () => Promise<void>;
  totalUnreadChats: number; // Added for unread chat count
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(null);
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [totalUnreadChats, setTotalUnreadChats] = useState(0); // State for unread chat count


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
           const profileData = { uid: currentUser.uid, email: currentUser.email, ...docSnap.data() } as UserProfile;
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
           const basicProfile: UserProfile = { uid: currentUser.uid, email: currentUser.email, role: null };
           setUserProfile(basicProfile);
           setRole(null);
         }
       } catch (error) {
         console.error("Error fetching user profile:", error);
          setUserProfile({ uid: currentUser.uid, email: currentUser.email, role: null });
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

        if (auth && db) {
            setFirebaseInitialized(true);
            setInitializationError(null);
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
            console.error("Firebase auth or db is not initialized in context.");
            setFirebaseInitialized(false);
            setInitializationError("Failed to initialize Firebase services. Check configuration and console for details.");
            setLoading(false);
        }
        return () => {
            if (unsubscribeAuth) {
                console.log("Unsubscribing from auth state changes.");
                unsubscribeAuth();
            }
        };
    }, [fetchUserProfile]);


    // Effect to listen for unread chat counts
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
    }, [user]); // Re-run when user logs in/out


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
                   <h2 className="text-xl font-semibold mb-2">Initialization Error</h2>
                   <p className="text-sm">{initializationError}</p>
                   <p className="text-xs mt-4">Please ensure Firebase is configured correctly and restart the application.</p>
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
