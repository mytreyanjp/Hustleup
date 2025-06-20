
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
  // Fields for sharing personal contact details
  isDetailShareRequest?: boolean; // Student requests details
  isDetailsShared?: boolean;      // Client shares details
  sharedContactInfo?: {
    email?: string;
    phone?: string;
    note?: string; // Optional note from client when sharing
  };
  messageType?: 'user' | 'system_request_accepted' | 'system_request_rejected' | 'system_gig_connection_activated' | 'system_admin_reply_received' | 'system_user_resolved_issue';

  // New fields for shared profile
  sharedUserId?: string;
  sharedUsername?: string;
  sharedUserProfilePictureUrl?: string;
  sharedUserRole?: 'student' | 'client' | 'admin'; // Added admin

  // Fields for read receipts
  deliveredToRecipientAt?: Timestamp | null;
  readByRecipientAt?: Timestamp | null;
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
  chatStatus?: 'pending_admin_response' | 'accepted' | 'rejected' | 'closed_by_admin' | 'closed_by_user'; // Added 'closed_by_user'
  requestInitiatorId?: string; // UID of the user who sent the request (applies to pending_admin_response)
}
