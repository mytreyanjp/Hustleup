
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Eye } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface AdminGigView {
  id: string;
  title: string;
  clientId: string;
  clientUsername?: string;
  selectedStudentId?: string | null;
  selectedStudentUsername?: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  budget: number;
  currency: string;
  deadline: Timestamp;
  createdAt: Timestamp;
}

export default function AdminManageGigsPage() {
  const { user: adminUser, role: adminRole, loading: adminLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [gigs, setGigs] = useState<AdminGigView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in-progress' | 'completed' | 'closed'>('all');

  const fetchGigsAndUserData = useCallback(async () => {
    if (!db) {
      setError("Database not available.");
      toast({ title: "Database Error", description: "Firestore is not available.", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const gigsQuery = query(collection(db, 'gigs'), orderBy('createdAt', 'desc'));
      const gigsSnapshot = await getDocs(gigsQuery);
      const fetchedGigsPromises = gigsSnapshot.docs.map(async (gigDoc) => {
        const data = gigDoc.data();
        const gigItem: Partial<AdminGigView> = {
          id: gigDoc.id,
          title: data.title || 'Untitled Gig',
          clientId: data.clientId,
          status: data.status || 'open',
          budget: data.budget || 0,
          currency: data.currency || 'INR',
          deadline: data.deadline,
          createdAt: data.createdAt,
          selectedStudentId: data.selectedStudentId || null,
        };

        if (data.clientId) {
          try {
            const clientDocRef = doc(db, 'users', data.clientId);
            const clientSnap = await getDoc(clientDocRef);
            if (clientSnap.exists()) {
              gigItem.clientUsername = (clientSnap.data() as UserProfile).username || data.clientId.substring(0,6);
            } else {
               gigItem.clientUsername = 'Unknown Client';
            }
          } catch (clientError) {
            console.warn(`Could not fetch client profile for ${data.clientId}:`, clientError);
            gigItem.clientUsername = 'Error Fetching Client';
          }
        }

        if (data.selectedStudentId) {
          try {
            const studentDocRef = doc(db, 'users', data.selectedStudentId);
            const studentSnap = await getDoc(studentDocRef);
            if (studentSnap.exists()) {
              gigItem.selectedStudentUsername = (studentSnap.data() as UserProfile).username || data.selectedStudentId.substring(0,6);
            } else {
              gigItem.selectedStudentUsername = 'Unknown Student';
            }
          } catch (studentError) {
             console.warn(`Could not fetch student profile for ${data.selectedStudentId}:`, studentError);
             gigItem.selectedStudentUsername = 'Error Fetching Student';
          }
        }
        return gigItem as AdminGigView;
      });

      const resolvedGigs = await Promise.all(fetchedGigsPromises);
      setGigs(resolvedGigs);

    } catch (err: any) {
      console.error("Error fetching gigs for admin:", err);
      setError("Failed to load gigs. Please try again.");
      toast({ title: "Loading Error", description: err.message || "Could not load gigs.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!adminLoading && adminRole === 'admin') {
      fetchGigsAndUserData();
    } else if (!adminLoading && adminRole !== 'admin') {
      router.push('/'); 
    }
  }, [adminLoading, adminRole, fetchGigsAndUserData, router]);

  const filteredGigs = useMemo(() => {
    if (statusFilter === 'all') {
      return gigs;
    }
    return gigs.filter(gig => gig.status === statusFilter);
  }, [gigs, statusFilter]);

  const formatDate = (timestamp: Timestamp | undefined, specific: boolean = false): string => {
    if (!timestamp) return 'N/A';
    try {
      return specific ? format(timestamp.toDate(), "PPp") : formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) { return 'Invalid date'; }
  };

  const getStatusBadgeVariant = (status: AdminGigView['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'open': return 'default';
           case 'in-progress': return 'secondary';
           case 'completed': return 'outline';
           case 'closed': return 'destructive';
           default: return 'secondary';
       }
   };

  if (isLoading || adminLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={() => router.push('/admin/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Admin Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" size="sm" onClick={() => router.push('/admin/dashboard')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Admin Dashboard
      </Button>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Manage All Gigs</CardTitle>
          <CardDescription>View, filter, and manage all gigs on the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGigs.map((gig) => (
                <TableRow key={gig.id}>
                  <TableCell className="font-medium max-w-xs truncate">{gig.title}</TableCell>
                  <TableCell>{gig.clientUsername || 'N/A'}</TableCell>
                  <TableCell>{gig.selectedStudentUsername || 'N/A'}</TableCell>
                  <TableCell><Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize">{gig.status}</Badge></TableCell>
                  <TableCell>{gig.currency} {gig.budget.toFixed(2)}</TableCell>
                  <TableCell>{formatDate(gig.deadline, true)}</TableCell>
                  <TableCell>{formatDate(gig.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/manage-gigs/${gig.id}`}><Eye className="mr-1 h-4 w-4" /> View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredGigs.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8">No gigs found for the selected filter.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
