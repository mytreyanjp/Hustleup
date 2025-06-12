
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, DocumentData, collection, query, where, onSnapshot, QuerySnapshot, Timestamp, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { auth, db, firebaseInitializationDetails } from '@/config/firebase';
import { Loader2 } from 'lucide-react';
import type { ChatMetadata } from '@/types/chat';
import type { Notification, PushSubscriptionJSON } from '@/types/notifications';

type UserRole = 'student' | 'client' | 'admin' | null;

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
  
  companyName?: string;
  website?: string;
  companyDescription?: string;
  personalEmail?: string; 
  personalPhone?: string; 

  following?: string[]; 
  followersCount?: number; 
  
  blockedUserIds?: string[]; 
  readReceiptsEnabled?: boolean; 
  isBanned?: boolean; 
  pushSubscriptions?: PushSubscriptionJSON[]; // For storing browser push subscriptions
}

interface FirebaseContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  role: UserRole;
  refreshUserProfile: () => Promise<void>;
  totalUnreadChats: number;
  clientUnreadNotificationCount: number;
  generalUnreadNotificationsCount: number; 
  firebaseActuallyInitialized: boolean;
  initializationError: string | null;
  isNotificationsEnabledOnDevice: boolean;
  requestNotificationPermission: () => Promise<boolean>;
  disableNotificationsOnDevice: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

