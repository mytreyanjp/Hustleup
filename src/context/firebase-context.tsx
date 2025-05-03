
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, DocumentData } from 'firebase/firestore';
import { auth, db, isConfigValid } from '@/config/firebase'; // Import db and auth directly
import { Skeleton } from '@/components/ui/skeleton'; // For loading state
import { Loader2 } from 'lucide-react';

type UserRole = 'student' | 'client' | null;

export interface UserProfile extends DocumentData {
  uid: string;
  email: string | null;
  role: UserRole;
  // Add other profile fields as needed (username, bio, skills, etc.)
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
  refreshUserProfile: () => Promise<void>; // Added refresh function
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(null);
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);


   const fetchUserProfile = useCallback(async (currentUser: FirebaseUser | null) => {
     // Ensure db is initialized before fetching
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
           setRole(profileData.role || null);
           console.log("User profile loaded:", profileData);
         } else {
           console.warn("No user profile found in Firestore for UID:", currentUser.uid);
           // Create a basic profile structure if none exists - Adjust roles as needed
           const basicProfile: UserProfile = { uid: currentUser.uid, email: currentUser.email, role: null }; // Default role might need adjustment
           setUserProfile(basicProfile);
           setRole(null);
         }
       } catch (error) {
         console.error("Error fetching user profile:", error);
          setUserProfile({ uid: currentUser.uid, email: currentUser.email, role: null }); // Fallback basic profile on error
          setRole(null);
       }
     } else {
       setUserProfile(null);
       setRole(null);
       console.log("No current user, profile cleared.");
     }
   }, []); // useCallback dependencies

   // Refresh function to be called manually when needed (e.g., after profile update)
   const refreshUserProfile = useCallback(async () => {
       if (user) {
           setLoading(true); // Show loading indicator during refresh
           await fetchUserProfile(user);
           setLoading(false);
       }
   }, [user, fetchUserProfile]);


   useEffect(() => {
        setLoading(true);
        let unsubscribe: (() => void) | null = null;

        if (auth && db) { // Check if services are initialized
            setFirebaseInitialized(true);
            setInitializationError(null); // Clear any previous error
            unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                console.log("Auth state changed. Current user:", currentUser?.uid || 'None');
                setUser(currentUser);
                await fetchUserProfile(currentUser); // Fetch profile on auth change
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
            // Firebase services failed to initialize or config was invalid
            console.error("Firebase auth or db is not initialized in context.");
            setFirebaseInitialized(false);
            // Check if the config itself was the issue (less likely with hardcoded values, but good practice)
            // We rely on the console error from firebase.ts for specifics
            setInitializationError("Failed to initialize Firebase services. Check configuration and console for details.");
            setLoading(false);
        }

        // Cleanup subscription on unmount
        return () => {
            if (unsubscribe) {
                console.log("Unsubscribing from auth state changes.");
                unsubscribe();
            }
        };
    }, [fetchUserProfile]); // Re-run if fetchUserProfile changes


   // Show a global loading indicator while auth state is initially resolving
   // Only render loader on the client after mount to avoid hydration issues
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

   // Show an error if Firebase couldn't initialize
   // Only render error on the client after mount
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


  const value = { user, userProfile, loading, role, refreshUserProfile };

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

