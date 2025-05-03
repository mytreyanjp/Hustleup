"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CalendarDays, DollarSign, Send, UserCircle, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number;
  deadline: Timestamp; // Firestore Timestamp
  requiredSkills: string[];
  clientId: string;
  clientUsername?: string;
  createdAt: Timestamp; // Firestore Timestamp
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: { studentId: string; studentUsername: string; message?: string; appliedAt: Timestamp }[]; // Added applicants field
}

export default function GigDetailPage() {
  const params = useParams();
  const gigId = params.gigId as string;
  const router = useRouter();
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const { toast } = useToast();

  const [gig, setGig] = useState<Gig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  useEffect(() => {
    if (!gigId) {
        setError("Gig ID is missing.");
        setIsLoading(false);
        return;
    };

    const fetchGig = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const gigDocRef = doc(db, 'gigs', gigId);
        const docSnap = await getDoc(gigDocRef);

        if (docSnap.exists()) {
          const fetchedGig = { id: docSnap.id, ...docSnap.data() } as Gig;
          setGig(fetchedGig);

          // Check if the current user has already applied (only if user is loaded and is a student)
          if (user && role === 'student' && fetchedGig.applicants) {
            setHasApplied(fetchedGig.applicants.some(app => app.studentId === user.uid));
          }

        } else {
          setError("Gig not found.");
        }
      } catch (err: any) {
        console.error("Error fetching gig:", err);
        setError("Failed to load gig details. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchGig();
  }, [gigId, user, role]); // Re-run if user or role changes

  const handleApply = async () => {
    if (!user || role !== 'student' || !gig || hasApplied) return;

    setIsApplying(true);
    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const newApplicant = {
        studentId: user.uid,
        studentUsername: userProfile?.username || user.email?.split('@')[0] || 'Unknown Student',
        message: applicationMessage.trim() || '', // Include the message
        appliedAt: Timestamp.now(),
      };

      await updateDoc(gigDocRef, {
        applicants: arrayUnion(newApplicant),
      });

      setHasApplied(true); // Update UI state
      toast({
        title: 'Application Sent!',
        description: 'Your application has been submitted to the client.',
      });
       setApplicationMessage(''); // Clear message field

       // TODO: Optionally initiate a chat conversation here

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


  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Invalid date';
    }
  };

   const formatDeadline = (timestamp: Timestamp | undefined): string => {
     if (!timestamp) return 'N/A';
     try {
       return timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
     } catch (e) {
       console.error("Error formatting deadline:", e);
       return 'Invalid date';
     }
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
         <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
         </Button>
      </div>
    );
  }

  if (!gig) {
     return (
       <div className="text-center py-10 text-muted-foreground">
         Could not load gig details.
       </div>
     );
   }

   const isClientOwner = user && role === 'client' && user.uid === gig.clientId;


  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Gigs
       </Button>

       <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">{gig.title}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
             <span>Posted by <span className="font-medium text-foreground">{gig.clientUsername || 'Client'}</span></span>
             <span>{formatDate(gig.createdAt)}</span>
             <Badge variant={gig.status === 'open' ? 'default' : 'secondary'} className="capitalize">{gig.status}</Badge>
          </CardDescription>
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
                  <span className="text-muted-foreground mr-1">Budget:</span> <span className="font-medium">${gig.budget.toFixed(2)}</span>
              </div>
              <div className="flex items-center text-sm">
                  <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                   <span className="text-muted-foreground mr-1">Deadline:</span> <span className="font-medium">{formatDeadline(gig.deadline)}</span>
              </div>
           </div>
        </CardContent>
        <CardFooter>
           {/* Action Buttons */}
           {role === 'student' && gig.status === 'open' && (
             <div className="w-full space-y-4">
               {hasApplied ? (
                 <p className="text-sm text-green-600 font-medium text-center">✅ You have already applied to this gig.</p>
               ) : (
                 <>
                   <h3 className="font-semibold">Apply for this Gig</h3>
                   <Textarea
                     placeholder="Include a brief message introducing yourself and why you're a good fit (optional)..."
                     value={applicationMessage}
                     onChange={(e) => setApplicationMessage(e.target.value)}
                     rows={3}
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
                 </>
               )}
             </div>
           )}
            {isClientOwner && (
                <Button asChild variant="secondary">
                  <Link href={`/client/gigs/${gigId}/manage`}>Manage Gig & Applicants</Link>
                </Button>
            )}
             {role === 'client' && !isClientOwner && (
                 <p className="text-sm text-muted-foreground">You can browse gigs, but only students can apply.</p>
             )}
             {!user && gig.status === 'open' && (
                 <Button asChild>
                     <Link href={`/auth/login?redirect=/gigs/${gigId}`}>Login or Sign Up to Apply</Link>
                 </Button>
             )}
             {gig.status !== 'open' && (
                <p className="text-sm text-muted-foreground">This gig is no longer accepting applications ({gig.status}).</p>
             )}
        </CardFooter>
      </Card>

       {/* Section for Client to view applicants (only visible to owner) */}
       {isClientOwner && (
         <Card className="glass-card">
           <CardHeader>
             <CardTitle>Applicants</CardTitle>
             <CardDescription>Students who have applied to this gig.</CardDescription>
           </CardHeader>
           <CardContent>
             {gig.applicants && gig.applicants.length > 0 ? (
               <ul className="space-y-3">
                 {gig.applicants.map((applicant) => (
                   <li key={applicant.studentId} className="flex items-center justify-between p-3 border rounded-md">
                     <div className="flex items-center gap-3">
                       <UserCircle className="h-6 w-6 text-muted-foreground" />
                       <div>
                         <p className="font-medium">{applicant.studentUsername}</p>
                         <p className="text-xs text-muted-foreground">Applied {formatDate(applicant.appliedAt)}</p>
                          {applicant.message && <p className="text-sm mt-1 italic">"{applicant.message}"</p>}
                       </div>
                     </div>
                     <Button size="sm" variant="outline" asChild>
                        {/* TODO: Link to applicant profile and chat */}
                       <Link href={`/profile/${applicant.studentId}`}>View Profile</Link>
                     </Button>
                   </li>
                 ))}
               </ul>
             ) : (
               <p className="text-sm text-muted-foreground">No applications received yet.</p>
             )}
           </CardContent>
            <CardFooter>
                 <Button asChild variant="default" className="w-full">
                     <Link href={`/client/gigs/${gigId}/manage`}>Manage Applicants & Payments</Link>
                 </Button>
            </CardFooter>
         </Card>
       )}
    </div>
  );
}

