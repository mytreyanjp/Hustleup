
"use client";

import { useFirebase } from '@/context/firebase-context';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Send, UserCircle, ArrowLeft, Paperclip, Image as ImageIconLucide, FileText as FileIcon, X, Smile } from 'lucide-react';
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
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Renamed 'ref' to 'storageRefFn'
import { getChatId, cn } from '@/lib/utils';
import type { UserProfile } from '@/context/firebase-context';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import EmojiPicker, { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import { useTheme } from 'next-themes';
import type { ChatMessage, ChatMetadata } from '@/types/chat';
import { Progress } from '@/components/ui/progress';


export default function ChatPage() {
  const { user, userProfile, loading: authLoading, totalUnreadChats } = useFirebase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { theme: appTheme } = useTheme();

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);


  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [targetUserForNewChat, setTargetUserForNewChat] = useState<UserProfile | null>(null);

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


  const getOrCreateChat = useCallback(async (targetUserId: string, targetUsername: string, targetProfilePictureUrl?: string, gigId?: string) => {
    if (!user || !userProfile || !db) return null;

    const chatId = getChatId(user.uid, targetUserId);
    const chatDocRef = doc(db, 'chats', chatId);

    try {
      const chatSnap = await getDoc(chatDocRef);
      if (chatSnap.exists()) {
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
          ...(gigId && { gigId }),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

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
    const gigId = searchParams.get('gigId');
    const preselectChatId = searchParams.get('chatId');

    if (preselectChatId) {
        setSelectedChatId(preselectChatId);
        if (typeof window !== 'undefined') router.replace('/chat', { scroll: false });
        return;
    }

    if (targetUserId && user.uid !== targetUserId) {
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
          await getOrCreateChat(targetUserId, targetUserData.username || 'User', targetUserData.profilePictureUrl, gigId || undefined);
        } else {
          console.error("Target user for chat not found.");
          toast({ title: "User Not Found", description: "The user you're trying to chat with doesn't exist.", variant: "destructive" });
        }
         if (typeof window !== 'undefined') router.replace('/chat', { scroll: false });
      };
      fetchTargetUserAndCreateChat();
    }
  }, [searchParams, user, userProfile, authLoading, getOrCreateChat, router, toast]);


  useEffect(() => {
    if (!user || !db) {
      setIsLoadingChats(false);
      setChats([]);
      return;
    }
    setIsLoadingChats(true);
    // IMPORTANT: This query requires a composite index in Firestore for optimal performance:
    // Collection: 'chats', Fields: 'participants' (Array Contains), 'updatedAt' (Descending)
    // Create Index Link: https://console.firebase.google.com/v1/r/project/YOUR_PROJECT_ID/firestore/indexes?create_composite=Ckxwcm9qZWN0cy9YOUR_PROJECT_IDL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9jaGF0cy9pbmRleGVzL18QARoQIAx2FydGljaXBhbnRzGAEaDQoJdXBkYXRlZEF0EAIaDAoIX19uYW1lX18QAg
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
            console.log(`Marking chat ${selectedChatId} as read by ${user.uid}`);
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
      if (typeof window !== 'undefined') router.push('/auth/login?redirect=/chat');
    }
  }, [user, authLoading, router]);


  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setSelectedFile(null);
    setUploadProgress(null);
    setShowEmojiPicker(false);
    setMessage('');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({ title: "File Too Large", description: "Please select a file smaller than 10MB.", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      setMessage(''); // Clear message when file is selected
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prevMessage => prevMessage + emojiData.emoji);
  };

  const handleSendMessage = async () => {
    if ((!message.trim() && !selectedFile) || !selectedChatId || !user || !userProfile || !db ) {
        toast({ title: "Cannot Send", description: "Message is empty or chat session is invalid.", variant: "destructive"});
        return;
    }
    if (!storage && selectedFile) {
        toast({ title: "Storage Error", description: "Firebase Storage is not configured or available. Cannot upload file. Check Firebase setup. If on Spark plan, ensure it allows Storage configuration or upgrade.", variant: "destructive", duration: 10000 });
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
        const fileStorageRef = storageRefFn(storage, filePath); // Use renamed import
        const uploadTask = uploadBytesResumable(fileStorageRef, file);
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
              console.error("Error Code:", error.code);
              console.error("Error Message:", error.message);
              if (error.serverResponse) {
                console.error("Server Response:", error.serverResponse);
              }
              console.error("Full Error Object:", JSON.stringify(error, null, 2));
              
              let detailedErrorMessage = `Could not upload file. Code: ${error.code || 'UNKNOWN'}. Message: ${error.message || 'No message'}.`;
              switch (error.code) {
                case 'storage/unauthorized': detailedErrorMessage = "Upload failed: Permission denied. CRITICAL: Check Firebase Storage rules in your Firebase project console. Ensure they allow authenticated users to write to 'chat_attachments/{chatId}/...'. If on Spark plan and cannot access Rules tab, you may need to upgrade to Blaze plan for full Storage functionality."; break;
                case 'storage/canceled': detailedErrorMessage = "Upload canceled."; break;
                case 'storage/object-not-found': detailedErrorMessage = "Upload failed: File path may be incorrect or the object does not exist (check bucket/rules)."; break;
                case 'storage/bucket-not-found': detailedErrorMessage = "Upload failed: Storage bucket not found. Verify Firebase config (storageBucket value)."; break;
                case 'storage/project-not-found': detailedErrorMessage = "Upload failed: Firebase project not found. Verify Firebase config."; break;
                case 'storage/quota-exceeded': detailedErrorMessage = "Upload failed: Storage quota exceeded."; break;
                case 'storage/unknown': default: detailedErrorMessage = `An unknown error occurred during upload (Code: ${error.code || 'N/A'}). Please check your network connection, Firebase Storage rules in Firebase Console, and ensure your Firebase project plan supports Storage operations. Server response (if any): ${error.serverResponse || 'N/A'}`; break;
              }
              toast({ title: "Upload Failed", description: detailedErrorMessage, variant: "destructive", duration: 15000 });
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
        setIsSending(false);
        setUploadProgress(null);
        return;
      }
    }

    const newMessageContent: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp: any } = {
      senderId: user.uid,
      timestamp: serverTimestamp(),
    };

    if (message.trim()) newMessageContent.text = message.trim();
    if (mediaUrl) newMessageContent.mediaUrl = mediaUrl;
    if (mediaType) newMessageContent.mediaType = mediaType;

    try {
      const chatDocRef = doc(db, 'chats', selectedChatId);
      const messagesColRef = collection(chatDocRef, 'messages');

      const batch = writeBatch(db);
      batch.set(doc(messagesColRef), newMessageContent);

      const chatUpdateData: Partial<ChatMetadata> & {updatedAt: any, lastMessageTimestamp: any} = {
        lastMessage: message.trim() || (selectedFile ? `Attachment: ${selectedFile.name}` : 'New message'),
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
        lastMessageReadBy: [user.uid], // Sender has read it
        [`participantUsernames.${user.uid}`]: userProfile.username || user.email?.split('@')[0] || 'User',
      };

      if (userProfile.profilePictureUrl) { 
        const currentChat = chats.find(c => c.id === selectedChatId);
        const existingPictures = currentChat?.participantProfilePictures || {};
        chatUpdateData.participantProfilePictures = {
          ...existingPictures,
          [user.uid]: userProfile.profilePictureUrl,
        };
      }

      batch.update(chatDocRef, chatUpdateData);

      await batch.commit();
      setMessage('');
      setSelectedFile(null);
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
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><p>Redirecting to login...</p></div>;
  }

  const selectedChatDetails = chats.find(c => c.id === selectedChatId);
  const otherUserId = selectedChatDetails?.participants.find(pId => pId !== user.uid);
  const otherUsername = otherUserId ? selectedChatDetails?.participantUsernames[otherUserId] : 'User';
  const otherUserProfilePicture = otherUserId ? selectedChatDetails?.participantProfilePictures?.[otherUserId] : undefined;


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
                    <p className={`text-sm truncate ${isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>{chatPartnerUsername}</p>
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
                    {selectedChatDetails.gigId && (
                        <Link href={`/gigs/${selectedChatDetails.gigId}`} className="text-xs text-primary hover:underline">
                            View Gig Details
                        </Link>
                    )}
                </div>
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
                      {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
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
                  placeholder={selectedFile ? "Add a caption (optional)..." : "Type your message..."}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !isSending && handleSendMessage()}
                  disabled={isSending || (uploadProgress !== null && uploadProgress < 100)}
                />
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt,.zip" />
                 <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isSending || (uploadProgress !== null && uploadProgress < 100)} title="Attach file">
                    <Paperclip className="h-5 w-5" />
                    <span className="sr-only">Attach file</span>
                 </Button>
                <Button onClick={handleSendMessage} disabled={isSending || (!message.trim() && !selectedFile) || (uploadProgress !== null && uploadProgress < 100)} title="Send message">
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="sr-only">Send</span>
                </Button>
              </div>
            </CardFooter>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
                {isLoadingChats ? 'Loading conversations...' : (searchParams.get('userId') ? 'Setting up your chat...' : 'Select a conversation to start chatting.')}
            </p>
            {targetUserForNewChat && !selectedChatId && (
                 <p className="text-sm mt-2">Starting chat with {targetUserForNewChat.username}...</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
