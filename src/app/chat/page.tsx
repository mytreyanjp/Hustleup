"use client";

import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Send } from 'lucide-react';

// TODO: Implement real-time chat fetching and sending using Firestore or Realtime Database

export default function ChatPage() {
  const { user, loading, role } = useFirebase();
  const router = useRouter();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Placeholder data - replace with actual chat data fetching
  const [chats, setChats] = useState<any[]>([]); // Array of chat metadata { id, otherUserName, lastMessage, timestamp }
  const [messages, setMessages] = useState<any[]>([]); // Array of messages for selected chat { id, senderId, text, timestamp }

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
    // TODO: Fetch chat list for the current user
     // Example: Fetch chats where user.uid is in participants array
     // setChats([...fetchedChats]);
  }, [user, loading, router]);

   useEffect(() => {
     if (selectedChatId) {
       // TODO: Fetch messages for the selected chat ID
       // Set up a real-time listener for new messages
       // setMessages([...fetchedMessages]);
       console.log(`Fetching messages for chat: ${selectedChatId}`);
        // Placeholder messages
       setMessages([
          { id: '1', senderId: 'otherUser', text: 'Hi there!', timestamp: new Date() },
          { id: '2', senderId: user?.uid, text: 'Hello! How can I help?', timestamp: new Date() },
       ]);
     } else {
       setMessages([]);
     }
      // TODO: Clean up listener on unmount or when selectedChatId changes
   }, [selectedChatId, user?.uid]);

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
  };

  const handleSendMessage = async () => {
     if (!message.trim() || !selectedChatId || !user) return;
     setIsSending(true);
     console.log(`Sending message: "${message}" to chat: ${selectedChatId}`);
     // TODO: Implement sending message to Firestore/Realtime DB
     // Add message to the 'messages' subcollection of the selected chat document
     // Use senderId: user.uid, text: message, timestamp: serverTimestamp()
     try {
       // await sendMessageToDb(selectedChatId, user.uid, message);
        setMessage(''); // Clear input after sending
     } catch (error) {
        console.error("Error sending message:", error);
        // Show toast notification
     } finally {
        setIsSending(false);
     }
  };


  if (loading) {
     return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-10rem)]">
      {/* Chat List Sidebar */}
       <Card className="w-full md:w-1/3 lg:w-1/4 glass-card flex flex-col">
         <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <MessageSquare className="h-5 w-5" /> Conversations
           </CardTitle>
         </CardHeader>
         <CardContent className="flex-grow overflow-y-auto p-2 space-y-1">
           {/* Placeholder Chat List Items */}
           {chats.length === 0 && !loading && (
             <p className="text-sm text-muted-foreground p-4 text-center">No active conversations.</p>
           )}
            {/* Example list item */}
           <div
             className={`p-3 rounded-md cursor-pointer hover:bg-accent/50 ${selectedChatId === 'chat1' ? 'bg-accent' : ''}`}
             onClick={() => handleSelectChat('chat1')}
           >
             <p className="font-medium">Client/Student Name</p>
             <p className="text-xs text-muted-foreground truncate">Last message preview...</p>
           </div>
           {/* TODO: Map through actual chats */}
           {chats.map((chat) => (
             <div
               key={chat.id}
               className={`p-3 rounded-md cursor-pointer hover:bg-accent/50 ${selectedChatId === chat.id ? 'bg-accent' : ''}`}
               onClick={() => handleSelectChat(chat.id)}
             >
               <p className="font-medium">{chat.otherUserName}</p>
               <p className="text-xs text-muted-foreground truncate">{chat.lastMessage}</p>
             </div>
           ))}
         </CardContent>
       </Card>

      {/* Chat Message Area */}
       <Card className="flex-grow glass-card flex flex-col h-full">
         {selectedChatId ? (
           <>
             <CardHeader className="border-b">
               {/* TODO: Get actual chat partner name */}
               <CardTitle>Chat with [Partner Name]</CardTitle>
             </CardHeader>
             <CardContent className="flex-grow overflow-y-auto p-4 space-y-4">
                {/* Placeholder Messages */}
                {messages.map((msg) => (
                   <div
                     key={msg.id}
                     className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
                   >
                     <div
                       className={`p-3 rounded-lg max-w-[70%] ${
                         msg.senderId === user?.uid
                           ? 'bg-primary text-primary-foreground'
                           : 'bg-secondary'
                       }`}
                     >
                       <p className="text-sm">{msg.text}</p>
                        <p className="text-xs text-muted-foreground/80 mt-1 text-right">
                            {/* TODO: Format timestamp properly */}
                           {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </p>
                     </div>
                   </div>
                 ))}
                 {messages.length === 0 && (
                     <p className="text-center text-muted-foreground pt-10">Send a message to start the conversation.</p>
                 )}
             </CardContent>
             <div className="p-4 border-t">
                <div className="flex gap-2">
                 <Input
                   placeholder="Type your message..."
                   value={message}
                   onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isSending && handleSendMessage()}
                 />
                 <Button onClick={handleSendMessage} disabled={isSending || !message.trim()}>
                   {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                 </Button>
                </div>
             </div>
           </>
         ) : (
           <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
             <p className="text-muted-foreground">Select a conversation to start chatting.</p>
           </div>
         )}
       </Card>
    </div>
  );
}
