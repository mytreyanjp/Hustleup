// src/types/chat.ts
import type { Timestamp } from 'firebase/firestore';

export interface ChatMessage {
  id: string;
  senderId: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: Timestamp | null;
  // Fields for shared gig
  sharedGigId?: string;
  sharedGigTitle?: string;
  // Optional: sharedGigDescriptionSnippet?: string;
  // Optional: sharedGigClientUsername?: string;
}

export interface ChatMetadata {
  id: string;
  participants: string[];
  participantUsernames: { [key: string]: string };
  participantProfilePictures?: { [key: string]: string };
  lastMessage?: string;
  lastMessageTimestamp?: Timestamp | null;
  lastMessageSenderId?: string;
  lastMessageReadBy?: string[];
  gigId?: string; // Original gigId for chat context, not for shared gig message
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
