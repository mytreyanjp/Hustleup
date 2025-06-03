
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
  companyDescription?: string;
  personalEmail?: string; // For sharing in chat
  personalPhone?: string; // For sharing in chat

  // Follower/Following system
  following?: string[]; // Array of UIDs this user is following
  followersCount?: number; // Number of users following this user
  
  blockedUserIds?: string[]; // Array of UIDs this user has blocked
}

interface FirebaseContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  role: UserRole;
  refreshUserProfile: () => Promise<void>;
  totalUnreadChats: number;
  clientUnreadNotificationCount: number;
  firebaseActuallyInitialized: boolean;
  initializationError: string | null;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

interface GigForNotificationCount {
  id: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: { studentId: string; status?: 'pending' | 'accepted' | 'rejected' }[];
}

export const FirebaseProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(null);
  const [firebaseActuallyInitializedState, setFirebaseActuallyInitializedState] = useState(false);
  const [initializationErrorState, setInitializationErrorState] = useState<string | null>(null);
  const [totalUnreadChats, setTotalUnreadChats] = useState(0);
  const [clientUnreadNotificationCount, setClientUnreadNotificationCount] = useState(0);

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
            following: docSnap.data().following || [],
            followersCount: docSnap.data().followersCount || 0,
            personalEmail: docSnap.data().personalEmail || '',
            personalPhone: docSnap.data().personalPhone || '',
            blockedUserIds: docSnap.data().blockedUserIds || [],
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
            following: [],
            followersCount: 0,
            personalEmail: '',
            personalPhone: '',
            blockedUserIds: [],
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
          following: [],
          followersCount: 0,
          personalEmail: '',
          personalPhone: '',
          blockedUserIds: [],
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
      setInitializationErrorState(specificErrorMessage);
      setFirebaseActuallyInitializedState(false);
      setLoading(false);
      setUser(null);
      setUserProfile(null);
      setRole(null);
      return;
    }

    setFirebaseActuallyInitializedState(true);
    setInitializationErrorState(null); 

    if (auth) {
      unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        console.log("Auth state changed. Current user:", currentUser?.uid || 'None');
        setUser(currentUser);
        await fetchUserProfile(currentUser);
        setLoading(false);
      }, (error) => {
        console.error("Auth state error:", error);
        setInitializationErrorState(`Firebase Auth error: ${error.message}`);
        setUser(null);
        setUserProfile(null);
        setRole(null);
        setLoading(false);
      });
    } else {
      const authErrorMessage = "Firebase context: Auth service is unexpectedly null after successful initialization check.";
      console.error(authErrorMessage);
      setInitializationErrorState(authErrorMessage);
      setFirebaseActuallyInitializedState(false); 
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

  // Effect for client notification count
  useEffect(() => {
    if (user && role === 'client' && db) {
      const gigsRef = collection(db, "gigs");
      const q = query(gigsRef, where("clientId", "==", user.uid), where("status", "==", "open"));
      
      const unsubscribeClientNotifications = onSnapshot(q, (querySnapshot) => {
        let pendingApplicants = 0;
        querySnapshot.forEach((doc) => {
          const gig = doc.data() as GigForNotificationCount;
          if (gig.applicants) {
            gig.applicants.forEach(applicant => {
              if (!applicant.status || applicant.status === 'pending') {
                pendingApplicants++;
              }
            });
          }
        });
        setClientUnreadNotificationCount(pendingApplicants);
      }, (error) => {
        console.error("Error fetching client gig notifications:", error);
        setClientUnreadNotificationCount(0);
      });

      return () => unsubscribeClientNotifications();
    } else {
      setClientUnreadNotificationCount(0); // Reset if not client or not logged in
    }
  }, [user, role]);


  const value = { user, userProfile, loading, role, refreshUserProfile, totalUnreadChats, clientUnreadNotificationCount, firebaseActuallyInitialized: firebaseActuallyInitializedState, initializationError: initializationErrorState };

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
    

    
