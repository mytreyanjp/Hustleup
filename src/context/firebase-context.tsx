
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, DocumentData, collection, query, where, onSnapshot, QuerySnapshot, Timestamp, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { auth, db, firebaseInitializationDetails, firebaseConfig } from '@/config/firebase'; // Added firebaseConfig for SW
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
  bio?: string; 
  skills?: string[]; 
  portfolioLinks?: string[]; 
  bookmarkedGigIds?: string[]; 
  averageRating?: number; 
  totalRatings?: number; 
  
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
  pushSubscriptions?: PushSubscriptionJSON[];
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
  const [internalProviderError, setInternalProviderError] = useState<string | null>(null);
  const [totalUnreadChats, setTotalUnreadChats] = useState(0);
  const [clientUnreadNotificationCount, setClientUnreadNotificationCount] = useState(0);
  const [generalUnreadNotificationsCount, setGeneralUnreadNotificationsCount] = useState(0);
  const [isNotificationsEnabledOnDevice, setIsNotificationsEnabledOnDevice] = useState(false);

  const fetchUserProfile = useCallback(async (currentUser: FirebaseUser | null) => {
    if (!db) {
      console.error("FirebaseProvider: Firestore (db) is null in fetchUserProfile. This indicates a critical Firebase initialization issue.");
      setUserProfile(null);
      setRole(null);
      setInternalProviderError("Critical: Firestore service became unavailable after initial load. Check Firebase setup.");
      setIsNotificationsEnabledOnDevice(false);
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
          if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && navigator.serviceWorker.controller) {
            const currentSubscription = await navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription());
            if (currentSubscription) {
              const currentEndpoint = currentSubscription.toJSON().endpoint;
              setIsNotificationsEnabledOnDevice(profileData.pushSubscriptions?.some(sub => sub.endpoint === currentEndpoint) || false);
            } else {
              setIsNotificationsEnabledOnDevice(false);
            }
          } else {
             setIsNotificationsEnabledOnDevice(false);
          }
        } else {
          const basicProfile: UserProfile = { uid: currentUser.uid, email: currentUser.email, role: null, bookmarkedGigIds: [], averageRating: 0, totalRatings: 0, following: [], followersCount: 0, personalEmail: '', personalPhone: '', blockedUserIds: [], readReceiptsEnabled: true, isBanned: false, pushSubscriptions: [] };
          setUserProfile(basicProfile);
          setRole(null);
          setIsNotificationsEnabledOnDevice(false);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        setInternalProviderError(`Error fetching profile: ${(error as Error).message}`);
        setUserProfile({ uid: currentUser.uid, email: currentUser.email, role: null, bookmarkedGigIds: [], averageRating: 0, totalRatings: 0, following: [], followersCount: 0, personalEmail: '', personalPhone: '', blockedUserIds: [], readReceiptsEnabled: true, isBanned: false, pushSubscriptions: []});
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

    try {
      if (!firebaseInitializationDetails.isSuccessfullyInitialized) {
        let specificErrorMessage = firebaseInitializationDetails.errorMessage || "An unknown Firebase initialization error occurred.";
        if (firebaseInitializationDetails.areEnvVarsMissing) {
          specificErrorMessage = `CRITICAL: Firebase environment variables are missing or not loaded. Details: ${firebaseInitializationDetails.errorMessage}`;
        } else if (firebaseInitializationDetails.didCoreServicesFail) {
          specificErrorMessage = `Firebase core services failed to initialize. Original error: ${firebaseInitializationDetails.errorMessage}`;
        }
        setInitializationErrorState(specificErrorMessage);
        setInternalProviderError(null); // Clear provider error if it's an init error
        setFirebaseActuallyInitializedState(false);
        setLoading(false); setUser(null); setUserProfile(null); setRole(null);
        return;
      }

      setFirebaseActuallyInitializedState(true);
      setInitializationErrorState(null);
      setInternalProviderError(null); 

      if (!auth) {
        const authErrorMessage = "FirebaseProvider: Auth service is unexpectedly null after successful Firebase initialization. This indicates a critical issue.";
        console.error(authErrorMessage);
        setInitializationErrorState(authErrorMessage); 
        setFirebaseActuallyInitializedState(false);
        setLoading(false); setUser(null); setUserProfile(null); setRole(null);
        return;
      }
      if (!db) {
        const dbErrorMessage = "FirebaseProvider: Firestore (db) service is unexpectedly null after successful Firebase initialization. This indicates a critical issue.";
        console.error(dbErrorMessage);
        setInitializationErrorState(dbErrorMessage);
        setFirebaseActuallyInitializedState(false);
        setLoading(false); setUser(null); setUserProfile(null); setRole(null);
        return;
      }

      unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        try { 
          setUser(currentUser);
          await fetchUserProfile(currentUser);
        } catch (authStateError: any) {
          console.error("Error during onAuthStateChanged or fetchUserProfile:", authStateError);
          setInternalProviderError(`Error processing user session: ${authStateError.message}`);
          setUser(null); setUserProfile(null); setRole(null);
        } finally {
          setLoading(false);
        }
      }, (error) => {
        console.error("Firebase Auth onAuthStateChanged error listener triggered:", error);
        setInitializationErrorState(`Firebase Auth error: ${error.message}`);
        setUser(null); setUserProfile(null); setRole(null); setLoading(false);
      });

    } catch (providerSetupError: any) {
      console.error("Critical error during FirebaseProvider setup:", providerSetupError);
      setInternalProviderError(`Provider setup failed: ${providerSetupError.message}`);
      setFirebaseActuallyInitializedState(false);
      setLoading(false);
    }

    return () => { if (unsubscribeAuth) unsubscribeAuth(); };
  }, [fetchUserProfile]); 

  const urlBase64ToUint8Array = (base64String: string) => {
    if (typeof window === 'undefined') return new Uint8Array(0);
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
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Browser does not support push notifications or required APIs are not available.');
      return false;
    }
    if (!user || !db) {
      console.warn('User not logged in or DB not available for push subscription.');
      return false;
    }
    if (!navigator.serviceWorker.controller) {
      console.warn('Service worker is not active/controlling the page. Push notifications cannot be set up.');
      // Optionally, try to register it if you have a robust registration elsewhere,
      // or prompt user to refresh after service worker activation.
      // For now, just inform and fail.
      alert("Push notifications require an active service worker. Please try refreshing the page, or ensure your browser isn't blocking service workers for this site.");
      return false;
    }


    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.info('Notification permission not granted by user.');
        setIsNotificationsEnabledOnDevice(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      
      const vapidPublicKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidPublicKey) {
        console.error('VAPID public key is not defined. Cannot subscribe for push notifications.');
        alert("Push notification setup is incomplete on the server (missing VAPID key). Please contact support.");
        return false;
      }
      
      // If already subscribed with the current VAPID key, ensure it's stored
      if (existingSubscription) {
        const currentKey = existingSubscription.options.applicationServerKey ?
            btoa(String.fromCharCode(...new Uint8Array(existingSubscription.options.applicationServerKey)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null;
        const newVapidKeyB64 = vapidPublicKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        if (currentKey === newVapidKeyB64) {
            console.log('User already subscribed with current VAPID key:', existingSubscription.endpoint);
            const subJSON = existingSubscription.toJSON() as PushSubscriptionJSON;
            if (userProfile && !userProfile.pushSubscriptions?.some(s => s.endpoint === subJSON.endpoint)) {
              const userDocRef = doc(db, 'users', user.uid);
              await updateDoc(userDocRef, { pushSubscriptions: arrayUnion(subJSON) });
              await refreshUserProfile();
            }
            setIsNotificationsEnabledOnDevice(true);
            return true;
        } else {
            console.log('Existing subscription found with a different VAPID key. Unsubscribing and re-subscribing.');
            await existingSubscription.unsubscribe();
        }
      }
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subscriptionJSON = subscription.toJSON() as PushSubscriptionJSON;
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { pushSubscriptions: arrayUnion(subscriptionJSON) });
      
      setIsNotificationsEnabledOnDevice(true);
      await refreshUserProfile();
      console.log('User subscribed for push notifications:', subscriptionJSON.endpoint);
      return true;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      setIsNotificationsEnabledOnDevice(false);
      return false;
    }
  };

  const disableNotificationsOnDevice = async (): Promise<void> => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !user || !db) return;
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
        await refreshUserProfile();
      }
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
    }
  };

  useEffect(() => {
    if (!user || !db) { setGeneralUnreadNotificationsCount(0); return; }
    const notificationsQuery = query( collection(db, 'notifications'), where('recipientUserId', '==', user.uid), where('isRead', '==', false) );
    const unsubGeneral = onSnapshot(notificationsQuery, (snapshot) => { setGeneralUnreadNotificationsCount(snapshot.size); },
      (error) => { console.error("Error fetching general unread notifications count:", error); setGeneralUnreadNotificationsCount(0); });
    
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
    initializationError: initializationErrorState || internalProviderError,
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

    