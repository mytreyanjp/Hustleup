
"use client";

import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Send, UserCircle, ArrowLeft, Paperclip, Image as ImageIconLucide, FileText as FileIcon, X, Smile, Link2, Share2 as ShareIcon, Info, Phone, Mail as MailIcon, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Search, Lock, Briefcase, AddressBook, Check, HelpCircle, ShieldAlert } from 'lucide-react'; 
import { Badge } from '@/components/ui/badge';
import { db, storage } from '@/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QuerySnapshot,
  writeBatch,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
// import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Media upload disabled
import { getChatId, cn } from '@/lib/utils';
import Link from 'next/link';
import { formatDistanceToNow, format, isToday, isYesterday, startOfDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import EmojiPicker, { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import { useTheme } from 'next-themes';
import type { ChatMessage, ChatMetadata } from '@/types/chat';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';


interface PendingGigShareData {
  gigId: string;
  gigTitle: string;
}

interface PendingProfileShareData {
  userId: string;
  username: string;
  profilePictureUrl?: string;
  userRole?: 'student' | 'client' | 'admin';
}


interface GigForChatContext {
    id: string;
    title: string;
    status: 'open' | 'in-progress' | 'completed' | 'closed';
    selectedStudentId?: string | null;
    clientId: string;
}


export default function ChatPage() {
  const { user, userProfile, loading: authLoading, totalUnreadChats } = useFirebase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { theme: appTheme } = useTheme();

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pendingGigShareData, setPendingGigShareData] = useState<PendingGigShareData | null>(null);
  const [pendingProfileShareData, setPendingProfileShareData] = useState<PendingProfileShareData | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [targetUserForNewChat, setTargetUserForNewChat] = useState<UserProfile | null>(null);
  const [currentGigForChat, setCurrentGigForChat] = useState<GigForChatContext | null>(null);
  // const [isAcceptingOrRejecting, setIsAcceptingOrRejecting] = useState(false); // 'pending_request' between non-admins is removed
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [transientChatOverride, setTransientChatOverride] = useState<ChatMetadata | null>(null);
  const [otherParticipantProfiles, setOtherParticipantProfiles] = useState<Record<string, UserProfile>>({});

  const [showWarnUserDialogInChat, setShowWarnUserDialogInChat] = useState(false);
  const [warningReasonForChat, setWarningReasonForChat] = useState('');
  const [isSubmittingWarningInChat, setIsSubmittingWarningInChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);


  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, isLoadingMessages]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [emojiPickerRef]);


  const getOrCreateChat = useCallback(async (targetUserId: string, targetUsernameFromParam: string, targetProfilePictureUrlFromParam?: string, gigIdForContext?: string): Promise<ChatMetadata | null> => {
    if (!user || !userProfile || !db) return null;

    if (userProfile.blockedUserIds?.includes(targetUserId)) {
        toast({ title: "Chat Blocked", description: "You have blocked this user. Unblock them to interact.", variant: "destructive" });
        router.push('/chat');
        return null;
    }
    
    let targetUserFullProfile: UserProfile | null = otherParticipantProfiles[targetUserId] || (targetUserForNewChat?.uid === targetUserId ? targetUserForNewChat : null);

    if (!targetUserFullProfile) {
        try {
            const targetUserDoc = await getDoc(doc(db, 'users', targetUserId));
            if (targetUserDoc.exists()) {
                targetUserFullProfile = { uid: targetUserDoc.id, ...targetUserDoc.data() } as UserProfile;
                setOtherParticipantProfiles(prev => ({ ...prev, [targetUserId]: targetUserFullProfile! }));
            } else {
                 toast({ title: "Chat Error", description: "Target user profile not found.", variant: "destructive"});
                 router.push('/chat');
                 return null;
            }
        } catch (fetchError) {
            console.error("Error fetching target user profile for chat:", fetchError);
            toast({ title: "Chat Error", description: "Could not load target user details.", variant: "destructive"});
            router.push('/chat');
            return null;
        }
    }

    if (targetUserFullProfile?.blockedUserIds?.includes(user.uid)) {
        toast({ title: "Cannot Chat", description: "This user has blocked you.", variant: "destructive" });
        router.push('/chat');
        return null;
    }

    const currentUserRole = userProfile.role;
    const targetUserRole = targetUserFullProfile.role;
    const targetUsername = targetUserFullProfile.username || targetUsernameFromParam;
    const targetProfilePictureUrl = targetUserFullProfile.profilePictureUrl || targetProfilePictureUrlFromParam;

    // Enforce new chat rules
    if (currentUserRole !== 'admin' && targetUserRole !== 'admin') {
        toast({ title: "Chat Disabled", description: "Direct user-to-user chats are not available. Please use the support page to contact admins if needed.", variant: "destructive" });
        router.push('/gigs/browse'); // Or a more appropriate page
        return null;
    }

    const chatId = getChatId(user.uid, targetUserId);
    const chatDocRef = doc(db, 'chats', chatId);

    try {
      const chatSnap = await getDoc(chatDocRef);
      
      if (chatSnap.exists()) { // Chat already exists
        let existingChatData = { ...chatSnap.data(), id: chatId } as ChatMetadata;
        let updateRequired = false;
        const updates: Partial<ChatMetadata> & {updatedAt?: any} = { updatedAt: serverTimestamp() };

        if (gigIdForContext && existingChatData.gigId !== gigIdForContext) {
            updates.gigId = gigIdForContext;
            updateRequired = true;
        }
        
        // If current user is student/client trying to access chat with admin
        if (currentUserRole !== 'admin' && targetUserRole === 'admin') {
            if (existingChatData.chatStatus !== 'pending_admin_response' && existingChatData.chatStatus !== 'accepted') {
                toast({ title: "Access Denied", description: "This chat is not active or accessible. Please request admin chat via the support page.", variant: "destructive" });
                router.push('/support');
                return null;
            }
        }
        // If current user is admin and the chat was pending their response
        else if (currentUserRole === 'admin' && existingChatData.chatStatus === 'pending_admin_response' && existingChatData.requestInitiatorId !== user.uid) {
            updates.chatStatus = 'accepted';
            updates.lastMessage = `Admin ${userProfile.username || 'Support'} has joined the chat.`;
            updates.lastMessageTimestamp = serverTimestamp();
            updates.lastMessageSenderId = 'system';
            updates.lastMessageReadBy = [user.uid];
            updateRequired = true;
            
            const messagesColRef = collection(chatDocRef, 'messages');
            addDoc(messagesColRef, {
                senderId: 'system',
                text: `Admin ${userProfile.username || 'Support'} has joined the chat.`,
                messageType: 'system_admin_reply_received',
                timestamp: serverTimestamp(),
            }).catch(console.error);
        }
        
        if (updateRequired) {
            await updateDoc(chatDocRef, updates);
            const clientSideUpdates = { ...updates };
            if (clientSideUpdates.updatedAt === serverTimestamp()) clientSideUpdates.updatedAt = Timestamp.now();
            if (clientSideUpdates.lastMessageTimestamp === serverTimestamp()) clientSideUpdates.lastMessageTimestamp = Timestamp.now();
            
            const updatedLocalChat: ChatMetadata = { ...existingChatData, ...clientSideUpdates, id: chatId };
            setChats(prev => prev.map(chat => chat.id === chatId ? updatedLocalChat : chat));
            setSelectedChatId(chatId);
            return updatedLocalChat;
        }
        
        setSelectedChatId(chatId);
        return { ...existingChatData, id: chatId };

      } else { // New chat
        if (currentUserRole !== 'admin') {
            // Students/Clients cannot create new chats with Admins directly here.
            // They must go through the support page which creates a 'pending_admin_response' request document.
            // Admins then "Start Chat" from their admin_chat_requests page, which would lead here with the admin as the initiator.
            toast({ title: "Cannot Initiate", description: "Please request admin chat via the support page.", variant: "destructive" });
            router.push('/support');
            return null;
        }

        // Only an admin can create a new chat record directly via this function
        const newChatData: ChatMetadata = {
          id: chatId,
          participants: [user.uid, targetUserId],
          participantUsernames: {
            [user.uid]: userProfile.username || user.email?.split('@')[0] || 'Me',
            [targetUserId]: targetUsername,
          },
          createdAt: serverTimestamp() as Timestamp, 
          updatedAt: serverTimestamp() as Timestamp, 
          participantProfilePictures: {},
          lastMessageReadBy: [user.uid], // Admin has "read" their own initiation
          chatStatus: 'accepted', // Admin initiated chats are auto-accepted
          lastMessage: 'Chat started by admin.',
          lastMessageSenderId: user.uid,
          lastMessageTimestamp: serverTimestamp() as Timestamp,
        };

        if (userProfile.profilePictureUrl) {
          newChatData.participantProfilePictures![user.uid] = userProfile.profilePictureUrl;
        }
        if (targetProfilePictureUrl) {
          newChatData.participantProfilePictures![targetUserId] = targetProfilePictureUrl;
        }
        if (gigIdForContext) newChatData.gigId = gigIdForContext;
        
        await setDoc(chatDocRef, newChatData);
        
        const localNewChatData: ChatMetadata = {
            ...newChatData,
            id: chatId,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            lastMessageTimestamp: Timestamp.now(),
        };
        setChats(prevChats => {
            if (prevChats.find(c => c.id === chatId)) {
                return prevChats.map(c => c.id === chatId ? localNewChatData : c);
            }
            return [localNewChatData, ...prevChats];
        });

        setSelectedChatId(chatId);
        return localNewChatData;
      }
    } catch (error) {
      console.error("Error getting or creating chat:", error);
      toast({ title: "Chat Error", description: "Could not start or find the chat.", variant: "destructive" });
      router.push('/chat');
      return null;
    }
  }, [user, userProfile, toast, router, setChats, otherParticipantProfiles, targetUserForNewChat]);


  useEffect(() => {
    if (authLoading || !user || !userProfile) return;

    const targetUserId = searchParams.get('userId');
    const shareGigId = searchParams.get('shareGigId');
    const shareGigTitle = searchParams.get('shareGigTitle');
    const gigIdForChatContext = searchParams.get('gigId');
    const preselectChatId = searchParams.get('chatId');

    const shareProfileUserId = searchParams.get('shareUserId');
    const shareProfileUsername = searchParams.get('shareUsername');
    const shareProfilePicUrl = searchParams.get('shareUserProfilePictureUrl');
    const shareProfileRole = searchParams.get('shareUserRole') as 'student' | 'client' | 'admin' | undefined;

    if (shareProfileUserId && userProfile.role === 'admin') { // Only admins can share profiles now effectively
      setPendingProfileShareData({
        userId: shareProfileUserId,
        username: decodeURIComponent(shareProfileUsername || 'User'),
        profilePictureUrl: shareProfilePicUrl ? decodeURIComponent(shareProfilePicUrl) : undefined,
        userRole: shareProfileRole,
      });
      setMessage(''); 
      toast({ title: "Profile Ready to Share", description: "Select a chat and send your message." });
      
      const chatTargetId = targetUserId || preselectChatId?.split('_').find(id => id !== user.uid) || null; 
      if (chatTargetId) {
           getDoc(doc(db, 'users', chatTargetId)).then(targetUserSnap => {
               if (targetUserSnap.exists()) {
                   const targetUserData = targetUserSnap.data() as UserProfile;
                   setTargetUserForNewChat(targetUserData);
                   setOtherParticipantProfiles(prev => ({ ...prev, [targetUserData.uid]: targetUserData }));
                   getOrCreateChat(chatTargetId, targetUserData.username || 'User', targetUserData.profilePictureUrl, undefined).then(newOrUpdatedChat => {
                       if (newOrUpdatedChat) setSelectedChatId(newOrUpdatedChat.id);
                   });
               }
           });
      }
      if (typeof window !== 'undefined') { 
        const currentUrl = new URL(window.location.href);
        ['shareUserId', 'shareUsername', 'shareUserProfilePictureUrl', 'shareUserRole'].forEach(param => currentUrl.searchParams.delete(param));
        if (targetUserId) currentUrl.searchParams.delete('userId'); 
        router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
      }
    } else if (shareGigId && shareGigTitle && userProfile.role === 'admin') { // Only admins can share gigs
      setPendingGigShareData({ gigId: shareGigId, gigTitle: decodeURIComponent(shareGigTitle) });
      setMessage('');
      toast({ title: "Gig Ready to Share", description: "Select a chat and send your message." });
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href);
        ['shareGigId', 'shareGigTitle'].forEach(param => currentUrl.searchParams.delete(param));
        router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
      }
    } else if (preselectChatId) {
        // Allow opening an existing chat by ID, getOrCreateChat will enforce rules
        getDoc(doc(db, 'chats', preselectChatId)).then(chatSnap => {
            if (chatSnap.exists()) {
                const chatData = chatSnap.data() as ChatMetadata;
                const otherParticipantId = chatData.participants.find(pId => pId !== user.uid);
                if (otherParticipantId) {
                    getDoc(doc(db, 'users', otherParticipantId)).then(otherUserSnap => {
                        if (otherUserSnap.exists()) {
                            const otherUserData = otherUserSnap.data() as UserProfile;
                            setTargetUserForNewChat(otherUserData);
                            setOtherParticipantProfiles(prev => ({ ...prev, [otherUserData.uid]: otherUserData}));
                            getOrCreateChat(otherParticipantId, otherUserData.username || 'User', otherUserData.profilePictureUrl, chatData.gigId).then(newOrUpdatedChat => {
                               if(newOrUpdatedChat) setSelectedChatId(newOrUpdatedChat.id);
                               else router.replace('/chat'); // if getOrCreateChat blocked it
                            });
                        } else {
                            router.replace('/chat');
                        }
                    });
                } else {
                     router.replace('/chat');
                }
            } else {
                 router.replace('/chat');
            }
        });
        if (searchParams.has('chatId') && typeof window !== 'undefined') {
             router.replace('/chat', { scroll: false });
        }
    } else if (targetUserId && user.uid !== targetUserId) {
      const fetchTargetUserAndProcessChat = async () => {
        if (!db) {
            toast({ title: "Database Error", description: "Firestore not available for chat.", variant: "destructive" });
            return;
        }
        const targetUserDocRef = doc(db, 'users', targetUserId);
        const targetUserSnap = await getDoc(targetUserDocRef);
        if (targetUserSnap.exists()) {
          const targetUserData = { uid: targetUserSnap.id, ...targetUserSnap.data() } as UserProfile;
          if (targetUserData.blockedUserIds?.includes(user.uid)) {
            toast({ title: "Cannot Chat", description: "This user has blocked you.", variant: "destructive" });
            router.replace('/chat');
            return;
          }
          setTargetUserForNewChat(targetUserData);
          setOtherParticipantProfiles(prev => ({ ...prev, [targetUserData.uid]: targetUserData }));
          const newOrUpdatedChat = await getOrCreateChat(targetUserId, targetUserData.username || 'User', targetUserData.profilePictureUrl, gigIdForChatContext || undefined);
          if (newOrUpdatedChat) {
            setSelectedChatId(newOrUpdatedChat.id);
          } else {
            // getOrCreateChat would have shown a toast and potentially redirected
            if (router.asPath.startsWith('/chat')) router.replace('/chat'); // Ensure clean URL if blocked
          }
        } else {
          console.error("Target user for chat not found.");
          toast({ title: "User Not Found", description: "The user you're trying to chat with doesn't exist.", variant: "destructive" });
          router.replace('/chat');
        }
        const paramsToRemove = ['userId', 'gigId', 'shareGigId', 'shareGigTitle', 'shareUserId', 'shareUsername', 'shareUserProfilePictureUrl', 'shareUserRole', 'chatId'];
        let currentUrl = new URL(window.location.href);
        let paramsChanged = false;
        paramsToRemove.forEach(param => {
          if (currentUrl.searchParams.has(param)) {
            currentUrl.searchParams.delete(param);
            paramsChanged = true;
          }
        });
        if (paramsChanged) {
            router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
        }
      };
      fetchTargetUserAndProcessChat();
    } else if (!shareGigId && !targetUserId && !preselectChatId && (searchParams.toString() !== '') && typeof window !== 'undefined') {
        router.replace('/chat', { scroll: false });
    }
  }, [searchParams, user, userProfile, authLoading, getOrCreateChat, router, toast]);


  useEffect(() => {
    if (!user || !db) {
      setIsLoadingChats(false);
      setChats([]);
      return;
    }
    setIsLoadingChats(true);
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
      let fetchedChats = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ChatMetadata[];

      if (userProfile && userProfile.blockedUserIds && userProfile.blockedUserIds.length > 0) {
        fetchedChats = fetchedChats.filter(chat => {
          const otherParticipantId = chat.participants.find(pId => pId !== user.uid);
          return !(otherParticipantId && userProfile.blockedUserIds?.includes(otherParticipantId));
        });
      }
      
      // Further filter chats based on the new rules: only show chats with admins, or if current user is admin
      if (userProfile?.role !== 'admin') {
        fetchedChats = fetchedChats.filter(chat => {
            const otherParticipantId = chat.participants.find(pId => pId !== user.uid);
            if (!otherParticipantId) return false;
            const otherParticipantProfile = otherParticipantProfiles[otherParticipantId]; // Check cache first
            if (otherParticipantProfile) return otherParticipantProfile.role === 'admin';
            // If not cached, this chat might be initially shown and then filtered out once profile loads or decided to fetch all participant profiles first
            return true; // Temporarily allow, will get filtered once profiles load or fetch all needed profiles initially
        });
      }

      setChats(fetchedChats);
      fetchedChats.forEach(async (chat) => {
        const otherId = chat.participants.find(pId => pId !== user.uid);
        if (otherId && !otherParticipantProfiles[otherId]) {
            const userDoc = await getDoc(doc(db, 'users', otherId));
            if (userDoc.exists()) {
                const fetchedOtherProfile = userDoc.data() as UserProfile;
                setOtherParticipantProfiles(prev => ({ ...prev, [otherId]: fetchedOtherProfile }));
                 // Re-filter chats if this loaded profile makes a chat invalid for non-admins
                if (userProfile?.role !== 'admin' && fetchedOtherProfile.role !== 'admin') {
                    setChats(prev => prev.filter(c => c.id !== chat.id));
                }
            }
        }
      });
      setIsLoadingChats(false);
    }, (error) => {
      console.error("Error fetching chat list:", error);
      toast({ title: "Chat List Error", description: "Could not load your conversations. This may be due to a missing Firestore index. Please check your Firebase console.", variant: "destructive" });
      setIsLoadingChats(false);
    });

    return () => unsubscribe();
  }, [user, userProfile, toast, db, otherParticipantProfiles]); 

  useEffect(() => {
    if (!selectedChatId || !user || !userProfile || !db) {
      setMessages([]);
      setCurrentGigForChat(null);
      return;
    }
    setIsLoadingMessages(true);
    const messagesQuery = query(
      collection(db, 'chats', selectedChatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribeMessages = onSnapshot(messagesQuery, (querySnapshot: QuerySnapshot<DocumentData>) => {
      const fetchedMessages = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ChatMessage[];
      setMessages(fetchedMessages);
      setIsLoadingMessages(false);

      const currentCommittedUserProfile = userProfile; 
      if (!user || !db || !currentCommittedUserProfile) {
          if(!user) console.warn("Message status update skipped: User not available at msg snapshot time.");
          if(!db) console.warn("Message status update skipped: DB not available at msg snapshot time.");
          if(!currentCommittedUserProfile) console.warn("Message status update skipped: User profile not available for receipt logic at msg snapshot time.");
          return;
      }

      const batch = writeBatch(db);
      let updatesMade = false;
      fetchedMessages.forEach(msg => {
        if (msg.senderId !== user.uid) {
          const msgRef = doc(db, 'chats', selectedChatId, 'messages', msg.id);
          let messageUpdates: Partial<ChatMessage> = {};
          if (!msg.deliveredToRecipientAt) {
            console.log(`Current user (${user.uid}) is marking message ${msg.id} (from ${msg.senderId}) as DELIVERED for chat ${selectedChatId}`);
            messageUpdates.deliveredToRecipientAt = Timestamp.now();
            updatesMade = true;
          }
          if (currentCommittedUserProfile.readReceiptsEnabled && !msg.readByRecipientAt) {
            console.log(`Current user (${user.uid}, receipts: ${currentCommittedUserProfile.readReceiptsEnabled}) is marking message ${msg.id} (from ${msg.senderId}) as READ for chat ${selectedChatId}`);
            messageUpdates.readByRecipientAt = Timestamp.now();
            updatesMade = true;
          }
          if (Object.keys(messageUpdates).length > 0) {
            batch.update(msgRef, messageUpdates);
          }
        }
      });
      if (updatesMade) {
        console.log(`Current user (${user.uid}) attempting to commit batch updates for chat ${selectedChatId}`);
        batch.commit()
          .then(() => console.log(`Current user (${user.uid}): Batch commit SUCCESS for chat ${selectedChatId} message status updates.`))
          .catch(err => console.error(`Error batch updating message statuses for chat ${selectedChatId} by user ${user.uid}:`, err));
      }

    }, (error) => {
      console.error(`Error fetching messages for chat ${selectedChatId}:`, error);
      toast({ title: "Message Error", description: "Could not load messages for this chat.", variant: "destructive" });
      setIsLoadingMessages(false);
    });

    const fetchGigContextForChat = async () => {
        if (!db) return;
        const chatDocRef = doc(db, 'chats', selectedChatId);
        const chatSnap = await getDoc(chatDocRef);
        if (chatSnap.exists()) {
            const chatData = chatSnap.data() as ChatMetadata;
            if (chatData.gigId) {
                const gigDocRef = doc(db, 'gigs', chatData.gigId);
                const gigSnap = await getDoc(gigDocRef);
                if (gigSnap.exists()) {
                    setCurrentGigForChat({ id: gigSnap.id, ...gigSnap.data() } as GigForChatContext);
                } else {
                    setCurrentGigForChat(null);
                }
            } else {
                 setCurrentGigForChat(null);
            }
        }
    };
    fetchGigContextForChat();


    const markChatAsRead = async () => {
      if (!db) return;
      const chatDocRef = doc(db, 'chats', selectedChatId);
      try {
        const chatSnap = await getDoc(chatDocRef);
        if (chatSnap.exists()) {
          const chatData = chatSnap.data() as ChatMetadata;
          if (
            chatData.lastMessageSenderId &&
            chatData.lastMessageSenderId !== user.uid &&
            (!chatData.lastMessageReadBy || !chatData.lastMessageReadBy.includes(user.uid))
          ) {
            await updateDoc(chatDocRef, {
              lastMessageReadBy: arrayUnion(user.uid),
            });
          }
        }
      } catch (error) {
        console.error("Error marking chat as read:", error);
      }
    };

    if (user && selectedChatId) {
      markChatAsRead();
    }

    return () => unsubscribeMessages();
  }, [selectedChatId, user, userProfile]);


  useEffect(() => {
    if (!authLoading && !user && typeof window !== 'undefined') {
       router.push('/auth/login?redirect=/chat');
    }
  }, [user, authLoading, router]);


  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setShowEmojiPicker(false);
    setMessage('');
    setTransientChatOverride(null); 
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prevMessage => prevMessage + emojiData.emoji);
  };

  const handleSendMessage = async (
    isRequestingDetails: boolean = false, // This logic might become obsolete with chat restrictions
    isSharingDetails: boolean = false, // This logic might become obsolete
    sharedDetails?: { email?: string, phone?: string }
    ) => {
    if (!selectedChatId || !user || !userProfile || !db ) {
        toast({ title: "Cannot Send", description: "Chat session is invalid.", variant: "destructive"});
        return;
    }

    let chatDetailsToUse = chats.find(c => c.id === selectedChatId);
    if (transientChatOverride && transientChatOverride.id === selectedChatId) {
        chatDetailsToUse = transientChatOverride;
    }
    const currentChatDetails = chatDetailsToUse;

    if (!currentChatDetails) {
        toast({ title: "Cannot Send", description: "Chat details not found or not yet loaded.", variant: "destructive"});
        return;
    }
    
    const otherParticipantId = currentChatDetails.participants.find(pId => pId !== user.uid);
    if (otherParticipantId && userProfile.blockedUserIds?.includes(otherParticipantId)) {
        toast({ title: "Cannot Send", description: "You have blocked this user. Unblock them to send messages.", variant: "destructive" });
        return;
    }

    const targetUserProfileSnap = otherParticipantId ? await getDoc(doc(db, 'users', otherParticipantId)) : null;
    const targetParticipantProfile = targetUserProfileSnap?.exists() ? targetUserProfileSnap.data() as UserProfile : otherParticipantProfiles[otherParticipantId!];

    if (targetParticipantProfile?.blockedUserIds?.includes(user.uid)) {
        toast({ title: "Cannot Send", description: "This user has blocked you.", variant: "destructive" });
        return;
    }

    // New rule enforcement before sending
    if (userProfile.role !== 'admin' && targetParticipantProfile?.role !== 'admin') {
      toast({ title: "Cannot Send", description: "Direct user-to-user chats are disabled.", variant: "destructive" });
      return;
    }
    if (userProfile.role !== 'admin' && targetParticipantProfile?.role === 'admin' && currentChatDetails.chatStatus !== 'accepted' && currentChatDetails.chatStatus !== 'pending_admin_response') {
      toast({ title: "Cannot Send", description: "Chat with admin is not active. Please use support page.", variant: "destructive" });
      return;
    }
    
    if (currentChatDetails.chatStatus === 'pending_admin_response' && currentChatDetails.requestInitiatorId === user.uid && messages.length > 0) {
         toast({ title: "Cannot Send", description: `Waiting for an admin to reply to your request.`, variant: "default"});
         return;
    }
    
    if (!message.trim() && !pendingGigShareData && !pendingProfileShareData && !isRequestingDetails && !isSharingDetails) {
        toast({ title: "Cannot Send", description: "Message is empty.", variant: "destructive"});
        return;
    }


    setIsSending(true);
    setShowEmojiPicker(false);

    const newMessageContent: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp: any } = {
      senderId: user.uid,
      timestamp: serverTimestamp(),
      deliveredToRecipientAt: null,
      readByRecipientAt: null,
    };

    let lastMessageText = '';
    
    // Personal detail sharing should only be possible if one party is an admin and the chat is active
    const canShareOrRequestPersonalDetails = userProfile.role === 'admin' || (targetParticipantProfile?.role === 'admin' && currentChatDetails.chatStatus === 'accepted');

    if (isRequestingDetails && canShareOrRequestPersonalDetails) {
        newMessageContent.isDetailShareRequest = true;
        newMessageContent.text = `${userProfile.username} has requested your contact details${currentGigForChat ? ` for the gig: ${currentGigForChat.title}` : ''}.`;
        lastMessageText = `${userProfile.username} requested contact details.`;
    } else if (isSharingDetails && sharedDetails && canShareOrRequestPersonalDetails) {
        newMessageContent.isDetailsShared = true;
        newMessageContent.sharedContactInfo = {
            email: sharedDetails.email,
            phone: sharedDetails.phone,
            note: "Here are my contact details as requested:"
        };
        newMessageContent.text = message.trim() || "Here are my contact details:";
        lastMessageText = "Shared contact details.";
    } else if (pendingGigShareData && userProfile.role === 'admin') { // Only admin can effectively share gigs now
      newMessageContent.sharedGigId = pendingGigShareData.gigId;
      newMessageContent.sharedGigTitle = pendingGigShareData.gigTitle;
      lastMessageText = `[Gig Shared] ${pendingGigShareData.gigTitle}`;
      if (message.trim()) {
        newMessageContent.text = message.trim();
        lastMessageText = `${message.trim()} (Shared: ${pendingGigShareData.gigTitle})`;
      }
    } else if (pendingProfileShareData && userProfile.role === 'admin') { // Only admin can effectively share profiles
      newMessageContent.sharedUserId = pendingProfileShareData.userId;
      newMessageContent.sharedUsername = pendingProfileShareData.username;
      newMessageContent.sharedUserProfilePictureUrl = pendingProfileShareData.profilePictureUrl;
      newMessageContent.sharedUserRole = pendingProfileShareData.userRole;
      lastMessageText = `[Profile Shared] ${pendingProfileShareData.username}`;
      if (message.trim()) {
        newMessageContent.text = message.trim();
        lastMessageText = `${message.trim()} (Shared profile: ${pendingProfileShareData.username})`;
      }
    } else if (message.trim()) {
      newMessageContent.text = message.trim();
      lastMessageText = message.trim();
    }


    try {
      const chatDocRef = doc(db, 'chats', selectedChatId);
      const messagesColRef = collection(chatDocRef, 'messages');

      const batchOp = writeBatch(db);
      batchOp.set(doc(messagesColRef), newMessageContent);

      const chatUpdateData: Partial<ChatMetadata> & {updatedAt: any, lastMessageTimestamp: any} = {
        lastMessage: lastMessageText.substring(0, 100), 
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
        lastMessageReadBy: [user.uid],
        [`participantUsernames.${user.uid}`]: userProfile.username || user.email?.split('@')[0] || 'User',
      };
      
      if (userProfile.profilePictureUrl) {
        const currentChatForPicUpdate = chats.find(c => c.id === selectedChatId) || transientChatOverride; 
        const existingPictures = currentChatForPicUpdate?.participantProfilePictures || {};
        if (existingPictures[user.uid] !== userProfile.profilePictureUrl) {
           chatUpdateData.participantProfilePictures = {
             ...existingPictures,
             [user.uid]: userProfile.profilePictureUrl,
           };
        }
      }

      if (userProfile.role === 'admin' && currentChatDetails.chatStatus === 'pending_admin_response') {
          chatUpdateData.chatStatus = 'accepted';
          batchOp.set(doc(messagesColRef), { 
              senderId: 'system',
              text: `Admin ${userProfile.username} has joined and replied.`,
              messageType: 'system_admin_reply_received',
              timestamp: serverTimestamp(),
          });
      }


      batchOp.update(chatDocRef, chatUpdateData);

      await batchOp.commit();
      setMessage('');
      setPendingGigShareData(null);
      setPendingProfileShareData(null);
      setTransientChatOverride(null); 
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Send Error", description: "Could not send message.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  // handleChatRequestAction is no longer needed as direct student-client chat requests are removed.
  // Admin chat requests are handled differently (status change from pending_admin_response to accepted upon admin reply).

  const filteredChats = useMemo(() => {
    if (!chatSearchTerm.trim()) {
      return chats;
    }
    const lowerSearchTerm = chatSearchTerm.toLowerCase();
    return chats.filter(chat => {
      const otherParticipantId = chat.participants.find(pId => pId !== user?.uid);
      if (otherParticipantId) {
        const chatPartnerUsername = chat.participantUsernames[otherParticipantId];
        return chatPartnerUsername?.toLowerCase().includes(lowerSearchTerm);
      }
      return false;
    });
  }, [chats, chatSearchTerm, user]);

  const _selectedChatDetails = useMemo(() => {
    return chats.find(c => c.id === selectedChatId) || 
           (transientChatOverride?.id === selectedChatId ? transientChatOverride : null);
  }, [chats, selectedChatId, transientChatOverride]);


  const processedMessagesWithDates = useMemo(() => {
    const elements: React.ReactNode[] = [];
    let lastMessageDateString: string | null = null;

    messages.forEach((msg) => {
      if (msg.timestamp && typeof msg.timestamp.toDate === 'function') {
        const messageDate = msg.timestamp.toDate();
        const currentDateString = format(startOfDay(messageDate), 'yyyy-MM-dd');

        if (currentDateString !== lastMessageDateString) {
          let dateLabel = '';
          if (isToday(messageDate)) {
            dateLabel = 'Today';
          } else if (isYesterday(messageDate)) {
            dateLabel = 'Yesterday';
          } else {
            dateLabel = format(messageDate, 'MMMM d, yyyy');
          }
          
          elements.push(
            <div key={`date-${currentDateString}`} className="flex justify-center my-2 sticky top-2 z-[1]">
              <Badge variant="secondary" className="text-xs px-2 py-1 shadow-md">{dateLabel}</Badge>
            </div>
          );
          lastMessageDateString = currentDateString;
        }
      }
      
      const otherUserIdInChat = _selectedChatDetails?.participants.find(pId => pId !== user?.uid);
      const otherUserInChatProfile = otherUserIdInChat ? otherParticipantProfiles[otherUserIdInChat] : null;
      const shouldShowBlueTicks = userProfile?.readReceiptsEnabled && (otherUserInChatProfile?.readReceiptsEnabled === undefined || otherUserInChatProfile?.readReceiptsEnabled);


      elements.push(
        <div
          key={msg.id}
          className={`flex mb-1 ${msg.senderId === user?.uid ? 'justify-end' : msg.senderId === 'system' ? 'justify-center' : 'justify-start'}`}
        >
          {msg.sharedGigId && msg.sharedGigTitle ? ( 
             <Link
                href={`/gigs/${msg.sharedGigId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'block p-3 my-1 rounded-lg shadow-sm max-w-[70%] min-w-0 overflow-hidden',
                  msg.senderId === user?.uid
                    ? 'bg-primary/90 border border-primary-foreground/20 hover:bg-primary/80 text-primary-foreground'
                    : 'bg-card border border-border hover:bg-accent/60 text-card-foreground'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Briefcase
                    className={cn(
                      'h-5 w-5 shrink-0 mt-0.5',
                      msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    )}
                  />
                  <div className="flex-grow min-w-0">
                    <h4
                      className={cn(
                        'font-semibold text-sm break-words',
                        msg.senderId === user?.uid ? 'text-primary-foreground' : 'text-foreground'
                      )}
                    >
                      {msg.sharedGigTitle}
                    </h4>
                    {msg.text && (
                      <p
                        className={cn(
                          'text-xs mt-1 whitespace-pre-wrap break-words',
                          msg.senderId === user?.uid ? 'text-primary-foreground/90' : 'text-foreground/80'
                        )}
                      >
                        {msg.text}
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn(
                    "mt-2.5 pt-2.5 border-t border-dashed flex justify-end items-center",
                    msg.senderId === user?.uid ? 'border-primary-foreground/50' : 'border-border/70'
                    )}>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      msg.senderId === user?.uid ? 'text-primary-foreground/90 hover:text-primary-foreground' : 'text-primary hover:text-primary/80'
                    )}
                  >
                    View Gig Details &rarr;
                  </span>
                </div>
                 <p className={`text-xs mt-1.5 text-right ${msg.senderId === user?.uid ? 'text-primary-foreground/70' : 'text-muted-foreground/80'}`}>
                    {msg.timestamp && typeof msg.timestamp.toDate === 'function' ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                 </p>
              </Link>
          ) : msg.sharedUserId && msg.sharedUsername ? ( 
             <Link
                href={`/profile/${msg.sharedUserId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'block p-3 my-1 rounded-lg shadow-sm max-w-[70%] min-w-0 overflow-hidden',
                  msg.senderId === user?.uid
                    ? 'bg-primary/90 border border-primary-foreground/20 hover:bg-primary/80 text-primary-foreground'
                    : 'bg-card border border-border hover:bg-accent/60 text-card-foreground'
                )}
              >
                <div className="flex items-start gap-2.5">
                   <Avatar className={cn("h-10 w-10 shrink-0 mt-0.5 border", msg.senderId === user?.uid ? 'border-primary-foreground/30' : 'border-border')}>
                      <AvatarImage src={msg.sharedUserProfilePictureUrl} alt={msg.sharedUsername} />
                      <AvatarFallback>{msg.sharedUsername.substring(0,1).toUpperCase()}</AvatarFallback>
                   </Avatar>
                  <div className="flex-grow min-w-0">
                    <h4
                      className={cn(
                        'font-semibold text-sm break-words',
                        msg.senderId === user?.uid ? 'text-primary-foreground' : 'text-foreground'
                      )}
                    >
                      {msg.sharedUsername}
                    </h4>
                     {msg.sharedUserRole && <Badge variant={msg.senderId === user?.uid ? 'secondary' : 'outline'} className={cn("text-xs capitalize", msg.senderId === user?.uid ? 'bg-primary-foreground/20 text-primary-foreground/90 border-transparent' : '')}>{msg.sharedUserRole}</Badge>}
                    {msg.text && (
                      <p
                        className={cn(
                          'text-xs mt-1 whitespace-pre-wrap break-words',
                          msg.senderId === user?.uid ? 'text-primary-foreground/90' : 'text-foreground/80'
                        )}
                      >
                        {msg.text}
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn(
                    "mt-2.5 pt-2.5 border-t border-dashed flex justify-end items-center",
                    msg.senderId === user?.uid ? 'border-primary-foreground/50' : 'border-border/70'
                    )}>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      msg.senderId === user?.uid ? 'text-primary-foreground/90 hover:text-primary-foreground' : 'text-primary hover:text-primary/80'
                    )}
                  >
                    View Profile &rarr;
                  </span>
                </div>
                 <p className={`text-xs mt-1.5 text-right ${msg.senderId === user?.uid ? 'text-primary-foreground/70' : 'text-muted-foreground/80'}`}>
                    {msg.timestamp && typeof msg.timestamp.toDate === 'function' ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                 </p>
              </Link>
          ) : ( 
            <div 
              className={cn(
                "p-3 rounded-lg max-w-[70%] shadow-sm min-w-0 overflow-hidden",
                 msg.senderId === user?.uid ? 'bg-primary text-primary-foreground' : 
                 msg.senderId === 'system' || msg.messageType?.startsWith('system_') ? 'bg-muted/70 text-muted-foreground text-xs italic text-center' : 'bg-secondary dark:bg-muted'
              )}
            >
               {(msg.messageType?.startsWith('system_') || msg.senderId === 'system') && <p className="text-center">{msg.text}</p>}
               {!msg.messageType?.startsWith('system_') && msg.senderId !== 'system' && msg.isDetailShareRequest && (
                 <div className="p-2.5 my-1 rounded-md border border-border bg-background/70 text-sm">
                    <p className="font-semibold break-all whitespace-pre-wrap">{msg.text || "Contact details request"}</p>
                 </div>
               )}
               {!msg.messageType?.startsWith('system_') && msg.senderId !== 'system' && msg.isDetailsShared && msg.sharedContactInfo && (
                <div className={`p-2.5 my-1 rounded-md border ${msg.senderId === user?.uid ? 'border-primary-foreground/30 bg-primary/80' : 'border-border bg-background/70'}`}>
                    <p className="text-xs font-medium mb-1 break-all">{msg.sharedContactInfo.note || "Contact Information:"}</p>
                    {msg.sharedContactInfo.email && (
                        <div className="flex items-center gap-1.5 text-sm">
                           <MailIcon className={`h-3.5 w-3.5 ${msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} />
                           <span className="break-all">{msg.sharedContactInfo.email}</span>
                        </div>
                    )}
                    {msg.sharedContactInfo.phone && (
                        <div className="flex items-center gap-1.5 text-sm mt-0.5">
                           <Phone className={`h-3.5 w-3.5 ${msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} />
                           <span className="break-all">{msg.sharedContactInfo.phone}</span>
                        </div>
                    )}
                     {msg.text && msg.text !== (msg.sharedContactInfo.note || "Here are my contact details:") && <p className="text-sm mt-1.5 pt-1.5 border-t border-dashed break-all whitespace-pre-wrap">{msg.text}</p>}
                </div>
               )}
              {!msg.messageType?.startsWith('system_') && msg.senderId !== 'system' && msg.text && !msg.isDetailShareRequest && !msg.isDetailsShared && (!msg.sharedGigId && !msg.sharedUserId) && <p className="text-sm whitespace-pre-wrap break-all">{msg.text}</p>}
              {msg.senderId !== 'system' && !msg.messageType?.startsWith('system_') && (
                 <div className={`text-xs mt-1 text-right flex items-center justify-end gap-1 ${msg.senderId === user?.uid ? 'text-primary-foreground/70' : 'text-muted-foreground/80'}`}>
                    <span>{msg.timestamp && typeof msg.timestamp.toDate === 'function' ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}</span>
                    {msg.senderId === user?.uid && (
                        <>
                            {msg.readByRecipientAt && shouldShowBlueTicks ? (
                                <Check className="h-3.5 w-3.5 text-blue-400 -mr-0.5" /> 
                            ) : msg.deliveredToRecipientAt ? (
                                <Check className="h-3.5 w-3.5 text-primary-foreground/70 -mr-0.5" /> 
                            ) : null}
                            <Check className={cn("h-3.5 w-3.5", msg.readByRecipientAt && shouldShowBlueTicks ? "text-blue-400" : "text-primary-foreground/70", msg.deliveredToRecipientAt || msg.readByRecipientAt ? "-ml-1.5" : "")} />
                        </>
                    )}
                 </div>
              )}
            </div>
          )}
        </div>
      );
    });
    return elements;
  }, [messages, user, userProfile, otherParticipantProfiles, _selectedChatDetails]);

  const handleOpenWarnDialogInChat = () => {
    if (userProfile?.role === 'admin' && otherUserId && otherUserActualProfile?.role !== 'admin') {
      setWarningReasonForChat('');
      setShowWarnUserDialogInChat(true);
    }
  };

  const submitWarningInChat = async () => {
    if (!user || !userProfile || !otherUserId || !otherUsername || !warningReasonForChat.trim() || !db) return;
    setIsSubmittingWarningInChat(true);
    try {
      await addDoc(collection(db, 'user_warnings'), {
        warnedUserId: otherUserId,
        warnedUserName: otherUsername,
        warnedUserRole: otherUserActualProfile?.role || 'unknown',
        adminId: user.uid,
        adminUsername: userProfile.username || 'Admin',
        reason: warningReasonForChat.trim(),
        gigId: _selectedChatDetails?.gigId || null,
        gigTitle: currentGigForChat?.title || _selectedChatDetails?.gigId || null,
        timestamp: serverTimestamp(),
      });
      toast({ title: "Warning Logged", description: `A warning has been logged for ${otherUsername}. A notification record has been created.` });
      
      await addDoc(collection(db, 'notifications'), {
        recipientUserId: otherUserId,
        message: `You have received a warning from an administrator regarding: ${warningReasonForChat.trim()}${_selectedChatDetails?.gigId ? ` (related to gig: ${currentGigForChat?.title || _selectedChatDetails.gigId})` : ''}.`,
        type: 'account_warning',
        relatedGigId: _selectedChatDetails?.gigId || null,
        relatedGigTitle: currentGigForChat?.title || null,
        isRead: false,
        createdAt: serverTimestamp(),
        adminActorId: user.uid,
        adminActorUsername: userProfile.username || 'Admin Action',
      });

      setShowWarnUserDialogInChat(false);
    } catch (error: any) {
      console.error("Error submitting warning from chat:", error);
      toast({ title: "Error", description: "Could not log warning.", variant: "destructive" });
    } finally {
      setIsSubmittingWarningInChat(false);
    }
  };


  if (authLoading && typeof window !== 'undefined') {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user || !userProfile) { 
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><p>Loading user session...</p></div>;
  }

  const otherUserId = _selectedChatDetails?.participants.find(pId => pId !== user?.uid);
  const otherUsername = otherUserId ? _selectedChatDetails?.participantUsernames[otherUserId] : 'User';
  const otherUserProfilePicture = otherUserId ? _selectedChatDetails?.participantProfilePictures?.[otherUserId] : undefined;
  const otherUserActualProfile = otherUserId ? otherParticipantProfiles[otherUserId] : null;
  
  const isOtherUserBlockedByCurrentUser = otherUserId && userProfile?.blockedUserIds?.includes(otherUserId);
  const [isCurrentUserBlockedByOther, setIsCurrentUserBlockedByOther] = useState(false);

  useEffect(() => {
    const checkBlockedStatus = async () => {
      if (otherUserId && db && user) {
        const otherUserDocRef = doc(db, 'users', otherUserId);
        const otherUserSnap = await getDoc(otherUserDocRef);
        if (otherUserSnap.exists()) {
          const otherUserData = otherUserSnap.data() as UserProfile;
          setOtherParticipantProfiles(prev => ({...prev, [otherUserId]: otherUserData})); 
          setIsCurrentUserBlockedByOther(otherUserData.blockedUserIds?.includes(user.uid) || false);
        } else {
          setIsCurrentUserBlockedByOther(false);
        }
      } else {
        setIsCurrentUserBlockedByOther(false);
      }
    };
    if (selectedChatId) {
      checkBlockedStatus();
    }
  }, [selectedChatId, otherUserId, user, db]);


  const canShareDetails = userProfile?.role === 'admin' &&
                          currentGigForChat?.status === 'in-progress' && // Keep gig context relevant
                          otherUserActualProfile?.role === 'student' && // Admin sharing with selected student
                          currentGigForChat?.selectedStudentId === otherUserId &&
                          (!!userProfile?.personalEmail || !!userProfile?.personalPhone);

  const canRequestDetails = userProfile?.role === 'admin' && // Only admin can request
                            currentGigForChat?.status === 'in-progress' &&
                            otherUserActualProfile?.role === 'student' &&
                            currentGigForChat?.selectedStudentId === user?.uid; // This seems wrong, admin is not selected student

  const isChatPendingAdminResponse = _selectedChatDetails?.chatStatus === 'pending_admin_response';
  const isCurrentUserInitiatorOfAdminRequest = isChatPendingAdminResponse && _selectedChatDetails?.requestInitiatorId === user?.uid;


  let inputDisabledReason = "";
  if (!_selectedChatDetails) inputDisabledReason = "Loading chat...";
  else if (userProfile.role !== 'admin' && otherUserActualProfile?.role !== 'admin') inputDisabledReason = "Direct user chats disabled.";
  else if (isCurrentUserInitiatorOfAdminRequest && messages.length > 0) inputDisabledReason = "Waiting for admin to reply...";
  else if (isSending) inputDisabledReason = "Sending...";
  else if (isOtherUserBlockedByCurrentUser) inputDisabledReason = "You blocked this user.";
  else if (isCurrentUserBlockedByOther) inputDisabledReason = "This user blocked you.";

  const isInputEffectivelyDisabled = !!inputDisabledReason;

  const placeholderText = isInputEffectivelyDisabled ? inputDisabledReason :
    (isChatPendingAdminResponse && isCurrentUserInitiatorOfAdminRequest && messages.length === 0 ? "Type your support request to admin..." :
    (pendingGigShareData || pendingProfileShareData) ? "Add a caption (optional)..." : "Type your message...");


  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)]">
      <Card className={cn(
        "w-full md:w-1/3 lg:w-1/4 glass-card flex flex-col",
        selectedChatId && 'hidden md:flex'
      )}>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" /> Conversations
            {totalUnreadChats > 0 && (
              <Badge variant="destructive" className="ml-auto">{totalUnreadChats}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex flex-col flex-grow min-h-0 overflow-hidden">
           <div className="relative p-2 border-b">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search conversations..."
              className="pl-8 h-9 w-full"
              value={chatSearchTerm}
              onChange={(e) => setChatSearchTerm(e.target.value)}
            />
          </div>
          <ScrollArea className="flex-grow min-h-0">
            <div className="p-2 space-y-1">
                {isLoadingChats && (
                <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
                )}
                {!isLoadingChats && filteredChats.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                    {chatSearchTerm ? 'No conversations match your search.' : 
                     (userProfile?.role === 'admin' ? 'No active conversations. Start one!' : 'No active admin chats. Request one via Support.')}
                </p>
                )}
                {filteredChats.map((chat) => {
                const otherParticipantId = chat.participants.find(pId => pId !== user?.uid);
                const chatPartnerUsername = otherParticipantId ? chat.participantUsernames[otherParticipantId] : 'Unknown User';
                const partnerProfilePic = otherParticipantId ? chat.participantProfilePictures?.[otherParticipantId] : undefined;
                const isUnread = chat.lastMessageSenderId && chat.lastMessageSenderId !== user?.uid && (!chat.lastMessageReadBy || !chat.lastMessageReadBy.includes(user!.uid));
                
                let isPendingForCurrentUserAction = false;
                if (chat.chatStatus === 'pending_admin_response' && userProfile?.role === 'admin' && chat.requestInitiatorId !== user.uid) {
                    isPendingForCurrentUserAction = true; 
                }

                return (
                    <div
                    key={chat.id}
                    className={`p-3 rounded-md cursor-pointer hover:bg-accent/50 flex items-center gap-3 relative ${selectedChatId === chat.id ? 'bg-accent' : ''} ${isUnread ? 'font-semibold' : ''}`}
                    onClick={() => handleSelectChat(chat.id)}
                    >
                    {(isUnread || isPendingForCurrentUserAction) && (
                        <span className={cn(
                            "absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full",
                            isPendingForCurrentUserAction ? "bg-amber-500 animate-pulse" : "bg-primary"
                        )} title={isPendingForCurrentUserAction ? "Action required" : "Unread messages"}></span>
                    )}
                    <Link href={`/profile/${otherParticipantId}`} passHref onClick={(e) => e.stopPropagation()}>
                        <Avatar className="h-10 w-10 ml-2">
                            <AvatarImage src={partnerProfilePic} alt={chatPartnerUsername} />
                            <AvatarFallback>{chatPartnerUsername?.substring(0,1).toUpperCase() || 'U'}</AvatarFallback>
                        </Avatar>
                    </Link>
                    <div className="flex-grow overflow-hidden min-w-0">
                        {otherParticipantId ? (
                        <Link href={`/profile/${otherParticipantId}`} passHref
                            onClick={(e) => e.stopPropagation()}
                            className={`text-sm truncate hover:underline ${isUnread || isPendingForCurrentUserAction ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                            {chatPartnerUsername}
                        </Link>
                        ) : (
                        <p className={`text-sm truncate ${isUnread || isPendingForCurrentUserAction ? 'text-foreground' : 'text-muted-foreground'}`}>{chatPartnerUsername}</p>
                        )}
                        <p className={`text-xs truncate ${isUnread || isPendingForCurrentUserAction ? 'text-foreground/80' : 'text-muted-foreground/80'}`}>
                        {chat.chatStatus === 'pending_admin_response' && chat.requestInitiatorId === user?.uid && "Support request sent..."}
                        {chat.chatStatus === 'pending_admin_response' && chat.requestInitiatorId !== user?.uid && userProfile?.role === 'admin' && "User needs support."}
                        {chat.chatStatus === 'accepted' && chat.lastMessage}
                        {!chat.chatStatus && chat.lastMessage} 
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                            {chat.lastMessageTimestamp && typeof chat.lastMessageTimestamp.toDate === 'function' ? formatDistanceToNow(chat.lastMessageTimestamp.toDate(), { addSuffix: true }) : (chat.createdAt && typeof chat.createdAt.toDate === 'function' ? formatDistanceToNow(chat.createdAt.toDate(), {addSuffix: true}) : '')}
                        </p>
                    </div>
                    </div>
                );
                })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className={cn(
        "flex-grow glass-card flex flex-col h-full relative",
        !selectedChatId && 'hidden md:flex'
        )}>
        {selectedChatId && _selectedChatDetails && otherUserId && user && userProfile ? (
          <>
            <CardHeader className="border-b flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 gap-2 sm:gap-0 flex-wrap">
              <div className="flex items-center gap-3 flex-grow min-w-0">
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setSelectedChatId(null)}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <Link href={`/profile/${otherUserId}`} passHref>
                  <Avatar className="h-10 w-10 cursor-pointer">
                      <AvatarImage src={otherUserProfilePicture} alt={otherUsername} />
                      <AvatarFallback>{otherUsername?.substring(0,1).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="overflow-hidden">
                  <Link href={`/profile/${otherUserId}`} className="hover:underline">
                    <CardTitle className="text-base truncate">{otherUsername} {otherUserActualProfile?.role === 'admin' && <Badge variant="outline" className="ml-1 text-xs">Admin</Badge>}</CardTitle>
                  </Link>
                  {currentGigForChat?.title && _selectedChatDetails.chatStatus === 'accepted' && userProfile.role === 'admin' && (
                      <Link href={`/gigs/${currentGigForChat.id}`} className="text-xs text-primary hover:underline truncate block">
                          Gig: {currentGigForChat.title}
                      </Link>
                  )}
                  {isChatPendingAdminResponse && isCurrentUserInitiatorOfAdminRequest && messages.length > 0 && ( <p className="text-xs text-amber-600 dark:text-amber-400">Support request sent, waiting for admin.</p> )}
                  {isChatPendingAdminResponse && !isCurrentUserInitiatorOfAdminRequest && userProfile.role === 'admin' && ( <p className="text-xs text-amber-600 dark:text-amber-400">This user needs support. Reply to activate chat.</p> )}
                  {isOtherUserBlockedByCurrentUser && ( <p className="text-xs text-destructive flex items-center gap-1"><Lock className="h-3 w-3"/>You have blocked this user.</p> )}
                  {isCurrentUserBlockedByOther && ( <p className="text-xs text-destructive flex items-center gap-1"><Lock className="h-3 w-3"/>This user has blocked you.</p> )}
                </div>
              </div>
               <div className="flex flex-wrap justify-end gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                {userProfile.role === 'admin' && otherUserActualProfile?.role !== 'admin' && (
                    <Button variant="outline" size="sm" onClick={handleOpenWarnDialogInChat} className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/50">
                        <ShieldAlert className="mr-2 h-4 w-4" /> Warn User
                    </Button>
                )}
                {_selectedChatDetails.chatStatus === 'accepted' && userProfile.role === 'admin' && canShareDetails && userProfile && (
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={isInputEffectivelyDisabled}><ShareIcon className="mr-2 h-4 w-4" /> Share Contact</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Share Admin Contact Details?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You are about to share your admin contact details with {otherUsername}:
                                {userProfile.personalEmail && <div className="mt-2">Email: {userProfile.personalEmail}</div>}
                                {userProfile.personalPhone && <div className="mt-0.5">Phone: {userProfile.personalPhone}</div>}
                                This cannot be undone.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleSendMessage(false, true, {email: userProfile.personalEmail || undefined, phone: userProfile.personalPhone || undefined})}>
                                Share Now
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
                 {_selectedChatDetails.chatStatus === 'accepted' && userProfile.role === 'admin' && canRequestDetails && (
                    <Button variant="outline" size="sm" onClick={() => handleSendMessage(true, false)} disabled={isInputEffectivelyDisabled}>
                        <Info className="mr-2 h-4 w-4" /> Request Contact
                    </Button>
                )}
               </div>
            </CardHeader>
            <ScrollArea className="flex-grow p-0">
               <CardContent className="p-4 space-y-1">
                {isLoadingMessages && <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>}
                {processedMessagesWithDates}
                <div ref={messagesEndRef} />
                {!isLoadingMessages && messages.length === 0 && _selectedChatDetails && (
                    <p className="text-center text-muted-foreground pt-10">
                       {isChatPendingAdminResponse && isCurrentUserInitiatorOfAdminRequest && "Send your support request to the admin team."}
                       {isChatPendingAdminResponse && !isCurrentUserInitiatorOfAdminRequest && userProfile?.role === 'admin' && "Waiting for your reply to activate this support chat."}
                       {_selectedChatDetails.chatStatus === 'accepted' && !isInputEffectivelyDisabled && "Send a message to start the conversation."}
                       {isOtherUserBlockedByCurrentUser && "You have blocked this user. Unblock them to send messages."}
                       {isCurrentUserBlockedByOther && "This user has blocked you. You cannot send messages."}
                       {userProfile.role !== 'admin' && otherUserActualProfile?.role !== 'admin' && "Direct user-to-user chats are not enabled."}
                    </p>
                )}
              </CardContent>
            </ScrollArea>

            {showEmojiPicker && (
              <div ref={emojiPickerRef} className="absolute bottom-20 right-2 z-10 md:right-auto md:left-2">
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  autoFocusSearch={false}
                  height={350}
                  width={300}
                  theme={appTheme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                  searchDisabled
                  lazyLoadEmojis
                />
              </div>
            )}

            <CardFooter className="p-3 border-t flex flex-col items-start">
              {pendingGigShareData && userProfile.role==='admin' && (
                <div className="mb-2 p-2 border rounded-md w-full flex items-center justify-between bg-muted/50 text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Briefcase className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground truncate">Sharing Gig: <span className="font-medium text-foreground">{pendingGigShareData.gigTitle}</span></span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingGigShareData(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {pendingProfileShareData && userProfile.role==='admin' && (
                 <div className="mb-2 p-2 border rounded-md w-full flex items-center justify-between bg-muted/50 text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <UserCircle className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground truncate">Sharing Profile: <span className="font-medium text-foreground">{pendingProfileShareData.username}</span></span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingProfileShareData(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex gap-2 w-full">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEmojiPicker(prev => !prev)}
                  disabled={isInputEffectivelyDisabled}
                  title="Add emoji"
                >
                    <Smile className="h-5 w-5" />
                    <span className="sr-only">Add emoji</span>
                </Button>
                <Input
                  type="text"
                  placeholder={placeholderText}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !isInputEffectivelyDisabled && handleSendMessage()}
                  disabled={isInputEffectivelyDisabled}
                />
                <Button onClick={() => handleSendMessage()} disabled={isInputEffectivelyDisabled || (!message.trim() && !pendingGigShareData && !pendingProfileShareData)} title={pendingGigShareData ? "Send Gig" : (pendingProfileShareData ? "Send Profile" : "Send message")}>
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="sr-only">{pendingGigShareData ? "Send Gig" : (pendingProfileShareData ? "Send Profile" : "Send")}</span>
                </Button>
              </div>
            </CardFooter>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
                {isLoadingChats ? 'Loading conversations...' : (searchParams.get('userId') && !searchParams.get('shareGigId') && !searchParams.get('shareUserId') && !pendingGigShareData && !pendingProfileShareData ? 'Setting up your chat...' : 
                (userProfile.role !== 'admin' ? 'Select an admin conversation or request one via Support.' : 'Select a conversation to start chatting.'))}
                 {(searchParams.get('shareGigId') || pendingGigShareData) && !selectedChatId && userProfile.role === 'admin' && ' Select a chat to share the gig.'}
                 {(searchParams.get('shareUserId') || pendingProfileShareData) && !selectedChatId && userProfile.role === 'admin' && ' Select a chat to share the profile.'}
                 {userProfile?.role !== 'admin' && <span className="block mt-2 text-xs">Need help? <Link href="/support" className="text-primary hover:underline">Visit Support & FAQs</Link> or request a chat with an admin.</span>}
            </p>
            {targetUserForNewChat && !selectedChatId && !pendingGigShareData && !pendingProfileShareData && (
                 <p className="text-sm mt-2">Starting chat with {targetUserForNewChat.username}...</p>
            )}
          </div>
        )}
      </Card>

       {/* Dialog for Warning User - Moved to Chat Page */}
        <Dialog open={showWarnUserDialogInChat} onOpenChange={setShowWarnUserDialogInChat}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Log Warning for {otherUsername || 'User'}</DialogTitle>
                    <DialogDescription>
                        Please provide a reason for this warning. This will be logged and a notification record will be created for the user.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="warningReasonChat" className="sr-only">Warning Reason</Label>
                    <Textarea
                        id="warningReasonChat"
                        placeholder="Enter reason for warning..."
                        value={warningReasonForChat}
                        onChange={(e) => setWarningReasonForChat(e.target.value)}
                        rows={4}
                    />
                </div>
                <DialogFooter>
                <Button variant="outline" onClick={() => setShowWarnUserDialogInChat(false)} disabled={isSubmittingWarningInChat}>Cancel</Button>
                <Button onClick={submitWarningInChat} disabled={isSubmittingWarningInChat || !warningReasonForChat.trim()}>
                    {isSubmittingWarningInChat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Warning
                </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    </div>
  );
}

