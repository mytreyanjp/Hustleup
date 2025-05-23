// src/types/chat.ts
import type { Timestamp } from 'firebase/firestore';

export interface ChatMessage {
  id: string;
  senderId: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: Timestamp | null;
}

export interface ChatMetadata {
  id: string;
  participants: string[];
  participantUsernames: { [key: string]: string };
  participantProfilePictures?: { [key: string]: string };
  lastMessage?: string;
  lastMessageTimestamp?: Timestamp | null;
  lastMessageSenderId?: string; // UID of the sender of the last message
  lastMessageReadBy?: string[];   // Array of UIDs who have "seen" the last message for notification purposes
  gigId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
