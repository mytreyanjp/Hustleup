
"use client";

import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Send, UserCircle, ArrowLeft, Paperclip, Image as ImageIconLucide, FileText as FileIcon, X, Smile, Link2, Share2 as ShareIcon, Info, Phone, Mail as MailIcon, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Search, Lock } from 'lucide-react';
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

interface PendingShareData {
  gigId: string;
  gigTitle: string;
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
  const [pendingShareData, setPendingShareData] = useState<PendingShareData | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [targetUserForNewChat, setTargetUserForNewChat] = useState<UserProfile | null>(null);
  const [currentGigForChat, setCurrentGigForChat] = useState<GigForChatContext | null>(null);
  const [isAcceptingOrRejecting, setIsAcceptingOrRejecting] = useState(false);
  const [chatSearchTerm, setChatSearchTerm] = useState('');


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


  const getOrCreateChat = useCallback(async (targetUserId: string, targetUsername: string, targetProfilePictureUrl?: string, gigIdForContext?: string) => {
    if (!user || !userProfile || !db) return null;

    if (userProfile.blockedUserIds?.includes(targetUserId)) {
        toast({ title: "Chat Blocked", description: "You have blocked this user. Unblock them to start a chat.", variant: "destructive" });
        router.push('/chat'); // Go back to chat list or a safe page
        return null;
    }
    // Also check if the target user has blocked the current user (if such a field exists and is readable)
    // For now, this focuses on the current user's block list.


    const chatId = getChatId(user.uid, targetUserId);
    const chatDocRef = doc(db, 'chats', chatId);

    try {
      const chatSnap = await getDoc(chatDocRef);
      if (chatSnap.exists()) {
        const existingChatData = chatSnap.data() as ChatMetadata;
        let updateRequired = false;
        const updates: Partial<ChatMetadata> & {updatedAt?: any} = { updatedAt: serverTimestamp() };

        if (gigIdForContext && existingChatData.gigId !== gigIdForContext) {
            updates.gigId = gigIdForContext;
            updateRequired = true;
        } else if (gigIdForContext && !existingChatData.gigId) {
             updates.gigId = gigIdForContext;
             updateRequired = true;
        }

        if (gigIdForContext && (existingChatData.chatStatus === 'pending_request' || existingChatData.chatStatus === 'rejected')) {
            updates.chatStatus = 'accepted';
            updates.lastMessage = "Chat is now active via gig link.";
            updates.lastMessageTimestamp = serverTimestamp();
            updates.lastMessageSenderId = 'system';
            updates.lastMessageReadBy = []; 
            updateRequired = true;
            
            const messagesColRef = collection(chatDocRef, 'messages');
            addDoc(messagesColRef, {
                senderId: 'system',
                text: 'This chat has been automatically activated because you are now connected through a gig.',
                timestamp: serverTimestamp(),
                messageType: 'system_gig_connection_activated',
            }).catch(console.error);
        }
        
        if (updateRequired) {
            await updateDoc(chatDocRef, updates);
        }
        setSelectedChatId(chatId);
        return chatId;
      } else {
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
          lastMessageReadBy: [],
        };

        if (userProfile.profilePictureUrl) {
          newChatData.participantProfilePictures![user.uid] = userProfile.profilePictureUrl;
        }
        if (targetProfilePictureUrl) {
          newChatData.participantProfilePictures![targetUserId] = targetProfilePictureUrl;
        }

        if (gigIdForContext) {
          newChatData.chatStatus = 'accepted';
          newChatData.gigId = gigIdForContext;
          newChatData.lastMessage = 'Chat started.';
          newChatData.lastMessageSenderId = user.uid;
          newChatData.lastMessageTimestamp = serverTimestamp() as Timestamp;
          newChatData.lastMessageReadBy = [user.uid];
        } else {
          newChatData.chatStatus = 'pending_request';
          newChatData.requestInitiatorId = user.uid;
          newChatData.lastMessage = 'Chat request sent.'; 
          newChatData.lastMessageSenderId = user.uid;
          newChatData.lastMessageTimestamp = serverTimestamp() as Timestamp;
          newChatData.lastMessageReadBy = [user.uid];
        }

        await setDoc(chatDocRef, newChatData);
        setSelectedChatId(chatId);
        return chatId;
      }
    } catch (error) {
      console.error("Error getting or creating chat:", error);
      toast({ title: "Chat Error", description: "Could not start or find the chat.", variant: "destructive" });
      return null;
    }
  }, [user, userProfile, toast, router]);


  useEffect(() => {
    if (authLoading || !user || !userProfile) return;

    const targetUserId = searchParams.get('userId');
    const shareGigId = searchParams.get('shareGigId');
    const shareGigTitle = searchParams.get('shareGigTitle');
    const gigIdForChatContext = searchParams.get('gigId');
    const preselectChatId = searchParams.get('chatId');

    if (shareGigId && shareGigTitle) {
      setPendingShareData({ gigId: shareGigId, gigTitle: decodeURIComponent(shareGigTitle) });
      setMessage('');
      toast({
        title: "Gig Ready to Share",
        description: "Select a chat and send your message.",
      });
      if (typeof window !== 'undefined') {
        router.replace('/chat', { scroll: false });
      }
    } else if (preselectChatId) {
        setSelectedChatId(preselectChatId);
        if (searchParams.has('chatId') && typeof window !== 'undefined') {
             router.replace('/chat', { scroll: false });
        }
        return;
    } else if (targetUserId && user.uid !== targetUserId) {
      if (userProfile.blockedUserIds?.includes(targetUserId)) {
        toast({ title: "Chat Blocked", description: "You have blocked this user and cannot start a new chat.", variant: "destructive" });
        router.replace('/chat');
        return;
      }
      const fetchTargetUserAndCreateChat = async () => {
        if (!db) {
            toast({ title: "Database Error", description: "Firestore not available for chat.", variant: "destructive" });
            return;
        }
        const targetUserDocRef = doc(db, 'users', targetUserId);
        const targetUserSnap = await getDoc(targetUserDocRef);
        if (targetUserSnap.exists()) {
          const targetUserData = targetUserSnap.data() as UserProfile;
          if (targetUserData.blockedUserIds?.includes(user.uid)) {
            toast({ title: "Cannot Chat", description: "This user has blocked you.", variant: "destructive" });
            router.replace('/chat');
            return;
          }
          setTargetUserForNewChat(targetUserData);
          await getOrCreateChat(targetUserId, targetUserData.username || 'User', targetUserData.profilePictureUrl, gigIdForChatContext || undefined);
        } else {
          console.error("Target user for chat not found.");
          toast({ title: "User Not Found", description: "The user you're trying to chat with doesn't exist.", variant: "destructive" });
        }
        if ((searchParams.has('userId') || searchParams.has('gigId')) && typeof window !== 'undefined') {
            router.replace('/chat', { scroll: false });
        }
      };
      fetchTargetUserAndCreateChat();
    } else if (!shareGigId && !targetUserId && !preselectChatId && (searchParams.has('userId') || searchParams.has('gigId')) && typeof window !== 'undefined') {
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

      // Filter out chats with users blocked by the current user
      if (userProfile && userProfile.blockedUserIds && userProfile.blockedUserIds.length > 0) {
        fetchedChats = fetchedChats.filter(chat => {
          const otherParticipantId = chat.participants.find(pId => pId !== user.uid);
          return !(otherParticipantId && userProfile.blockedUserIds?.includes(otherParticipantId));
        });
      }
      // TODO: Also consider filtering if the *other* user has blocked the current user,
      // if `blockedUserIds` is made public or if a separate "blocksMe" list is maintained.

      setChats(fetchedChats);
      setIsLoadingChats(false);
    }, (error) => {
      console.error("Error fetching chat list:", error);
      toast({ title: "Chat List Error", description: "Could not load your conversations. This may be due to a missing Firestore index. Please check your Firebase console.", variant: "destructive" });
      setIsLoadingChats(false);
    });

    return () => unsubscribe();
  }, [user, userProfile, toast]); // Added userProfile to dependencies

  useEffect(() => {
    if (!selectedChatId || !user || !db) {
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
    }, (error) => {
      console.error(`Error fetching messages for chat ${selectedChatId}:`, error);
      toast({ title: "Message Error", description: "Could not load messages for this chat.", variant: "destructive" });
      setIsLoadingMessages(false);
    });

    const fetchGigContextForChat = async () => {
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
  }, [selectedChatId, user, toast]);


  useEffect(() => {
    if (!authLoading && !user && typeof window !== 'undefined') {
       router.push('/auth/login?redirect=/chat');
    }
  }, [user, authLoading, router]);


  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setShowEmojiPicker(false);
    setMessage('');
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prevMessage => prevMessage + emojiData.emoji);
  };

  const handleSendMessage = async (
    isRequestingDetails: boolean = false,
    isSharingDetails: boolean = false,
    sharedDetails?: { email?: string, phone?: string }
    ) => {
    if (!selectedChatId || !user || !userProfile || !db ) {
        toast({ title: "Cannot Send", description: "Chat session is invalid.", variant: "destructive"});
        return;
    }

    const currentChatDetails = chats.find(c => c.id === selectedChatId);
    if (!currentChatDetails) {
        toast({ title: "Cannot Send", description: "Chat details not found.", variant: "destructive"});
        return;
    }
    
    const otherParticipantId = currentChatDetails.participants.find(pId => pId !== user.uid);
    if (otherParticipantId && userProfile.blockedUserIds?.includes(otherParticipantId)) {
        toast({ title: "Cannot Send", description: "You have blocked this user. Unblock them to send messages.", variant: "destructive" });
        return;
    }
    // Check if other user has blocked current user (requires target user's profile data)
    // This might need an async check or rely on chat list filtering for simplicity
    const targetUserProfileSnap = otherParticipantId ? await getDoc(doc(db, 'users', otherParticipantId)) : null;
    if (targetUserProfileSnap?.exists() && (targetUserProfileSnap.data() as UserProfile).blockedUserIds?.includes(user.uid)) {
        toast({ title: "Cannot Send", description: "This user has blocked you.", variant: "destructive" });
        return;
    }


    const isInitiator = currentChatDetails.requestInitiatorId === user.uid;
    const isPendingRequest = currentChatDetails.chatStatus === 'pending_request';
    const canSendRequestMessage = isPendingRequest && isInitiator && messages.length === 0;

    if (!canSendRequestMessage && currentChatDetails.chatStatus !== 'accepted') {
         toast({ title: "Cannot Send", description: "Chat not active or request pending.", variant: "destructive"});
         return;
    }
    
    if (!message.trim() && !pendingShareData && !isRequestingDetails && !isSharingDetails) {
        toast({ title: "Cannot Send", description: "Message is empty.", variant: "destructive"});
        return;
    }


    setIsSending(true);
    setShowEmojiPicker(false);

    const newMessageContent: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp: any } = {
      senderId: user.uid,
      timestamp: serverTimestamp(),
    };

    let lastMessageText = '';

    if (isRequestingDetails) {
        newMessageContent.isDetailShareRequest = true;
        newMessageContent.text = `${userProfile.username} has requested your contact details for the gig: ${currentGigForChat?.title || 'this gig'}.`;
        lastMessageText = `${userProfile.username} requested contact details.`;
    } else if (isSharingDetails && sharedDetails) {
        newMessageContent.isDetailsShared = true;
        newMessageContent.sharedContactInfo = {
            email: sharedDetails.email,
            phone: sharedDetails.phone,
            note: "Here are my contact details as requested:"
        };
        newMessageContent.text = message.trim() || "Here are my contact details:";
        lastMessageText = "Shared contact details.";
    } else if (pendingShareData) {
      newMessageContent.sharedGigId = pendingShareData.gigId;
      newMessageContent.sharedGigTitle = pendingShareData.gigTitle;
      lastMessageText = `[Gig Shared] ${pendingShareData.gigTitle}`;
      if (message.trim()) {
        newMessageContent.text = message.trim();
        lastMessageText = `${message.trim()} (Shared: ${pendingShareData.gigTitle})`;
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
        const currentChat = chats.find(c => c.id === selectedChatId);
        const existingPictures = currentChat?.participantProfilePictures || {};
        if (existingPictures[user.uid] !== userProfile.profilePictureUrl) {
           chatUpdateData.participantProfilePictures = {
             ...existingPictures,
             [user.uid]: userProfile.profilePictureUrl,
           };
        }
      }

      batchOp.update(chatDocRef, chatUpdateData);

      await batchOp.commit();
      setMessage('');
      setPendingShareData(null);
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Send Error", description: "Could not send message.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleChatRequestAction = async (action: 'accepted' | 'rejected') => {
    if (!selectedChatId || !user || !db) return;
    setIsAcceptingOrRejecting(true);
    try {
      const chatDocRef = doc(db, 'chats', selectedChatId);
      const messagesColRef = collection(chatDocRef, 'messages');
      const systemMessageText = action === 'accepted' ? 'Chat request accepted. You can now chat freely.' : 'Chat request rejected.';

      const batch = writeBatch(db);
      batch.update(chatDocRef, {
        chatStatus: action,
        updatedAt: serverTimestamp(),
        lastMessage: systemMessageText,
        lastMessageSenderId: 'system',
        lastMessageTimestamp: serverTimestamp(),
        lastMessageReadBy: [], 
      });
      batch.set(doc(messagesColRef), {
        senderId: 'system',
        text: systemMessageText,
        messageType: action === 'accepted' ? 'system_request_accepted' : 'system_request_rejected',
        timestamp: serverTimestamp(),
      });
      await batch.commit();
      toast({ title: `Request ${action}`, description: `Chat request has been ${action}.` });
    } catch (error) {
      console.error(`Error ${action} chat request:`, error);
      toast({ title: "Action Failed", description: `Could not ${action} the chat request.`, variant: "destructive" });
    } finally {
      setIsAcceptingOrRejecting(false);
    }
  };

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

      elements.push(
        <div
          key={msg.id}
          className={`flex mb-1 ${msg.senderId === user?.uid ? 'justify-end' : msg.senderId === 'system' ? 'justify-center' : 'justify-start'}`}
        >
          <div 
            className={cn(
              "p-3 rounded-lg max-w-[70%] shadow-sm min-w-0 overflow-hidden",
               msg.senderId === user?.uid ? 'bg-primary text-primary-foreground' : 
               msg.senderId === 'system' ? 'bg-muted/70 text-muted-foreground text-xs italic' : 'bg-secondary dark:bg-muted'
            )}
          >
             {msg.messageType?.startsWith('system_') && <p className="text-center">{msg.text}</p>}
             {!msg.messageType?.startsWith('system_') && msg.isDetailShareRequest && (
               <div className="p-2.5 my-1 rounded-md border border-border bg-background/70 text-sm">
                  <p className="font-semibold break-all whitespace-pre-wrap">{msg.text || "Contact details request"}</p>
               </div>
             )}
             {!msg.messageType?.startsWith('system_') && msg.isDetailsShared && msg.sharedContactInfo && (
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
            {!msg.messageType?.startsWith('system_') && msg.sharedGigId && msg.sharedGigTitle && (
              <Link href={`/gigs/${msg.sharedGigId}`} target="_blank" rel="noopener noreferrer"
                    className={`block p-2.5 my-1 rounded-md border hover:shadow-md transition-shadow ${msg.senderId === user?.uid ? 'border-primary-foreground/30 bg-primary/80 hover:bg-primary/70' : 'border-border bg-background/70 hover:bg-accent/70'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Link2 className={`h-4 w-4 ${msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} />
                  <h4 className={`font-semibold text-sm break-all ${msg.senderId === user?.uid ? 'text-primary-foreground' : 'text-foreground'}`}>{msg.sharedGigTitle}</h4>
                </div>
                <p className={`text-xs ${msg.senderId === user?.uid ? 'text-primary-foreground/90 hover:text-primary-foreground underline' : 'text-primary hover:underline'}`}>
                  View Gig Details
                </p>
                 {msg.text && <p className={`text-xs mt-1.5 pt-1.5 border-t border-dashed break-all whitespace-pre-wrap ${msg.senderId === user?.uid ? 'text-primary-foreground/95' : 'text-foreground/95'}`}>{msg.text}</p>}
              </Link>
            )}
            {!msg.messageType?.startsWith('system_') && msg.text && !msg.isDetailShareRequest && !msg.isDetailsShared && (!msg.sharedGigId) && <p className="text-sm whitespace-pre-wrap break-all">{msg.text}</p>}
            {msg.senderId !== 'system' && (
               <p className={`text-xs mt-1 text-right ${msg.senderId === user?.uid ? 'text-primary-foreground/70' : 'text-muted-foreground/80'}`}>
                  {msg.timestamp && typeof msg.timestamp.toDate === 'function' ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
               </p>
            )}
          </div>
        </div>
      );
    });
    return elements;
  }, [messages, user]);


  if (authLoading && typeof window !== 'undefined') {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><p>Loading user session...</p></div>;
  }

  const selectedChatDetails = chats.find(c => c.id === selectedChatId);
  const otherUserId = selectedChatDetails?.participants.find(pId => pId !== user?.uid);
  const otherUsername = otherUserId ? selectedChatDetails?.participantUsernames[otherUserId] : 'User';
  const otherUserProfilePicture = otherUserId ? selectedChatDetails?.participantProfilePictures?.[otherUserId] : undefined;
  
  const isOtherUserBlockedByCurrentUser = otherUserId && userProfile?.blockedUserIds?.includes(otherUserId);
  // Add state to check if current user is blocked by otherUser, fetch this when selecting a chat.
  const [isCurrentUserBlockedByOther, setIsCurrentUserBlockedByOther] = useState(false);

  useEffect(() => {
    const checkBlockedStatus = async () => {
      if (otherUserId && db && user) {
        const otherUserDocRef = doc(db, 'users', otherUserId);
        const otherUserSnap = await getDoc(otherUserDocRef);
        if (otherUserSnap.exists()) {
          const otherUserData = otherUserSnap.data() as UserProfile;
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
  }, [selectedChatId, otherUserId, user]);


  const canShareDetails = userProfile?.role === 'client' &&
                          currentGigForChat?.status === 'in-progress' &&
                          currentGigForChat?.selectedStudentId === otherUserId &&
                          (!!userProfile?.personalEmail || !!userProfile?.personalPhone);

  const canRequestDetails = userProfile?.role === 'student' &&
                            currentGigForChat?.status === 'in-progress' &&
                            currentGigForChat?.selectedStudentId === user?.uid;

  const isCurrentUserInitiator = selectedChatDetails?.requestInitiatorId === user?.uid;
  const isChatPendingRequest = selectedChatDetails?.chatStatus === 'pending_request';
  const isChatRejected = selectedChatDetails?.chatStatus === 'rejected';
  const showRequestActionButtons = isChatPendingRequest && !isCurrentUserInitiator;
  const isInputDisabled =
    (isChatPendingRequest && isCurrentUserInitiator && messages.length > 0) ||
    (isChatPendingRequest && !isCurrentUserInitiator) ||
    isChatRejected ||
    isSending ||
    isOtherUserBlockedByCurrentUser ||
    isCurrentUserBlockedByOther;


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
        <CardContent className="p-0 flex flex-col flex-grow">
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
          <ScrollArea className="flex-grow">
            <div className="p-2 space-y-1">
                {isLoadingChats && (
                <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
                )}
                {!isLoadingChats && filteredChats.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                    {chatSearchTerm ? 'No conversations match your search.' : 'No active conversations. Start one!'}
                </p>
                )}
                {filteredChats.map((chat) => {
                const otherParticipantId = chat.participants.find(pId => pId !== user?.uid);
                const chatPartnerUsername = otherParticipantId ? chat.participantUsernames[otherParticipantId] : 'Unknown User';
                const partnerProfilePic = otherParticipantId ? chat.participantProfilePictures?.[otherParticipantId] : undefined;
                const isUnread = chat.lastMessageSenderId && chat.lastMessageSenderId !== user?.uid && (!chat.lastMessageReadBy || !chat.lastMessageReadBy.includes(user!.uid));
                const isPendingForCurrentUser = chat.chatStatus === 'pending_request' && chat.requestInitiatorId !== user?.uid;

                return (
                    <div
                    key={chat.id}
                    className={`p-3 rounded-md cursor-pointer hover:bg-accent/50 flex items-center gap-3 relative ${selectedChatId === chat.id ? 'bg-accent' : ''} ${isUnread ? 'font-semibold' : ''}`}
                    onClick={() => handleSelectChat(chat.id)}
                    >
                    {isUnread && (
                        <span className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 bg-primary rounded-full"></span>
                    )}
                    {isPendingForCurrentUser && (
                        <span className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 bg-orange-500 rounded-full animate-pulse" title="New chat request"></span>
                    )}
                    <Link href={`/profile/${otherParticipantId}`} passHref onClick={(e) => e.stopPropagation()}>
                        <Avatar className="h-10 w-10 ml-2">
                            <AvatarImage src={partnerProfilePic} alt={chatPartnerUsername} />
                            <AvatarFallback>{chatPartnerUsername?.substring(0,1).toUpperCase() || 'U'}</AvatarFallback>
                        </Avatar>
                    </Link>
                    <div className="flex-grow overflow-hidden">
                        {otherParticipantId ? (
                        <Link href={`/profile/${otherParticipantId}`} passHref
                            onClick={(e) => e.stopPropagation()}
                            className={`text-sm truncate hover:underline ${isUnread || isPendingForCurrentUser ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                            {chatPartnerUsername}
                        </Link>
                        ) : (
                        <p className={`text-sm truncate ${isUnread || isPendingForCurrentUser ? 'text-foreground' : 'text-muted-foreground'}`}>{chatPartnerUsername}</p>
                        )}
                        <p className={`text-xs truncate ${isUnread || isPendingForCurrentUser ? 'text-foreground/80' : 'text-muted-foreground/80'}`}>
                        {chat.chatStatus === 'pending_request' && chat.requestInitiatorId === user?.uid && messages.length === 0 && "Your request message will appear here..."}
                        {chat.chatStatus === 'pending_request' && chat.requestInitiatorId === user?.uid && messages.length > 0 && "Waiting for acceptance..."}
                        {chat.chatStatus === 'pending_request' && chat.requestInitiatorId !== user?.uid && "Responded to your request."}
                        {chat.chatStatus === 'rejected' && "Chat request rejected."}
                        {chat.chatStatus !== 'pending_request' && chat.chatStatus !== 'rejected' && chat.lastMessage}
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
        {selectedChatId && selectedChatDetails && otherUserId && user ? (
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
                    <CardTitle className="text-base truncate">{otherUsername}</CardTitle>
                  </Link>
                  {currentGigForChat?.title && selectedChatDetails.chatStatus === 'accepted' && (
                      <Link href={`/gigs/${currentGigForChat.id}`} className="text-xs text-primary hover:underline truncate block">
                          Gig: {currentGigForChat.title}
                      </Link>
                  )}
                   {selectedChatDetails.chatStatus === 'pending_request' && selectedChatDetails.requestInitiatorId === user.uid && messages.length > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Request sent, waiting for acceptance.</p>
                    )}
                    {selectedChatDetails.chatStatus === 'pending_request' && selectedChatDetails.requestInitiatorId !== user.uid && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Responded to your chat request.</p>
                    )}
                    {selectedChatDetails.chatStatus === 'rejected' && (
                        <p className="text-xs text-destructive">Chat request rejected.</p>
                    )}
                    {isOtherUserBlockedByCurrentUser && (
                        <p className="text-xs text-destructive flex items-center gap-1"><Lock className="h-3 w-3"/>You have blocked this user.</p>
                    )}
                     {isCurrentUserBlockedByOther && (
                        <p className="text-xs text-destructive flex items-center gap-1"><Lock className="h-3 w-3"/>This user has blocked you.</p>
                    )}
                </div>
              </div>
               <div className="flex flex-wrap justify-end gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                {selectedChatDetails.chatStatus === 'accepted' && canShareDetails && userProfile && (
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={isInputDisabled}><ShareIcon className="mr-2 h-4 w-4" /> Share Contact</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Share Personal Contact Details?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You are about to share the following details with {otherUsername}:
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
                {selectedChatDetails.chatStatus === 'accepted' && canRequestDetails && (
                    <Button variant="outline" size="sm" onClick={() => handleSendMessage(true, false)} disabled={isInputDisabled}>
                        <Info className="mr-2 h-4 w-4" /> Request Contact
                    </Button>
                )}
                {showRequestActionButtons && (
                    <>
                        <Button variant="default" size="sm" onClick={() => handleChatRequestAction('accepted')} disabled={isAcceptingOrRejecting}>
                           {isAcceptingOrRejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Accept Request
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleChatRequestAction('rejected')} disabled={isAcceptingOrRejecting}>
                            {isAcceptingOrRejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />} Reject Request
                        </Button>
                    </>
                )}
               </div>
            </CardHeader>
            <ScrollArea className="flex-grow p-0">
               <CardContent className="p-4 space-y-1">
                {isLoadingMessages && <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>}
                {processedMessagesWithDates}
                <div ref={messagesEndRef} />
                {!isLoadingMessages && messages.length === 0 && (
                    <p className="text-center text-muted-foreground pt-10">
                       {isChatPendingRequest && isCurrentUserInitiator && "Send a message to request a chat."}
                       {isChatPendingRequest && !isCurrentUserInitiator && "Waiting for chat request..."}
                       {selectedChatDetails.chatStatus === 'accepted' && !isInputDisabled && "Send a message to start the conversation."}
                       {isChatRejected && "This chat request was rejected. You cannot send further messages."}
                       {isOtherUserBlockedByCurrentUser && "You have blocked this user. Unblock them to send messages."}
                       {isCurrentUserBlockedByOther && "This user has blocked you. You cannot send messages."}
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
              {pendingShareData && (
                <div className="mb-2 p-2 border rounded-md w-full flex items-center justify-between bg-muted/50 text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Link2 className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground truncate">Sharing Gig: <span className="font-medium text-foreground">{pendingShareData.gigTitle}</span></span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingShareData(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex gap-2 w-full">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEmojiPicker(prev => !prev)}
                  disabled={isInputDisabled}
                  title="Add emoji"
                >
                    <Smile className="h-5 w-5" />
                    <span className="sr-only">Add emoji</span>
                </Button>
                <Input
                  type="text"
                  placeholder={
                    isInputDisabled ? (isOtherUserBlockedByCurrentUser ? "You blocked this user" : isCurrentUserBlockedByOther ? "This user blocked you" : "Cannot send message") :
                    (isChatPendingRequest && isCurrentUserInitiator && messages.length === 0 ? "Type your chat request message..." :
                    pendingShareData ? "Add a caption (optional)..." : "Type your message...")
                   }
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !isInputDisabled && handleSendMessage()}
                  disabled={isInputDisabled}
                />
                <Button onClick={() => handleSendMessage()} disabled={isInputDisabled || (!message.trim() && !pendingShareData)} title={pendingShareData ? "Send Gig" : "Send message"}>
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="sr-only">{pendingShareData ? "Send Gig" : "Send"}</span>
                </Button>
              </div>
            </CardFooter>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
                {isLoadingChats ? 'Loading conversations...' : (searchParams.get('userId') && !searchParams.get('shareGigId') && !pendingShareData ? 'Setting up your chat...' : 'Select a conversation to start chatting.')}
                 {(searchParams.get('shareGigId') || pendingShareData) && !selectedChatId && ' Select a chat to share the gig.'}
            </p>
            {targetUserForNewChat && !selectedChatId && !pendingShareData && (
                 <p className="text-sm mt-2">Starting chat with {targetUserForNewChat.username}...</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}