interface GigForNotificationCount {
  id: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: { studentId: string; status?: 'pending' | 'accepted' | 'rejected' }[];
  studentPaymentRequestPending?: boolean; 
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
  const [generalUnreadNotificationsCount, setGeneralUnreadNotificationsCount] = useState(0);
  const [isNotificationsEnabledOnDevice, setIsNotificationsEnabledOnDevice] = useState(false);

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
            readReceiptsEnabled: docSnap.data().readReceiptsEnabled === undefined ? true : docSnap.data().readReceiptsEnabled,
            isBanned: docSnap.data().isBanned || false, 
            pushSubscriptions: docSnap.data().pushSubscriptions || [],
          } as UserProfile;
          setUserProfile(profileData);
          if (profileData.role === 'student' || profileData.role === 'client' || profileData.role === 'admin') {
            setRole(profileData.role);
          } else {
            setRole(null);
          }
          // Check if current device has an active subscription
          const currentSubscription = await navigator.serviceWorker?.ready.then(reg => reg.pushManager.getSubscription());
          if (currentSubscription) {
            const currentEndpoint = currentSubscription.toJSON().endpoint;
            setIsNotificationsEnabledOnDevice(profileData.pushSubscriptions?.some(sub => sub.endpoint === currentEndpoint) || false);
          } else {
            setIsNotificationsEnabledOnDevice(false);
          }

        } else {
          const basicProfile: UserProfile = {
            uid: currentUser.uid, email: currentUser.email, role: null, 
            bookmarkedGigIds: [], averageRating: 0, totalRatings: 0,
            following: [], followersCount: 0, personalEmail: '', personalPhone: '',
            blockedUserIds: [], readReceiptsEnabled: true, isBanned: false, pushSubscriptions: [],
          };
          setUserProfile(basicProfile);
          setRole(null);
          setIsNotificationsEnabledOnDevice(false);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        setUserProfile({
          uid: currentUser.uid, email: currentUser.email, role: null,
          bookmarkedGigIds: [], averageRating: 0, totalRatings: 0,
          following: [], followersCount: 0, personalEmail: '', personalPhone: '',
          blockedUserIds: [], readReceiptsEnabled: true, isBanned: false, pushSubscriptions: [],
        });
        setRole(null);
        setIsNotificationsEnabledOnDevice(false);
      }
    } else {
      setUserProfile(null);
      setRole(null);
      setIsNotificationsEnabledOnDevice(false);
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
        specificErrorMessage = `CRITICAL: Firebase environment variables are missing or not loaded. Details: ${firebaseInitializationDetails.errorMessage}`;
      } else if (firebaseInitializationDetails.didCoreServicesFail) {
        specificErrorMessage = `Firebase core services failed to initialize. Original error: ${firebaseInitializationDetails.errorMessage}`;
      }
      setInitializationErrorState(specificErrorMessage);
      setFirebaseActuallyInitializedState(false);
      setLoading(false); setUser(null); setUserProfile(null); setRole(null);
      return;
    }

    setFirebaseActuallyInitializedState(true);
    setInitializationErrorState(null); 

    if (auth) {
      unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        await fetchUserProfile(currentUser);
        setLoading(false);
      }, (error) => {
        setInitializationErrorState(`Firebase Auth error: ${error.message}`);
        setUser(null); setUserProfile(null); setRole(null); setLoading(false);
      });
    } else {
      const authErrorMessage = "Firebase context: Auth service is unexpectedly null after successful initialization check.";
      setInitializationErrorState(authErrorMessage);
      setFirebaseActuallyInitializedState(false); 
      setLoading(false);
    }
    return () => { if (unsubscribeAuth) unsubscribeAuth(); };
  }, [fetchUserProfile]); 

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const requestNotificationPermission = async (): Promise<boolean> => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Browser does not support push notifications.');
      return false;
    }
    if (!user || !db) {
      console.warn('User not logged in or DB not available for push subscription.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.info('Notification permission not granted.');
        setIsNotificationsEnabledOnDevice(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      
      if (existingSubscription) {
        console.log('User already subscribed:', existingSubscription.endpoint);
        // Ensure this existing subscription is stored in Firestore
        const subJSON = existingSubscription.toJSON() as PushSubscriptionJSON;
        if (userProfile && !userProfile.pushSubscriptions?.some(s => s.endpoint === subJSON.endpoint)) {
          const userDocRef = doc(db, 'users', user.uid);
          await updateDoc(userDocRef, {
            pushSubscriptions: arrayUnion(subJSON)
          });
          await refreshUserProfile(); // Refresh profile to include new sub
        }
        setIsNotificationsEnabledOnDevice(true);
        return true;
      }
      
      // IMPORTANT: Replace with your actual VAPID public key
      const vapidPublicKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidPublicKey) {
        console.error('VAPID public key is not defined. Cannot subscribe for push notifications.');
        // Inform the user appropriately, maybe via a toast.
        alert("Push notification setup is incomplete on the server (missing VAPID key). Please contact support.");
        return false;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subscriptionJSON = subscription.toJSON() as PushSubscriptionJSON;
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        pushSubscriptions: arrayUnion(subscriptionJSON)
      });
      
      setIsNotificationsEnabledOnDevice(true);
      await refreshUserProfile(); // Refresh profile to include new sub
      console.log('User subscribed for push notifications:', subscriptionJSON.endpoint);
      return true;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      setIsNotificationsEnabledOnDevice(false);
      return false;
    }
  };

  const disableNotificationsOnDevice = async (): Promise<void> => {
    if (!('serviceWorker' in navigator) || !user || !db) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const subJSON = subscription.toJSON() as PushSubscriptionJSON;
        await subscription.unsubscribe();
        console.log('User unsubscribed from this device.');
        
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
          pushSubscriptions: arrayRemove(subJSON)
        });
        setIsNotificationsEnabledOnDevice(false);
        await refreshUserProfile(); // Refresh profile to remove sub
      }
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
    }
  };


  useEffect(() => {
    // General notifications count
    if (!user || !db) { setGeneralUnreadNotificationsCount(0); return; }
    const notificationsQuery = query( collection(db, 'notifications'), where('recipientUserId', '==', user.uid), where('isRead', '==', false) );
    const unsubGeneral = onSnapshot(notificationsQuery, (snapshot) => { setGeneralUnreadNotificationsCount(snapshot.size); },
      (error) => { console.error("Error fetching general unread notifications count:", error); setGeneralUnreadNotificationsCount(0); });
    // Chat unread count
    if (!user || !db) { setTotalUnreadChats(0); return; }
    const chatsQuery = query( collection(db, 'chats'), where('participants', 'array-contains', user.uid) );
    const unsubChats = onSnapshot(chatsQuery, (querySnapshot: QuerySnapshot<DocumentData>) => {
      let unreadCount = 0;
      querySnapshot.forEach((docSnap) => {
        const chat = docSnap.data() as ChatMetadata;
        if ( chat.lastMessageSenderId && chat.lastMessageSenderId !== user.uid && (!chat.lastMessageReadBy || !chat.lastMessageReadBy.includes(user.uid)) ) {
          unreadCount++;
        }
      });
      setTotalUnreadChats(unreadCount);
    }, (error) => { console.error("Error fetching chat list for unread count:", error); setTotalUnreadChats(0); });
    // Client specific notification count
    let unsubClient: (() => void) | null = null;
    if (user && role === 'client' && db) {
      const clientGigsQuery = query(collection(db, "gigs"), where("clientId", "==", user.uid), where("status", "==", "open"));
      unsubClient = onSnapshot(clientGigsQuery, (querySnapshot) => {
        let pendingCount = 0;
        querySnapshot.forEach((docSnap) => {
          const gig = docSnap.data() as GigForNotificationCount;
          if (gig.applicants) gig.applicants.forEach(app => { if (!app.status || app.status === 'pending') pendingCount++; });
          if (gig.studentPaymentRequestPending) pendingCount++;
        });
        setClientUnreadNotificationCount(pendingCount);
      }, (error) => { console.error("Error fetching client gig notifications:", error); setClientUnreadNotificationCount(0); });
    } else {
      setClientUnreadNotificationCount(0); 
    }
    return () => { unsubGeneral(); unsubChats(); if (unsubClient) unsubClient(); };
  }, [user, role]);


  const value = { 
    user, userProfile, loading, role, refreshUserProfile, 
    totalUnreadChats, clientUnreadNotificationCount, generalUnreadNotificationsCount, 
    firebaseActuallyInitialized: firebaseActuallyInitializedState, 
    initializationError: initializationErrorState,
    isNotificationsEnabledOnDevice, requestNotificationPermission, disableNotificationsOnDevice,
  };

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
