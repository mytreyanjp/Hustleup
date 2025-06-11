
// src/types/posts.ts
import type { Timestamp } from 'firebase/firestore';

export interface StudentPost {
  id: string;
  studentId: string;
  studentUsername: string; // Denormalized
  studentProfilePictureUrl?: string; // Denormalized
  imageUrl: string;
  caption?: string;
  createdAt: Timestamp;
  likes: string[]; // Array of user UIDs who liked the post
  likeCount: number;
  commentCount: number;
}

export interface Comment {
  id: string; // Firestore document ID
  postId: string;
  userId: string;
  username: string;
  profilePictureUrl?: string;
  text: string;
  createdAt: Timestamp;
  // likes?: string[]; // Future: For comment likes
  // likeCount?: number; // Future: For comment likes
}
