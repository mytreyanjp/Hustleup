
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
               gigItem.clientUsername = 'Client N/A'; // More user-friendly
               console.warn(`Admin: Client profile not found for ID ${data.clientId}`);
            }
          } catch (clientError) {
            console.error(`Admin: Error fetching client profile for ID ${data.clientId}:`, clientError);
            gigItem.clientUsername = 'Client N/A'; // More user-friendly
          }
        } else {
          gigItem.clientUsername = 'Client ID Missing';
        }

        if (data.selectedStudentId) {
          try {
            const studentDocRef = doc(db, 'users', data.selectedStudentId);
            const studentSnap = await getDoc(studentDocRef);
            if (studentSnap.exists()) {
              gigItem.selectedStudentUsername = (studentSnap.data() as UserProfile).username || data.selectedStudentId.substring(0,6);
            } else {
              gigItem.selectedStudentUsername = 'Student N/A'; // More user-friendly
              console.warn(`Admin: Student profile not found for ID ${data.selectedStudentId}`);
            }
          } catch (studentError) {
             console.error(`Admin: Error fetching student profile for ID ${data.selectedStudentId}:`, studentError);
             gigItem.selectedStudentUsername = 'Student N/A'; // More user-friendly
          }
        } else {
            // No selected student, so no username to show
            gigItem.selectedStudentUsername = 'N/A';
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
          <CardTitle className="text-lg sm:text-xl">Manage All Gigs</CardTitle>
          <CardDescription>View, filter, and manage all gigs on the platform.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="mb-4">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-[200px] text-xs sm:text-sm">
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
                <TableHead className="min-w-[200px] text-xs sm:text-sm">Title</TableHead>
                <TableHead className="min-w-[120px] text-xs sm:text-sm">Client</TableHead>
                <TableHead className="min-w-[120px] text-xs sm:text-sm">Student</TableHead>
                <TableHead className="min-w-[100px] text-xs sm:text-sm">Status</TableHead>
                <TableHead className="min-w-[100px] text-xs sm:text-sm">Budget</TableHead>
                <TableHead className="min-w-[150px] text-xs sm:text-sm">Deadline</TableHead>
                <TableHead className="min-w-[150px] text-xs sm:text-sm">Created</TableHead>
                <TableHead className="text-right min-w-[100px] text-xs sm:text-sm">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGigs.map((gig) => (
                <TableRow key={gig.id}>
                  <TableCell className="font-medium max-w-xs truncate text-xs sm:text-sm">{gig.title}</TableCell>
                  <TableCell className="text-xs sm:text-sm">{gig.clientUsername || 'N/A'}</TableCell>
                  <TableCell className="text-xs sm:text-sm">{gig.selectedStudentUsername || 'N/A'}</TableCell>
                  <TableCell><Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize text-xs">{gig.status}</Badge></TableCell>
                  <TableCell className="text-xs sm:text-sm">{gig.currency} {gig.budget.toFixed(2)}</TableCell>
                  <TableCell className="text-xs sm:text-sm">{formatDate(gig.deadline, true)}</TableCell>
                  <TableCell className="text-xs sm:text-sm">{formatDate(gig.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="xs" asChild className="text-xs sm:text-sm">
                      <Link href={`/admin/manage-gigs/${gig.id}`}><Eye className="mr-1 h-3 w-3 sm:h-4 sm:w-4" /> View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredGigs.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8 text-sm">No gigs found for the selected filter.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
