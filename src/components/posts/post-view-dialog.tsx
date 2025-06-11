
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import NextImage from 'next/image';
import { Loader2, Send, MessageCircle, UserCircle } from 'lucide-react';
import { db } from '@/config/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, increment, Timestamp } from 'firebase/firestore';
import type { StudentPost, Comment } from '@/types/posts';
import type { User as FirebaseUser, UserProfile } from '@/context/firebase-context'; // Assuming UserProfile is exported from context
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

interface PostViewDialogProps {
  post: StudentPost | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  viewerUser: FirebaseUser | null;
  viewerUserProfile: UserProfile | null;
  onCommentAdded?: () => void; // Optional callback after comment is added
}

// Simple Mention Renderer (highlights mentions, doesn't link yet)
const MentionRenderer: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;
    const parts = text.split(/(@\w+)/g); // Split by @username
    return (
      <>
        {parts.map((part, index) =>
          part.startsWith('@') ? (
            <strong key={index} className="text-primary font-medium">{part}</strong>
          ) : (
            part
          )
        )}
      </>
    );
};


export function PostViewDialog({ post, isOpen, onOpenChange, viewerUser, viewerUserProfile, onCommentAdded }: PostViewDialogProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!post || !isOpen || !db) {
      setComments([]);
      return;
    }

    setIsLoadingComments(true);
    const commentsQuery = query(
      collection(db, 'student_posts', post.id, 'comments'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const fetchedComments = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Comment[];
      setComments(fetchedComments);
      setIsLoadingComments(false);
    }, (error) => {
      console.error("Error fetching comments:", error);
      toast({ title: "Error", description: "Could not load comments.", variant: "destructive" });
      setIsLoadingComments(false);
    });

    return () => unsubscribe();
  }, [post, isOpen, toast]);

  const handleAddComment = async () => {
    if (!post || !newCommentText.trim() || !viewerUser || !viewerUserProfile || !db) {
      toast({ title: "Cannot Comment", description: "Please log in and write a comment.", variant: "destructive" });
      return;
    }
    setIsSubmittingComment(true);
    try {
      const commentData = {
        postId: post.id,
        userId: viewerUser.uid,
        username: viewerUserProfile.username || viewerUser.email?.split('@')[0] || 'User',
        profilePictureUrl: viewerUserProfile.profilePictureUrl || '',
        text: newCommentText.trim(),
        createdAt: serverTimestamp() as Timestamp,
      };
      await addDoc(collection(db, 'student_posts', post.id, 'comments'), commentData);

      // Update comment count on the post
      const postDocRef = doc(db, 'student_posts', post.id);
      await updateDoc(postDocRef, {
        commentCount: increment(1)
      });

      setNewCommentText('');
      if (onCommentAdded) onCommentAdded();
    } catch (error: any) {
      console.error("Error adding comment:", error);
      toast({ title: "Error", description: `Could not add comment: ${error.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const formatCommentDate = (timestamp?: Timestamp) => {
    if (!timestamp) return 'A moment ago';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  };
  
  const getInitials = (username?: string, email?: string | null) => {
    if (username && username.trim() !== '') return username.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return 'U';
  };


  if (!post) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] sm:h-[80vh] flex flex-col sm:flex-row p-0 gap-0">
        {/* Image Section */}
        <div className="w-full sm:w-1/2 h-1/2 sm:h-full bg-muted relative flex items-center justify-center">
          {post.imageUrl ? (
            <NextImage src={post.imageUrl} alt={post.caption || 'Post image'} layout="fill" objectFit="contain" />
          ) : (
            <UserCircle className="h-24 w-24 text-muted-foreground" />
          )}
        </div>

        {/* Content Section */}
        <div className="w-full sm:w-1/2 h-1/2 sm:h-full flex flex-col">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center gap-3">
                <Link href={`/profile/${post.studentId}`} passHref>
                    <Avatar className="h-10 w-10 cursor-pointer">
                        <AvatarImage src={post.studentProfilePictureUrl} alt={post.studentUsername} />
                        <AvatarFallback>{post.studentUsername?.substring(0,1).toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                </Link>
                <div>
                    <DialogTitle className="text-base">
                         <Link href={`/profile/${post.studentId}`} className="hover:underline">
                            {post.studentUsername}
                         </Link>
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground">
                        Posted {formatCommentDate(post.createdAt)}
                    </p>
                </div>
            </div>
          </DialogHeader>
          
          <ScrollArea className="flex-grow p-4">
            {post.caption && (
              <div className="mb-4 pb-4 border-b border-dashed">
                <p className="text-sm whitespace-pre-wrap">
                    <MentionRenderer text={post.caption}/>
                </p>
              </div>
            )}
            
            <div className="space-y-3">
              {isLoadingComments ? (
                <div className="flex justify-center items-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Be the first!</p>
              ) : (
                comments.map(comment => (
                  <div key={comment.id} className="flex items-start gap-2.5">
                     <Link href={`/profile/${comment.userId}`} passHref>
                        <Avatar className="h-8 w-8 mt-0.5 cursor-pointer">
                        <AvatarImage src={comment.profilePictureUrl} alt={comment.username} />
                        <AvatarFallback>{getInitials(comment.username)}</AvatarFallback>
                        </Avatar>
                    </Link>
                    <div className="flex-grow bg-secondary/50 p-2 rounded-md">
                      <div className="flex items-baseline gap-2">
                         <Link href={`/profile/${comment.userId}`} className="text-xs font-semibold hover:underline">{comment.username}</Link>
                         <span className="text-xs text-muted-foreground">{formatCommentDate(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm mt-0.5 whitespace-pre-wrap">
                         <MentionRenderer text={comment.text}/>
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {viewerUser && (
            <DialogFooter className="p-4 border-t">
              <div className="flex gap-2 w-full items-start">
                <Avatar className="h-9 w-9 mt-1">
                  <AvatarImage src={viewerUserProfile?.profilePictureUrl} alt={viewerUserProfile?.username || 'You'} />
                  <AvatarFallback>{getInitials(viewerUserProfile?.username, viewerUser.email)}</AvatarFallback>
                </Avatar>
                <Textarea
                  placeholder="Write a comment..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  rows={1}
                  className="flex-grow min-h-[40px] max-h-[100px] resize-none text-sm"
                  disabled={isSubmittingComment}
                />
                <Button onClick={handleAddComment} disabled={isSubmittingComment || !newCommentText.trim()} size="icon" className="h-9 w-9 shrink-0">
                  {isSubmittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
