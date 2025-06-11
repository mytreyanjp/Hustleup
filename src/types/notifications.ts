
// src/types/notifications.ts
import type { Timestamp } from 'firebase/firestore';

export type NotificationType =
  | 'gig_closed_due_to_ban'      // For student, when client's gig is closed due to client ban
  | 'student_removed_due_to_ban' // For client, when their selected student is banned
  | 'applicant_removed_due_to_ban' // For client, if an applicant to their gig is banned
  | 'gig_status_update'          // General gig status changes
  | 'new_applicant'              // For client, when a new student applies
  | 'application_status_update'  // For student, when their application status changes
  | 'new_message'                // For user, when they receive a new chat message
  | 'review_received'            // For student, when a client leaves a review
  | 'payment_processed'          // For client/student, regarding payment status
  | 'account_warning'            // Generic account warning from admin
  | 'role_updated'               // When user's role is changed by admin
  | 'payment_released'           // When admin releases payment to student
  | 'report_submitted'           // For client, when student submits a progress report
  | 'report_reviewed'            // For student, when client reviews their report
  | 'report_attachment_deleted'; // For student/client, when admin deletes an attachment from a report

export interface Notification {
  id: string; // Firestore document ID
  recipientUserId: string;
  message: string;
  type: NotificationType;
  relatedGigId?: string;
  relatedGigTitle?: string;
  relatedUserId?: string; // e.g., UID of the user who caused the notification (sender of message, applicant)
  relatedUsername?: string; // e.g., username of relatedUser
  isRead: boolean;
  createdAt: Timestamp;
  link?: string; // Optional direct link for the notification (e.g., to the gig, chat, or profile)
  adminActorId?: string; // UID of the admin who performed an action (if applicable)
  adminActorUsername?: string; // Username of the admin actor (if applicable)
}
