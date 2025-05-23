
"use client";

import { useFirebase } from '@/context/firebase-context';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Send, UserCircle, ArrowLeft, Paperclip, Image as ImageIcon, FileText as FileIcon, UploadCloud, X } from 'lucide-react'; // Added X
import { db, storage } from '@/config/firebase'; // Import storage
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
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getChatId, cn } from '@/lib/utils';
import type { UserProfile } from '@/context/firebase-context';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';


interface ChatMessage {
  id: string;
  senderId: string;
  text?: string; // Text is optional if media is present
  mediaUrl?: string;
  mediaType?: string; // e.g., 'image/png', 'application/pdf'
  timestamp: Timestamp | null;
}

interface ChatMetadata {
  id: string;
  participants: string[];
  participantUsernames: { [key: string]: string };
  participantProfilePictures?: { [key: string]: string };
  lastMessage?: string;
  lastMessageTimestamp?: Timestamp | null;
  gigId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export default function ChatPage() {
  const { user, userProfile, loading: authLoading } = useFirebase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);


  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [targetUserForNewChat, setTargetUserForNewChat] = useState<UserProfile | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages]);

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


  // Effect to handle direct chat initiation from URL
  useEffect(() => {
    if (authLoading || !user || !userProfile) return;

    const targetUserId = searchParams.get('userId');
    const gigId = searchParams.get('gigId');
    const preselectChatId = searchParams.get('chatId');

    if (preselectChatId) {
        setSelectedChatId(preselectChatId);
        router.replace('/chat', { scroll: false });
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
         router.replace('/chat', { scroll: false });
      };
      fetchTargetUserAndCreateChat();
    }
  }, [searchParams, user, userProfile, authLoading, getOrCreateChat, router, toast]);


  // Effect to fetch user's chat list
  useEffect(() => {
    if (!user || !db) {
      setIsLoadingChats(false);
      setChats([]);
      return;
    }
    setIsLoadingChats(true);
    // IMPORTANT: This query requires a composite index in Firestore.
    // Collection: 'chats', Fields: 'participants' (Array Contains), 'updatedAt' (Descending)
    // Example link to create index if Firebase console prompts:
    // https://console.firebase.google.com/v1/r/project/YOUR_PROJECT_ID/firestore/indexes?create_composite=Ckxwcm9qZWN0cy9YOUR_PROJECT_IDL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9jaGF0cy9pbmRleGVzL18QARoQEFBhcnRpY2lwYW50cxgBGg0KCXVwZGF0ZWRBdBACGgwKCF9fbmFtZV9fEAI
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
      toast({ title: "Chat List Error", description: "Could not load your conversations.", variant: "destructive" });
      setIsLoadingChats(false);
    });

    return () => unsubscribe();
  }, [user, toast]);

  // Effect to fetch messages for the selected chat
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

    const unsubscribe = onSnapshot(messagesQuery, (querySnapshot: QuerySnapshot<DocumentData>) => {
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
    
    return () => unsubscribe();
  }, [selectedChatId, user, toast]);

  // Effect to redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user && typeof window !== 'undefined') {
      router.push('/auth/login?redirect=/chat');
    }
  }, [user, authLoading, router]);


  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setSelectedFile(null); // Clear any selected file when switching chats
    setUploadProgress(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({ title: "File Too Large", description: "Please select a file smaller than 10MB.", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      setMessage(''); // Clear text message input when a file is selected for simplicity
    }
  };

  const handleSendMessage = async () => {
    if ((!message.trim() && !selectedFile) || !selectedChatId || !user || !userProfile || !db || !storage) {
        toast({ title: "Cannot Send", description: "Message is empty or chat session is invalid.", variant: "destructive"});
        return;
    }
    setIsSending(true);
    setUploadProgress(null);

    let mediaUrl: string | undefined = undefined;
    let mediaType: string | undefined = undefined;

    if (selectedFile) {
      try {
        const file = selectedFile;
        const filePath = `chat_attachments/${selectedChatId}/${Date.now()}_${file.name}`;
        const fileStorageRef = storageRef(storage, filePath);
        const uploadTask = uploadBytesResumable(fileStorageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            },
            (error) => {
              console.error("Upload error:", error);
              toast({ title: "Upload Failed", description: `Could not upload file: ${error.message}`, variant: "destructive" });
              reject(error);
            },
            async () => {
              mediaUrl = await getDownloadURL(uploadTask.snapshot.ref);
              mediaType = file.type;
              resolve();
            }
          );
        });
      } catch (error) {
        setIsSending(false);
        setUploadProgress(null);
        return; // Stop if upload failed
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
      
      const chatUpdateData: any = {
        lastMessage: message.trim() || (selectedFile ? `Attachment: ${selectedFile.name}` : 'New message'),
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
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
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
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
    // Redirect logic is handled in useEffect
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

              return (
                <div
                  key={chat.id}
                  className={`p-3 rounded-md cursor-pointer hover:bg-accent/50 flex items-center gap-3 ${selectedChatId === chat.id ? 'bg-accent' : ''}`}
                  onClick={() => handleSelectChat(chat.id)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={partnerProfilePic} alt={chatPartnerUsername} />
                    <AvatarFallback>{chatPartnerUsername?.substring(0,1).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-grow overflow-hidden">
                    <p className="font-medium text-sm truncate">{chatPartnerUsername}</p>
                    <p className="text-xs text-muted-foreground truncate">{chat.lastMessage}</p>
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
        "flex-grow glass-card flex flex-col h-full",
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
            <CardFooter className="p-3 border-t flex flex-col items-start"> {/* Changed to flex-col and items-start */}
              {selectedFile && (
                <div className="mb-2 p-2 border rounded-md w-full flex items-center justify-between bg-muted/50">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {selectedFile.type.startsWith('image/') ? <ImageIcon className="h-5 w-5 text-muted-foreground" /> : <FileIcon className="h-5 w-5 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground truncate">{selectedFile.name}</span> 
                    {uploadProgress !== null && <span className="text-xs text-primary">({uploadProgress.toFixed(0)}%)</span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedFile(null); setUploadProgress(null); if(fileInputRef.current) fileInputRef.current.value = ""; }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {uploadProgress !== null && uploadProgress < 100 && (
                 <div className="w-full h-1 bg-secondary rounded-full mb-2 overflow-hidden">
                    <div className="bg-primary h-full transition-all duration-150" style={{width: `${uploadProgress}%`}}></div>
                 </div>
              )}
              <div className="flex gap-2 w-full">
                <Input
                  type="text"
                  placeholder={selectedFile ? "Add a caption (optional)..." : "Type your message..."}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !isSending && handleSendMessage()}
                  disabled={isSending || (uploadProgress !== null && uploadProgress < 100)}
                />
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt,.zip" />
                 <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isSending || (uploadProgress !== null && uploadProgress < 100)}>
                    <Paperclip className="h-5 w-5" />
                    <span className="sr-only">Attach file</span>
                 </Button>
                <Button onClick={handleSendMessage} disabled={isSending || (!message.trim() && !selectedFile) || (uploadProgress !== null && uploadProgress < 100)}>
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

