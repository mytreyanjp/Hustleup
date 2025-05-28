
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CalendarDays, DollarSign, Send, UserCircle, ArrowLeft, Bookmark, BookmarkCheck, Globe, Building, Share2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import Image from 'next/image'; // Not used directly in this version, but keeping for potential future use

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  deadline: Timestamp; 
  requiredSkills: string[];
  clientId: string;
  clientUsername?: string; 
  createdAt: Timestamp; 
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: { studentId: string; studentUsername: string; message?: string; appliedAt: Timestamp }[];
}

export default function GigDetailPage() {
  const params = useParams();
  const gigId = params.gigId as string;
  const router = useRouter();
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const { toast } = useToast();

  const [gig, setGig] = useState<Gig | null>(null);
  const [clientProfileDetails, setClientProfileDetails] = useState<UserProfile | null>(null);
  const [isLoadingGig, setIsLoadingGig] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isTogglingBookmark, setIsTogglingBookmark] = useState(false);

  const fetchGigData = useCallback(async () => {
    if (!gigId) {
      setError("Gig ID is missing.");
      setIsLoadingGig(false);
      return;
    }
    setIsLoadingGig(true);
    setError(null);
    setClientProfileDetails(null);
    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const docSnap = await getDoc(gigDocRef);

      if (docSnap.exists()) {
        const fetchedGig = { id: docSnap.id, ...docSnap.data() } as Gig;
        if (!fetchedGig.currency) {
            fetchedGig.currency = "INR";
        }
        setGig(fetchedGig);

        if (fetchedGig.clientId && db) {
          try {
            const clientDocRef = doc(db, 'users', fetchedGig.clientId);
            const clientDocSnap = await getDoc(clientDocRef);
            if (clientDocSnap.exists()) {
              setClientProfileDetails({ uid: clientDocSnap.id, ...clientDocSnap.data() } as UserProfile);
            } else {
              console.warn(`Client profile not found for clientId: ${fetchedGig.clientId}`);
            }
          } catch (clientProfileError) {
            console.error("Error fetching client profile for gig:", clientProfileError);
          }
        }

      } else {
        setError("Gig not found.");
        setGig(null);
      }
    } catch (err: any) {
      console.error("Error fetching gig:", err);
      setError("Failed to load gig details. Please try again later.");
      setGig(null);
    } finally {
      setIsLoadingGig(false);
    }
  }, [gigId]);

  useEffect(() => {
    fetchGigData();
  }, [fetchGigData]);

  useEffect(() => {
    if (gig && user && role === 'student' && userProfile) {
      setHasApplied(gig.applicants?.some(app => app.studentId === user.uid) || false);
      setIsBookmarked(userProfile.bookmarkedGigIds?.includes(gig.id) || false);
    } else {
      setHasApplied(false);
      setIsBookmarked(false);
    }
  }, [gig, user, role, userProfile]);


  const handleApply = async () => {
    if (!user || !userProfile || role !== 'student' || !gig || hasApplied || gig.status !== 'open') return;

    setIsApplying(true);
    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const newApplicant = {
        studentId: user.uid,
        studentUsername: userProfile.username || user.email?.split('@')[0] || 'Unknown Student',
        message: applicationMessage.trim() || '',
        appliedAt: Timestamp.now(),
        status: 'pending',
      };

      await updateDoc(gigDocRef, {
        applicants: arrayUnion(newApplicant),
      });

      setHasApplied(true);
      setGig(prevGig => prevGig ? { ...prevGig, applicants: [...(prevGig.applicants || []), newApplicant] } : null);
      toast({
        title: 'Application Sent!',
        description: 'Your application has been submitted to the client.',
      });
      setApplicationMessage('');

    } catch (err: any) {
      console.error("Error applying to gig:", err);
      toast({
        title: 'Application Failed',
        description: `Could not submit application: ${err.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  };
  
  const handleToggleBookmark = async () => {
    if (!user || !userProfile || role !== 'student' || !gig) return;
    if (!db) {
        toast({ title: "Database Error", description: "Cannot update bookmark.", variant: "destructive" });
        return;
    }

    setIsTogglingBookmark(true);
    const userDocRef = doc(db, 'users', user.uid);
    try {
      if (isBookmarked) {
        await updateDoc(userDocRef, {
          bookmarkedGigIds: arrayRemove(gig.id)
        });
        toast({ title: "Bookmark Removed", description: `"${gig.title}" removed from your bookmarks.` });
      } else {
        await updateDoc(userDocRef, {
          bookmarkedGigIds: arrayUnion(gig.id)
        });
        toast({ title: "Gig Bookmarked!", description: `"${gig.title}" added to your bookmarks.` });
      }
      setIsBookmarked(!isBookmarked); 
      if(refreshUserProfile) await refreshUserProfile(); 
    } catch (err: any) {
      console.error("Error toggling bookmark:", err);
      toast({ title: "Bookmark Error", description: `Could not update bookmark: ${err.message}`, variant: "destructive" });
    } finally {
      setIsTogglingBookmark(false);
    }
  };

  const handleShareToChat = () => {
    if (!user || !gig) {
        toast({ title: "Login Required", description: "Please log in to share gigs.", variant: "destructive" });
        return;
    }
    // Pass gigId and gigTitle to the chat page
    router.push(`/chat?shareGigId=${gig.id}&shareGigTitle=${encodeURIComponent(gig.title)}`);
  };


  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) { return 'Invalid date'; }
  };

  const formatDeadline = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { return 'Invalid date'; }
  };

  if (isLoadingGig || authLoading) {
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
         <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
         </Button>
      </div>
    );
  }

  if (!gig) {
     return (
       <div className="text-center py-10 text-muted-foreground">
         Gig details could not be loaded or the gig was not found.
       </div>
     );
   }

   const isClientOwner = user && role === 'client' && user.uid === gig.clientId;
   // Display company name if available and it's a client, otherwise fallback to clientUsername or 'Client'
   const clientDisplayName = clientProfileDetails?.companyName || clientProfileDetails?.username || gig.clientUsername || 'Client';


  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>

       <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <CardTitle className="text-2xl md:text-3xl flex-grow">{gig.title}</CardTitle>
            <div className="flex items-center gap-2 shrink-0">
                {user && (
                    <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={handleShareToChat} 
                        disabled={authLoading || isLoadingGig}
                        title="Share to Chat"
                        className="shrink-0"
                    >
                        <Share2 className="h-5 w-5" />
                    </Button>
                )}
                {role === 'student' && gig.status === 'open' && (
                    <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={handleToggleBookmark} 
                        disabled={isTogglingBookmark || authLoading || isLoadingGig}
                        title={isBookmarked ? "Remove Bookmark" : "Bookmark Gig"}
                        className="shrink-0"
                    >
                        {isTogglingBookmark ? <Loader2 className="h-5 w-5 animate-spin" /> : (isBookmarked ? <BookmarkCheck className="h-5 w-5 text-primary" /> : <Bookmark className="h-5 w-5" />)}
                    </Button>
                )}
            </div>
          </div>
          <CardDescription className="text-sm text-muted-foreground flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-x-4 gap-y-1 pt-1">
             <span>
                Posted by: <Link href={`/profile/${gig.clientId}`} className="font-medium text-foreground hover:underline">{clientDisplayName}</Link>
             </span>
             <span>{formatDate(gig.createdAt)}</span>
             <Badge variant={gig.status === 'open' ? 'default' : 'secondary'} className="capitalize">{gig.status}</Badge>
          </CardDescription>
          {clientProfileDetails && (
            <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
              {clientProfileDetails.companyName && clientProfileDetails.username && clientProfileDetails.companyName !== clientProfileDetails.username && (
                <div className="flex items-center gap-1.5">
                    <UserCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Contact: {clientProfileDetails.username}</span>
                </div>
              )}
              {clientProfileDetails.website && (
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <a 
                    href={clientProfileDetails.website.startsWith('http') ? clientProfileDetails.website : `https://${clientProfileDetails.website}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="hover:underline text-primary"
                  >
                    {clientProfileDetails.website}
                  </a>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
           <div>
             <h3 className="font-semibold mb-2">Description</h3>
             <p className="text-sm whitespace-pre-wrap">{gig.description}</p>
           </div>
           <div>
             <h3 className="font-semibold mb-2">Required Skills</h3>
             <div className="flex flex-wrap gap-2">
               {gig.requiredSkills?.map((skill, index) => (
                 <Badge key={index} variant="secondary">{skill}</Badge>
               ))}
             </div>
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-center text-sm">
                  <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground mr-1">Budget:</span> <span className="font-medium">{gig.currency} {gig.budget.toFixed(2)}</span>
              </div>
              <div className="flex items-center text-sm">
                  <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                   <span className="text-muted-foreground mr-1">Deadline:</span> <span className="font-medium">{formatDeadline(gig.deadline)}</span>
              </div>
           </div>
        </CardContent>
        <CardFooter>
           {(() => {
              if (isLoadingGig || authLoading) {
                return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />;
              }

              if (gig.status !== 'open') {
                return <p className="text-sm text-muted-foreground w-full text-center">This gig is no longer accepting applications ({gig.status}).</p>;
              }

              if (!user) { 
                return (
                  <Button asChild className="w-full sm:w-auto">
                    <Link href={`/auth/login?redirect=/gigs/${gigId}`}>Login or Sign Up to Apply</Link>
                  </Button>
                );
              }
              
              if (user && !role && !authLoading && userProfile === null) {
                  return <p className="text-sm text-muted-foreground w-full text-center">Verifying account type...</p>;
              }


              if (role === 'student') {
                if (hasApplied) {
                  return <p className="text-sm text-green-600 font-medium text-center w-full">✅ You have already applied to this gig.</p>;
                } else {
                  return (
                    <div className="w-full space-y-4">
                      <h3 className="font-semibold">Apply for this Gig</h3>
                      <Textarea
                        placeholder="Include a brief message introducing yourself and why you're a good fit (optional)..."
                        value={applicationMessage}
                        onChange={(e) => setApplicationMessage(e.target.value)}
                        rows={3}
                        disabled={isApplying}
                      />
                      <Button
                        onClick={handleApply}
                        disabled={isApplying || hasApplied}
                        className="w-full sm:w-auto"
                      >
                        {isApplying ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Submit Application
                      </Button>
                    </div>
                  );
                }
              } else if (role === 'client') {
                if (isClientOwner) {
                  return (
                    <Button asChild variant="secondary" className="w-full sm:w-auto">
                      <Link href={`/client/gigs/${gigId}/manage`}>Manage Gig & Applicants</Link>
                    </Button>
                  );
                } else {
                  return <p className="text-sm text-muted-foreground w-full text-center">You are viewing this as a client. Only students can apply.</p>;
                }
              }
              
              return <p className="text-sm text-muted-foreground w-full text-center">Application status unavailable.</p>;
           })()}
        </CardFooter>
      </Card>

       {isClientOwner && gig.applicants && gig.applicants.length > 0 && (
         <Card className="glass-card">
           <CardHeader>
             <CardTitle>Applicants ({gig.applicants.length})</CardTitle>
             <CardDescription>Students who have applied to this gig. Manage them from the "Manage Gig" page.</CardDescription>
           </CardHeader>
           <CardContent>
             <ul className="space-y-3">
               {gig.applicants.slice(0, 3).map((applicant) => ( 
                 <li key={applicant.studentId} className="flex items-center justify-between p-3 border rounded-md">
                   <div className="flex items-center gap-3">
                     <UserCircle className="h-6 w-6 text-muted-foreground" />
                     <div>
                       <p className="font-medium">{applicant.studentUsername}</p>
                       <p className="text-xs text-muted-foreground">Applied {formatDate(applicant.appliedAt)}</p>
                        {applicant.message && <p className="text-sm mt-1 italic line-clamp-2">"{applicant.message}"</p>}
                     </div>
                   </div>
                    <Button size="sm" variant="outline" asChild>
                       <Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link>
                     </Button>
                 </li>
               ))}
                {gig.applicants.length > 3 && <p className="text-sm text-muted-foreground mt-2 text-center">And {gig.applicants.length - 3} more...</p>}
             </ul>
           </CardContent>
           <CardFooter>
                 <Button asChild variant="default" className="w-full">
                     <Link href={`/client/gigs/${gigId}/manage`}>Manage All Applicants & Payments</Link>
                 </Button>
            </CardFooter>
         </Card>
       )}
        {isClientOwner && (!gig.applicants || gig.applicants.length === 0) && (
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Applicants</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">No applications received yet for this gig.</p>
                </CardContent>
            </Card>
        )}
    </div>
  );
}
