
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, updateDoc, serverTimestamp, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, MessageSquare, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface AdminSupportRequest {
  id: string;
  requesterUid: string;
  requesterUsername: string;
  requesterEmail?: string;
  initialMessage: string;
  requestedAt: Timestamp;
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  platformInfo?: {
    userAgent?: string;
    url?: string;
  };
  handledByAdminUid?: string;
  handledByAdminUsername?: string;
  handledAt?: Timestamp;
  resolutionNotes?: string;
}

export default function AdminSupportRequestsPage() {
  const { user: adminUser, userProfile: adminProfile, role: adminRole, loading: adminLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [requests, setRequests] = useState<AdminSupportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handlingRequestId, setHandlingRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!adminLoading && (!adminUser || adminRole !== 'admin')) {
      router.push('/auth/login?redirect=/admin/support-requests');
      return;
    }

    if (adminUser && db) {
      setIsLoading(true);
      setError(null);
      const requestsQuery = query(
        collection(db, 'admin_chat_requests'),
        where('status', '==', 'pending'),
        orderBy('requestedAt', 'asc')
      );

      const unsubscribe = onSnapshot(requestsQuery, (querySnapshot: QuerySnapshot<DocumentData>) => {
        const fetchedRequests = querySnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as AdminSupportRequest[];
        setRequests(fetchedRequests);
        setIsLoading(false);
      }, (err) => {
        console.error("Error fetching support requests:", err);
        setError("Failed to load support requests. Please try again later.");
        setIsLoading(false);
      });

      return () => unsubscribe();
    }
  }, [adminUser, adminRole, adminLoading, router]);


  const handleStartChat = async (request: AdminSupportRequest) => {
    if (!adminUser || !adminProfile || !db) {
      toast({ title: "Error", description: "Admin session or database not available.", variant: "destructive" });
      return;
    }
    setHandlingRequestId(request.id);
    try {
      const requestDocRef = doc(db, 'admin_chat_requests', request.id);
      await updateDoc(requestDocRef, {
        status: 'in_progress',
        handledByAdminUid: adminUser.uid,
        handledByAdminUsername: adminProfile.username || adminUser.email?.split('@')[0] || 'Admin',
        handledAt: serverTimestamp(),
      });
      toast({ title: "Chat Initiated", description: `Connecting you with ${request.requesterUsername}...` });
      router.push(`/chat?userId=${request.requesterUid}`);
    } catch (err: any) {
      console.error("Error starting chat / updating request:", err);
      toast({ title: "Error", description: `Could not start chat: ${err.message}`, variant: "destructive" });
    } finally {
      setHandlingRequestId(null);
    }
  };

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try { return formatDistanceToNow(timestamp.toDate(), { addSuffix: true }); } catch (e) { return 'Invalid date'; }
  };

  const getInitials = (username: string) => {
    return username?.substring(0, 2).toUpperCase() || 'U';
  };


  if (isLoading || adminLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-10 p-4 sm:p-0">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={() => router.push('/admin/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Admin Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-0">
      <Button variant="outline" size="sm" onClick={() => router.push('/admin/dashboard')} className="mb-4 w-full sm:w-auto">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Admin Dashboard
      </Button>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Pending Support Chat Requests</CardTitle>
          <CardDescription>Users waiting for an admin to start a chat.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {requests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No pending support requests.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">User</TableHead>
                  <TableHead className="min-w-[200px]">Initial Message</TableHead>
                  <TableHead className="min-w-[150px]">Requested At</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                          {/* Avatar could be fetched if stored on user profile */}
                          <UserCircle className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <span className="font-medium truncate">{request.requesterUsername}</span>
                            <p className="text-xs text-muted-foreground truncate">{request.requesterEmail}</p>
                          </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{request.initialMessage}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(request.requestedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleStartChat(request)}
                        disabled={handlingRequestId === request.id}
                        className="text-xs sm:text-sm"
                      >
                        {handlingRequestId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />}
                        Start Chat
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
         {requests.length > 0 && (
            <CardFooter>
                <p className="text-xs text-muted-foreground">
                    {requests.length} pending request{requests.length === 1 ? '' : 's'}.
                </p>
            </CardFooter>
         )}
      </Card>
    </div>
  );
}
