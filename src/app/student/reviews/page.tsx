
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, MessageCircle, Star, Reply } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { StarRating } from '@/components/ui/star-rating';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface StudentReplyData {
  text: string;
  repliedAt: Timestamp;
}

interface Review {
  id: string;
  gigId: string;
  gigTitle: string;
  clientId: string;
  clientUsername: string;
  clientProfilePictureUrl?: string; // Optional, if clients have profile pics
  rating: number;
  comment?: string;
  createdAt: Timestamp;
  studentReply?: StudentReplyData;
}

export default function StudentReviewsPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyingToReviewId, setReplyingToReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const fetchReviews = useCallback(async () => {
    if (!user || !db) return;
    setIsLoading(true);
    setError(null);
    try {
      const reviewsQuery = query(
        collection(db, 'reviews'),
        where('studentId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(reviewsQuery);
      const fetchedReviews = await Promise.all(querySnapshot.docs.map(async (reviewDoc) => {
        const reviewData = reviewDoc.data();
        let clientProfilePictureUrl: string | undefined = undefined;
        // Optionally fetch client's profile picture if needed
        if (reviewData.clientId) {
          try {
            const clientDocRef = doc(db, 'users', reviewData.clientId);
            const clientSnap = await getDoc(clientDocRef);
            if (clientSnap.exists()) {
              clientProfilePictureUrl = clientSnap.data()?.profilePictureUrl;
            }
          } catch (e) {
            console.warn("Could not fetch client profile for review picture:", e);
          }
        }
        return {
          id: reviewDoc.id,
          ...reviewData,
          clientProfilePictureUrl,
        } as Review;
      }));
      setReviews(fetchedReviews);
    } catch (err: any) {
      console.error("Error fetching reviews:", err);
      setError("Failed to load your reviews. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        router.push('/auth/login?redirect=/student/reviews');
      } else {
        fetchReviews();
      }
    }
  }, [authLoading, user, role, router, fetchReviews]);

  const handleStartReply = (reviewId: string, existingReplyText?: string) => {
    setReplyingToReviewId(reviewId);
    setReplyText(existingReplyText || '');
  };

  const handleCancelReply = () => {
    setReplyingToReviewId(null);
    setReplyText('');
  };

  const handleSubmitReply = async () => {
    if (!replyingToReviewId || !replyText.trim() || !user || !db) {
      toast({ title: "Error", description: "Cannot submit empty reply.", variant: "destructive" });
      return;
    }
    setIsSubmittingReply(true);
    try {
      const reviewDocRef = doc(db, 'reviews', replyingToReviewId);
      const newReply: StudentReplyData = {
        text: replyText.trim(),
        repliedAt: Timestamp.now(),
      };
      await updateDoc(reviewDocRef, { studentReply: newReply });
      toast({ title: "Reply Submitted!", description: "Your reply has been posted." });
      handleCancelReply(); // Close reply form
      fetchReviews(); // Refresh reviews to show the new reply
    } catch (err: any) {
      console.error("Error submitting reply:", err);
      toast({ title: "Reply Error", description: `Could not submit reply: ${err.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  };
  
  const getInitials = (username?: string | null) => {
    if (username) return username.substring(0, 2).toUpperCase();
    return '??';
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={() => router.push('/student/profile')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Profile
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2 self-start">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">My Reviews</h1>
      <p className="text-muted-foreground">
        See what clients have said about your work and respond to their feedback.
      </p>

      {reviews.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader>
            <Star className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle>No Reviews Yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">You haven't received any reviews from clients.</p>
            <p className="text-sm text-muted-foreground mt-1">Complete gigs to start getting feedback!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id} className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <Link href={`/gigs/${review.gigId}`} className="hover:underline">
                        <CardTitle className="text-lg">{review.gigTitle}</CardTitle>
                    </Link>
                    <StarRating value={review.rating} size={18} isEditable={false} />
                </div>
                 <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={review.clientProfilePictureUrl} alt={review.clientUsername} />
                      <AvatarFallback className="text-[8px]">{getInitials(review.clientUsername)}</AvatarFallback>
                    </Avatar>
                    <span>By {review.clientUsername} &bull; {formatDate(review.createdAt)}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {review.comment && (
                  <p className="text-sm italic">"{review.comment}"</p>
                )}
                {!review.comment && (
                    <p className="text-sm text-muted-foreground italic">Client did not leave a written comment.</p>
                )}

                {review.studentReply && (
                  <div className="mt-3 pt-3 border-t border-dashed pl-4">
                    <p className="text-sm font-semibold flex items-center gap-1">
                      <Reply className="h-4 w-4 transform scale-x-[-1]" /> Your Reply:
                    </p>
                    <p className="text-sm ml-2">{review.studentReply.text}</p>
                    <p className="text-xs text-muted-foreground ml-2 mt-0.5">
                      Replied {formatDate(review.studentReply.repliedAt)}
                    </p>
                    {replyingToReviewId !== review.id && (
                        <Button variant="link" size="xs" onClick={() => handleStartReply(review.id, review.studentReply?.text)} className="ml-2 p-0 h-auto text-xs">
                            Edit Reply
                        </Button>
                    )}
                  </div>
                )}

                {replyingToReviewId === review.id ? (
                  <div className="mt-3 pt-3 border-t">
                    <Textarea
                      placeholder="Write your reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      className="text-sm"
                      disabled={isSubmittingReply}
                    />
                    <div className="flex gap-2 mt-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={handleCancelReply} disabled={isSubmittingReply}>Cancel</Button>
                      <Button size="sm" onClick={handleSubmitReply} disabled={isSubmittingReply || !replyText.trim()}>
                        {isSubmittingReply && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {review.studentReply ? 'Update Reply' : 'Submit Reply'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  !review.studentReply && (
                    <Button variant="outline" size="sm" onClick={() => handleStartReply(review.id)} className="mt-3">
                      <MessageCircle className="mr-2 h-4 w-4" /> Reply to Client
                    </Button>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

    