"use client";

import { useFirebase } from '@/context/firebase-context';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Send, UserCircle, ArrowLeft } from 'lucide-react';
import { db } from '@/config/firebase';
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
import { getChatId, cn } from '@/lib/utils';
import type { UserProfile } from '@/context/firebase-context';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: Timestamp | null;
}

interface ChatMetadata {
  id: string;
  participants: string[];
  participantUsernames: { [key: string]: string };
  participantProfilePictures?: { [key: string]: string }; // Optional, values must not be undefined
  lastMessage?: string;
  lastMessageTimestamp?: Timestamp | null;
  gigId?: string;
  createdAt: Timestamp; // Added createdAt
  updatedAt: Timestamp;
}

export default function ChatPage() {
  const { user, userProfile, loading: authLoading } = useFirebase();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [targetUserForNewChat, setTargetUserForNewChat] = useState<UserProfile | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const getOrCreateChat = useCallback(async (targetUserId: string, targetUsername: string, targetProfilePictureUrl?: string, gigId?: string) => {
    if (!user || !userProfile) return null;

    const chatId = getChatId(user.uid, targetUserId);
    const chatDocRef = doc(db, 'chats', chatId);

    try {
      const chatSnap = await getDoc(chatDocRef);
      if (chatSnap.exists()) {
        setSelectedChatId(chatId);
        return chatId;
      } else {
        // Create new chat
        const participantPictures: { [key: string]: string } = {};
        if (userProfile.profilePictureUrl) {
          participantPictures[user.uid] = userProfile.profilePictureUrl;
        }
        if (targetProfilePictureUrl) {
          participantPictures[targetUserId] = targetProfilePictureUrl;
        }

        const newChatData: ChatMetadata = {
          id: chatId,
          participants: [user.uid, targetUserId],
          participantUsernames: {
            [user.uid]: userProfile.username || user.email?.split('@')[0] || 'Me',
            [targetUserId]: targetUsername,
          },
          participantProfilePictures: participantPictures,
          lastMessage: 'Chat started.',
          lastMessageTimestamp: serverTimestamp() as Timestamp,
          ...(gigId && { gigId }),
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
        };
        await setDoc(chatDocRef, newChatData);
        setSelectedChatId(chatId);
        // Manually add to chats list or wait for listener to pick it up
        setChats(prevChats => [newChatData, ...prevChats.filter(c => c.id !== chatId)].sort((a,b) => (b.lastMessageTimestamp?.toMillis() || 0) - (a.lastMessageTimestamp?.toMillis() || 0)));
        return chatId;
      }
    } catch (error) {
      console.error("Error getting or creating chat:", error);
      // Handle error (e.g., show toast)
      return null;
    }
  }, [user, userProfile]);


  // Effect to handle direct chat initiation from URL
  useEffect(() => {
    if (authLoading || !user || !userProfile) return;

    const targetUserId = searchParams.get('userId');
    const gigId = searchParams.get('gigId');
    const preselectChatId = searchParams.get('chatId');

    if (preselectChatId) {
        setSelectedChatId(preselectChatId);
        // Clear URL params to avoid re-triggering
        router.replace('/chat', undefined);
        return;
    }
    
    if (targetUserId && user.uid !== targetUserId) {
      const fetchTargetUserAndCreateChat = async () => {
        const targetUserDocRef = doc(db, 'users', targetUserId);
        const targetUserSnap = await getDoc(targetUserDocRef);
        if (targetUserSnap.exists()) {
          const targetUserData = targetUserSnap.data() as UserProfile;
          setTargetUserForNewChat(targetUserData);
          await getOrCreateChat(targetUserId, targetUserData.username || 'User', targetUserData.profilePictureUrl, gigId || undefined);
        } else {
          console.error("Target user for chat not found.");
        }
         // Clear URL params after processing
         router.replace('/chat', undefined);
      };
      fetchTargetUserAndCreateChat();
    }
  }, [searchParams, user, userProfile, authLoading, getOrCreateChat, router]);


  // Effect to fetch user's chat list
  useEffect(() => {
    if (!user) {
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
      const fetchedChats = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ChatMetadata[];
      setChats(fetchedChats);
      setIsLoadingChats(false);
    }, (error) => {
      console.error("Error fetching chat list:", error);
      setIsLoadingChats(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Effect to fetch messages for the selected chat
  useEffect(() => {
    if (!selectedChatId || !user) {
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
      scrollToBottom();
    }, (error) => {
      console.error(`Error fetching messages for chat ${selectedChatId}:`, error);
      setIsLoadingMessages(false);
    });
    
    return () => unsubscribe();
  }, [selectedChatId, user]);

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    // If on mobile, URL params might have been cleared, but this is fine
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedChatId || !user || !userProfile) return;
    setIsSending(true);

    const newMessageContent: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp: any } = {
      senderId: user.uid,
      text: message.trim(),
      timestamp: serverTimestamp(),
    };

    try {
      const chatDocRef = doc(db, 'chats', selectedChatId);
      const messagesColRef = collection(chatDocRef, 'messages');
      
      const batch = writeBatch(db);
      batch.set(doc(messagesColRef), newMessageContent);
      
      const chatUpdateData: any = {
        lastMessage: message.trim(),
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
        [`participantUsernames.${user.uid}`]: userProfile.username || user.email?.split('@')[0] || 'User',
      };

      if (userProfile.profilePictureUrl) {
        chatUpdateData[`participantProfilePictures.${user.uid}`] = userProfile.profilePictureUrl;
      }
      // If we wanted to be able to REMOVE a profile picture, we'd need to use FieldValue.delete()
      // but for now, just not setting it if it's undefined is fine.

      batch.update(chatDocRef, chatUpdateData);

      await batch.commit();
      setMessage('');
      scrollToBottom();
    } catch (error) {
      console.error("Error sending message:", error);
      // Show toast notification
    } finally {
      setIsSending(false);
    }
  };

  if (authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    if (!authLoading) router.push('/auth/login?redirect=/chat');
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
        selectedChatId && 'hidden md:flex' // Hide on mobile if a chat is selected
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
              <p className="text-sm text-muted-foreground p-4 text-center">No active conversations. Start one by contacting a student or client!</p>
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
                        {chat.lastMessageTimestamp ? formatDistanceToNow(chat.lastMessageTimestamp.toDate(), { addSuffix: true }) : (chat.createdAt ? formatDistanceToNow(chat.createdAt.toDate(), {addSuffix: true}) : '')}
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
        !selectedChatId && 'hidden md:flex' // Hide on mobile if no chat is selected
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
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      <p className={`text-xs mt-1 text-right ${msg.senderId === user?.uid ? 'text-primary-foreground/70' : 'text-muted-foreground/80'}`}>
                        {msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
                {!isLoadingMessages && messages.length === 0 && (
                    <p className="text-center text-muted-foreground pt-10">Send a message to start the conversation.</p>
                )}
              </CardContent>
            </ScrollArea>
            <CardFooter className="p-3 border-t">
              <div className="flex gap-2 w-full">
                <Input
                  placeholder="Type your message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !isSending && handleSendMessage()}
                  disabled={isSending}
                />
                <Button onClick={handleSendMessage} disabled={isSending || !message.trim()}>
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

// Avatar components are now imported from @/components/ui/avatar
// If the global Avatar component is different, ensure this page uses the correct one.
// For simplicity, assuming global ui/avatar is used.
