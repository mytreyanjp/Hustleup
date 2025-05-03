"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, DocumentData } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
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

   const fetchUserProfile = useCallback(async (currentUser: FirebaseUser | null) => {
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
            // Set a basic profile - user might be mid-signup or data deleted
           setUserProfile({ uid: currentUser.uid, email: currentUser.email, role: null });
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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("Auth state changed. Current user:", currentUser?.uid || 'None');
      setUser(currentUser);
      await fetchUserProfile(currentUser); // Fetch profile on auth change
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
        console.log("Unsubscribing from auth state changes.");
        unsubscribe();
    }
  }, [fetchUserProfile]); // Depend on fetchUserProfile


   // Show a global loading indicator while auth state is initially resolving
   if (loading && typeof window !== 'undefined') {
     return (
       <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[999]">
         <Loader2 className="h-10 w-10 animate-spin text-primary" />
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

