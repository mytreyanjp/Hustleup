
"use client";

import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Send, UserCircle, ArrowLeft, Paperclip, Image as ImageIconLucide, FileText as FileIcon, X, Smile, Link2, Share2 as ShareIcon, Info, Phone, Mail as MailIcon } from 'lucide-react'; // Renamed Share to ShareIcon
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
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getChatId, cn } from '@/lib/utils';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingShareData, setPendingShareData] = useState<PendingShareData | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [targetUserForNewChat, setTargetUserForNewChat] = useState<UserProfile | null>(null);
  const [currentGigForChat, setCurrentGigForChat] = useState<GigForChatContext | null>(null);


  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

    const chatId = getChatId(user.uid, targetUserId);
    const chatDocRef = doc(db, 'chats', chatId);

    try {
      const chatSnap = await getDoc(chatDocRef);
      if (chatSnap.exists()) {
        const existingChatData = chatSnap.data() as ChatMetadata;
        // If gigIdForContext is provided and different from existing, or if no gigId exists, update it.
        if (gigIdForContext && existingChatData.gigId !== gigIdForContext) {
            await updateDoc(chatDocRef, { gigId: gigIdForContext, updatedAt: serverTimestamp() });
        } else if (gigIdForContext && !existingChatData.gigId) {
             await updateDoc(chatDocRef, { gigId: gigIdForContext, updatedAt: serverTimestamp() });
        }
        setSelectedChatId(chatId);
        return chatId;
      } else {
        const newChatData: Omit<ChatMetadata, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp'> & { id: string, createdAt: any, updatedAt: any, lastMessageTimestamp: any } = {
          id: chatId,
          participants: [user.uid, targetUserId],
          participantUsernames: {
            [user.uid]: userProfile.username || user.email?.split('@')[0] || 'Me',
            [targetUserId]: targetUsername,
          },
          lastMessage: 'Chat started.',
          lastMessageTimestamp: serverTimestamp(),
          lastMessageSenderId: user.uid,
          lastMessageReadBy: [user.uid],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
         if (gigIdForContext) {
            newChatData.gigId = gigIdForContext;
        }

        const participantPictures: { [key: string]: string } = {};
        if (userProfile.profilePictureUrl) {
          participantPictures[user.uid] = userProfile.profilePictureUrl;
        }
        if (targetProfilePictureUrl) { 
          participantPictures[targetUserId] = targetProfilePictureUrl;
        }
        if (Object.keys(participantPictures).length > 0) {
          newChatData.participantProfilePictures = participantPictures;
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
  }, [user, userProfile, toast]);


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
      router.replace('/chat', { scroll: false }); 
    } else if (preselectChatId) {
        setSelectedChatId(preselectChatId);
        if (searchParams.has('chatId') && typeof window !== 'undefined') {
             router.replace('/chat', { scroll: false });
        }
        return;
    } else if (targetUserId && user.uid !== targetUserId) {
      const fetchTargetUserAndCreateChat = async () => {
        if (!db) {
            toast({ title: "Database Error", description: "Firestore not available for chat.", variant: "destructive" });
            return;
        }
        const targetUserDocRef = doc(db, 'users', targetUserId);
        const targetUserSnap = await getDoc(targetUserDocRef);
        if (targetUserSnap.exists()) {
          const targetUserData = targetUserSnap.data() as UserProfile;
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
    // Firestore query requires an index on 'chats' collection: participants (array-contains), updatedAt (descending)
    // Create it via the link in the Firebase console error message if it's missing.
    // Link: https://console.firebase.google.com/v1/r/project/YOUR_PROJECT_ID/firestore/indexes?create_composite=Ckxwcm9qZWN0cy9YOUR_PROJECT_IDL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9jaGF0cy9pbmRleGVzL18QARoQDAxwYXJ0aWNpcGFudHMYARoNCgl1cGRhdGVkQXQQAhocCghfX25hbWVfXxAC
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
      const fetchedChats = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ChatMetadata[];
      setChats(fetchedChats);
      setIsLoadingChats(false);
    }, (error) => {
      console.error("Error fetching chat list:", error);
      toast({ title: "Chat List Error", description: "Could not load your conversations. This may be due to a missing Firestore index. Please check your Firebase console.", variant: "destructive" });
      setIsLoadingChats(false);
    });

    return () => unsubscribe();
  }, [user, toast]);

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
    if (!authLoading && !user) {
       router.push('/auth/login?redirect=/chat');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);


  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setSelectedFile(null);
    setUploadProgress(null);
    setShowEmojiPicker(false);
    // If a share was pending, selecting a new chat should ideally confirm or clear it.
    // For now, a pending share will persist until sent or cancelled.
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({ title: "File Too Large", description: "Please select a file smaller than 10MB.", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      setMessage(''); 
      setPendingShareData(null); // Clear pending share if a file is selected
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prevMessage => prevMessage + emojiData.emoji);
  };

  const handleSendMessage = async (
    isRequestingDetails: boolean = false, 
    isSharingDetails: boolean = false,
    sharedDetails?: { email?: string, phone?: string }
    ) => {
    if ((!message.trim() && !selectedFile && !pendingShareData && !isRequestingDetails && !isSharingDetails) || !selectedChatId || !user || !userProfile || !db ) {
        toast({ title: "Cannot Send", description: "Message is empty or chat session is invalid.", variant: "destructive"});
        return;
    }
    if (!storage && selectedFile) {
        toast({ title: "Storage Error", description: "Firebase Storage is not configured or available. Cannot upload file. Check Firebase setup. If on Spark plan, ensure it allows Storage configuration or upgrade to Blaze plan if Rules tab is inaccessible.", variant: "destructive", duration: 15000 });
        console.error("Firebase Storage object is null or undefined. Check Firebase configuration and initialization.");
        setIsSending(false); 
        return;
    }
    setIsSending(true);
    setUploadProgress(null);
    setShowEmojiPicker(false);

    let mediaUrl: string | undefined = undefined;
    let mediaType: string | undefined = undefined;

    if (selectedFile && storage) {
      try {
        const file = selectedFile;
        const filePath = `chat_attachments/${selectedChatId}/${Date.now()}_${file.name}`;
        const fileStorageRefInstance = storageRefFn(storage, filePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, file);
        console.log("Chat File Upload: Task created for path", filePath);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              console.log('Upload is ' + progress + '% done. State: ' + snapshot.state);
            },
            (error: any) => {
              console.error("Firebase Storage Upload Error (chat):", error);
              console.error("Full Error Object:", JSON.stringify(error, null, 2));
              console.error("Error serverResponse (if any):", error.serverResponse);
              
              let detailedErrorMessage = `Could not upload file. Code: ${error.code || 'UNKNOWN'}. Message: ${error.message || 'No message'}.`;
              let toastTitle = "Upload Failed";
              let duration = 15000;

              switch (error.code) {
                case 'storage/unauthorized': 
                  detailedErrorMessage = "Upload failed: Permission denied. CRITICAL: Check Firebase Storage rules in your Firebase project console. Ensure they allow authenticated users to write to 'chat_attachments/{chatId}/...'. Also check login status. If on Spark plan and cannot access Rules tab, you may need to upgrade to Blaze plan for full Storage functionality."; 
                  break;
                case 'storage/canceled': detailedErrorMessage = "Upload canceled by the user."; break;
                case 'storage/object-not-found': detailedErrorMessage = "Upload failed: The file path may be incorrect or the object does not exist. This can sometimes indicate a configuration issue with the storage bucket itself or incorrect rules."; break;
                case 'storage/bucket-not-found': detailedErrorMessage = "Upload failed: The Firebase Storage bucket configured in your project does not exist or is not accessible. Verify your `storageBucket` setting in firebase config and that Storage is enabled in Firebase Console."; break;
                case 'storage/project-not-found': detailedErrorMessage = "Upload failed: The Firebase project configured does not exist. Verify your Firebase project settings."; break;
                case 'storage/quota-exceeded': detailedErrorMessage = "Upload failed: Your Firebase Storage quota has been exceeded. Please upgrade your plan or free up space."; break;
                case 'storage/retry-limit-exceeded': detailedErrorMessage = "Upload failed after multiple retries. Check network connection and Firebase Storage status."; break;
                case 'storage/invalid-argument': detailedErrorMessage = "Upload failed: Invalid argument provided to storage operation. This might be an issue with the file path or metadata."; break;
                default:
                  if (error.message && (error.message.toLowerCase().includes('network request failed') || error.message.toLowerCase().includes('net::err_failed')) || error.code === 'storage/unknown' || !error.code) {
                    toastTitle = "Network Error During Upload";
                    detailedErrorMessage = `Upload failed due to a network issue (e.g., net::ERR_FAILED). Please check your internet connection and browser's Network tab for more details on the specific request. Also, verify CORS configuration for your Firebase Storage bucket if this persists. Ensure Firebase Storage is enabled and rules are set in your Firebase project. Raw error: ${error.message || 'Unknown network error'}`;
                    duration = 20000; 
                  } else {
                    detailedErrorMessage = `An unknown error occurred during upload (Code: ${error.code || 'N/A'}). Please check your network connection, Firebase Storage rules in Firebase Console, and ensure your Firebase project plan supports Storage operations (e.g., Blaze plan if Spark plan's Rules tab is inaccessible). Server response (if any): ${error.serverResponse || 'N/A'}`; 
                  }
                  break;
              }
              toast({ 
                  id: `chat-file-upload-failed-${error.code || 'unknown'}`,
                  title: toastTitle, 
                  description: detailedErrorMessage, 
                  variant: "destructive", 
                  duration: duration 
              });
              reject(error);
            },
            async () => {
              console.log('Upload task completed. Getting download URL...');
              try {
                mediaUrl = await getDownloadURL(uploadTask.snapshot.ref);
                mediaType = file.type;
                console.log('Download URL obtained:', mediaUrl);
                resolve();
              } catch (urlError: any) {
                console.error("Error getting download URL:", urlError);
                toast({ title: "Upload Failed", description: `File uploaded, but could not get URL: ${urlError.message}`, variant: "destructive", duration: 10000 });
                reject(urlError);
              }
            }
          );
        });
      } catch (error) {
        console.error("Outer catch for upload process (chat):", error);
        setIsSending(false);
        setUploadProgress(null);
        if (!toast.isActive(`upload-error-${selectedChatId}`)) { // Check if a more specific toast was already shown
            toast({ id: `upload-error-${selectedChatId}`, title: "Upload Process Failed", description: "An unexpected error occurred during file upload. Check console for details.", variant: "destructive" });
        }
        return;
      }
    }

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
    
    if (mediaUrl) {
      newMessageContent.mediaUrl = mediaUrl;
      newMessageContent.mediaType = mediaType;
      if (!lastMessageText) { 
        lastMessageText = `Attachment: ${selectedFile?.name || 'file'}`;
      } else { 
        lastMessageText += ` (Attachment: ${selectedFile?.name || 'file'})`;
      }
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
      setSelectedFile(null);
      setPendingShareData(null); 
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Send Error", description: "Could not send message.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  if (authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    // This will be handled by the useEffect which calls router.push
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><p>Redirecting to login...</p></div>;
  }
  
  const selectedChatDetails = chats.find(c => c.id === selectedChatId);
  const otherUserId = selectedChatDetails?.participants.find(pId => pId !== user.uid);
  const otherUsername = otherUserId ? selectedChatDetails?.participantUsernames[otherUserId] : 'User';
  const otherUserProfilePicture = otherUserId ? selectedChatDetails?.participantProfilePictures?.[otherUserId] : undefined;

  const canShareDetails = userProfile?.role === 'client' &&
                          currentGigForChat?.status === 'in-progress' &&
                          currentGigForChat?.selectedStudentId === otherUserId &&
                          (!!userProfile?.personalEmail || !!userProfile?.personalPhone);

  const canRequestDetails = userProfile?.role === 'student' &&
                            currentGigForChat?.status === 'in-progress' &&
                            currentGigForChat?.selectedStudentId === user.uid;



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
        <ScrollArea className="flex-grow">
          <CardContent className="p-2 space-y-1">
            {isLoadingChats && (
              <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
            )}
            {!isLoadingChats && chats.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">No active conversations. Start one!</p>
            )}
            {chats.map((chat) => {
              const otherParticipantId = chat.participants.find(pId => pId !== user.uid);
              const chatPartnerUsername = otherParticipantId ? chat.participantUsernames[otherParticipantId] : 'Unknown User';
              const partnerProfilePic = otherParticipantId ? chat.participantProfilePictures?.[otherParticipantId] : undefined;
              const isUnread = chat.lastMessageSenderId && chat.lastMessageSenderId !== user.uid && (!chat.lastMessageReadBy || !chat.lastMessageReadBy.includes(user.uid));

              return (
                <div
                  key={chat.id}
                  className={`p-3 rounded-md cursor-pointer hover:bg-accent/50 flex items-center gap-3 relative ${selectedChatId === chat.id ? 'bg-accent' : ''} ${isUnread ? 'font-semibold' : ''}`}
                  onClick={() => handleSelectChat(chat.id)}
                >
                  {isUnread && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 bg-primary rounded-full"></span>
                  )}
                  <Avatar className="h-10 w-10 ml-2">
                    <AvatarImage src={partnerProfilePic} alt={chatPartnerUsername} />
                    <AvatarFallback>{chatPartnerUsername?.substring(0,1).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-grow overflow-hidden">
                    {otherParticipantId ? (
                       <Link href={`/profile/${otherParticipantId}`} passHref
                          onClick={(e) => e.stopPropagation()} // Prevent chat selection when clicking username
                       >
                         <p className={`text-sm truncate hover:underline ${isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>{chatPartnerUsername}</p>
                       </Link>
                    ) : (
                       <p className={`text-sm truncate ${isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>{chatPartnerUsername}</p>
                    )}
                    <p className={`text-xs truncate ${isUnread ? 'text-foreground/80' : 'text-muted-foreground/80'}`}>{chat.lastMessage}</p>
                     <p className="text-xs text-muted-foreground/70">
                        {chat.lastMessageTimestamp && typeof chat.lastMessageTimestamp.toDate === 'function' ? formatDistanceToNow(chat.lastMessageTimestamp.toDate(), { addSuffix: true }) : (chat.createdAt && typeof chat.createdAt.toDate === 'function' ? formatDistanceToNow(chat.createdAt.toDate(), {addSuffix: true}) : '')}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </ScrollArea>
      </Card>

      <Card className={cn(
        "flex-grow glass-card flex flex-col h-full relative",
        !selectedChatId && 'hidden md:flex'
        )}>
        {selectedChatId && selectedChatDetails ? (
          <>
            <CardHeader className="border-b flex flex-row items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setSelectedChatId(null)}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar className="h-10 w-10">
                    <AvatarImage src={otherUserProfilePicture} alt={otherUsername} />
                    <AvatarFallback>{otherUsername?.substring(0,1).toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <div>
                    <CardTitle className="text-base">{otherUsername}</CardTitle>
                    {currentGigForChat?.title && (
                        <Link href={`/gigs/${currentGigForChat.id}`} className="text-xs text-primary hover:underline">
                            Gig: {currentGigForChat.title}
                        </Link>
                    )}
                </div>
              </div>
               {/* Share/Request Details Buttons */}
               <div className="flex gap-2">
                {canShareDetails && userProfile && (
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm"><ShareIcon className="mr-2 h-4 w-4" /> Share Contact</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Share Personal Contact Details?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You are about to share the following details with {otherUsername}:
                                {userProfile.personalEmail && <div className="mt-2">Email: {userProfile.personalEmail}</div>}
                                {userProfile.personalPhone && <div>Phone: {userProfile.personalPhone}</div>}
                                This cannot be undone.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleSendMessage(false, true, {email: userProfile.personalEmail, phone: userProfile.personalPhone})}>
                                Share Now
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
                {canRequestDetails && (
                    <Button variant="outline" size="sm" onClick={() => handleSendMessage(true, false)}>
                        <Info className="mr-2 h-4 w-4" /> Request Contact
                    </Button>
                )}
               </div>
            </CardHeader>
            <ScrollArea className="flex-grow p-0">
              <CardContent className="p-4 space-y-4">
                {isLoadingMessages && <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`p-3 rounded-lg max-w-[70%] shadow-sm ${
                        msg.senderId === user?.uid
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary dark:bg-muted'
                      }`}
                    >
                       {msg.isDetailShareRequest && (
                         <div className="p-2.5 my-1 rounded-md border border-border bg-background/70 text-sm">
                            <p className="font-semibold">{msg.text || "Contact details request"}</p>
                         </div>
                       )}
                       {msg.isDetailsShared && msg.sharedContactInfo && (
                        <div className={`p-2.5 my-1 rounded-md border ${msg.senderId === user?.uid ? 'border-primary-foreground/30 bg-primary/80' : 'border-border bg-background/70'}`}>
                            <p className="text-xs font-medium mb-1">{msg.sharedContactInfo.note || "Contact Information:"}</p>
                            {msg.sharedContactInfo.email && (
                                <div className="flex items-center gap-1.5 text-sm">
                                   <MailIcon className={`h-3.5 w-3.5 ${msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} /> 
                                   <span>{msg.sharedContactInfo.email}</span>
                                </div>
                            )}
                            {msg.sharedContactInfo.phone && (
                                <div className="flex items-center gap-1.5 text-sm mt-0.5">
                                   <Phone className={`h-3.5 w-3.5 ${msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} /> 
                                   <span>{msg.sharedContactInfo.phone}</span>
                                </div>
                            )}
                             {msg.text && msg.text !== (msg.sharedContactInfo.note || "Here are my contact details:") && <p className="text-sm mt-1.5 pt-1.5 border-t border-dashed">{msg.text}</p>}
                        </div>
                       )}

                      {msg.sharedGigId && msg.sharedGigTitle && (
                        <Link href={`/gigs/${msg.sharedGigId}`} target="_blank" rel="noopener noreferrer"
                              className={`block p-2.5 my-1 rounded-md border hover:shadow-md transition-shadow ${msg.senderId === user?.uid ? 'border-primary-foreground/30 bg-primary/80 hover:bg-primary/70' : 'border-border bg-background/70 hover:bg-accent/70'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <Link2 className={`h-4 w-4 ${msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} />
                            <h4 className={`font-semibold text-sm ${msg.senderId === user?.uid ? 'text-primary-foreground' : 'text-foreground'}`}>{msg.sharedGigTitle}</h4>
                          </div>
                          <p className={`text-xs ${msg.senderId === user?.uid ? 'text-primary-foreground/90 hover:text-primary-foreground underline' : 'text-primary hover:underline'}`}>
                            View Gig Details
                          </p>
                        </Link>
                      )}
                      {msg.text && !msg.isDetailShareRequest && !msg.isDetailsShared && (!msg.sharedGigId) && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                      {msg.mediaUrl && msg.mediaType?.startsWith('image/') && (
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                          <img src={msg.mediaUrl} alt="Uploaded media" className="max-w-xs max-h-64 object-contain rounded-md mt-1 cursor-pointer hover:opacity-80" data-ai-hint="chat image" />
                        </a>
                      )}
                      {msg.mediaUrl && !msg.mediaType?.startsWith('image/') && (
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className={`mt-1 block ${msg.senderId === user?.uid ? 'text-primary-foreground/90 hover:text-primary-foreground' : 'text-accent-foreground hover:text-accent-foreground/80'} underline`}>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-black/10 dark:bg-white/10">
                            <FileIcon className="h-5 w-5" />
                            <span className="text-sm">View Attachment ({msg.mediaType || 'file'})</span>
                          </div>
                        </a>
                      )}
                      <p className={`text-xs mt-1 text-right ${msg.senderId === user?.uid ? 'text-primary-foreground/70' : 'text-muted-foreground/80'}`}>
                        {msg.timestamp && typeof msg.timestamp.toDate === 'function' ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
                {!isLoadingMessages && messages.length === 0 && (
                    <p className="text-center text-muted-foreground pt-10">Send a message or attachment to start the conversation.</p>
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
              {selectedFile && (
                <div className="mb-2 p-2 border rounded-md w-full flex items-center justify-between bg-muted/50">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {selectedFile.type.startsWith('image/') ? <ImageIconLucide className="h-5 w-5 text-muted-foreground" /> : <FileIcon className="h-5 w-5 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground truncate">{selectedFile.name}</span>
                    {uploadProgress !== null && <span className="text-xs text-primary">({uploadProgress.toFixed(0)}%)</span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedFile(null); setUploadProgress(null); if(fileInputRef.current) fileInputRef.current.value = ""; }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {uploadProgress !== null && uploadProgress < 100 && (
                 <Progress value={uploadProgress} className="w-full h-2 mb-2" />
              )}
              <div className="flex gap-2 w-full">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEmojiPicker(prev => !prev)}
                  disabled={isSending || (uploadProgress !== null && uploadProgress < 100)}
                  title="Add emoji"
                >
                    <Smile className="h-5 w-5" />
                    <span className="sr-only">Add emoji</span>
                </Button>
                <Input
                  type="text"
                  placeholder={pendingShareData ? "Add a caption (optional)..." : (selectedFile ? "Add a caption (optional)..." : "Type your message...")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !isSending && handleSendMessage()}
                  disabled={isSending || (uploadProgress !== null && uploadProgress < 100)}
                />
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt,.zip" />
                 <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isSending || (uploadProgress !== null && uploadProgress < 100) || !!pendingShareData} title="Attach file">
                    <Paperclip className="h-5 w-5" />
                    <span className="sr-only">Attach file</span>
                 </Button>
                <Button onClick={() => handleSendMessage()} disabled={isSending || (!message.trim() && !selectedFile && !pendingShareData) || (uploadProgress !== null && uploadProgress < 100)} title={pendingShareData ? "Send Gig" : "Send message"}>
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
