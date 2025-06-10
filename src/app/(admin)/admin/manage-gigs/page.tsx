
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, getDoc } from 'firebase/firestore';
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
import { Input } from '@/components/ui/input'; // Added Input import
import { useToast } from '@/hooks/use-toast';

interface AdminGigView {
  id: string;
  title: string;
  clientId: string;
  clientUsername?: string;
  selectedStudentId?: string | null;
  selectedStudentUsername?: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed' | 'awaiting_payout'; // Added 'awaiting_payout'
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in-progress' | 'awaiting_payout' | 'completed' | 'closed'>('all');
  const [searchTerm, setSearchTerm] = useState(''); // New state for search term

  const fetchGigsAndUserData = async () => { // Removed useCallback to ensure it fetches with latest filters if needed
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
               gigItem.clientUsername = 'Client N/A';
               console.warn(`Admin: Client profile not found for ID ${data.clientId}`);
            }
          } catch (clientError: any) {
            console.error(`Admin: Error fetching client profile for ID ${data.clientId}:`, clientError.message || clientError);
            gigItem.clientUsername = 'Client N/A (Error)';
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
              gigItem.selectedStudentUsername = 'Student N/A';
              console.warn(`Admin: Student profile not found for ID ${data.selectedStudentId}`);
            }
          } catch (studentError: any) {
             console.error(`Admin: Error fetching student profile for ID ${data.selectedStudentId}:`, studentError.message || studentError);
             gigItem.selectedStudentUsername = 'Student N/A (Error)';
          }
        } else {
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
  };

  useEffect(() => {
    if (!adminLoading && adminRole === 'admin') {
      fetchGigsAndUserData();
    } else if (!adminLoading && adminRole !== 'admin') {
      router.push('/'); 
    }
  }, [adminLoading, adminRole, router, toast]); // Removed fetchGigsAndUserData from deps, called directly

  const filteredGigs = useMemo(() => {
    let results = gigs;

    // Apply status filter
    if (statusFilter !== 'all') {
      results = results.filter(gig => gig.status === statusFilter);
    }

    // Apply search term filter
    if (searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase();
      results = results.filter(gig => {
        const clientMatch = gig.clientUsername?.toLowerCase().includes(lowerSearchTerm);
        const studentMatch = gig.selectedStudentUsername?.toLowerCase().includes(lowerSearchTerm);
        const titleMatch = gig.title.toLowerCase().includes(lowerSearchTerm);
        return clientMatch || studentMatch || titleMatch;
      });
    }
    return results;
  }, [gigs, statusFilter, searchTerm]);

  const formatDate = (timestamp: Timestamp | undefined, specific: boolean = false): string => {
    if (!timestamp) return 'N/A';
    try {
      return specific ? format(timestamp.toDate(), "PPp") : formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) { return 'Invalid date'; }
  };

  const getStatusBadgeVariant = (status: AdminGigView['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'open': return 'default';
           case 'in-progress': case 'awaiting_payout': return 'secondary'; // awaiting_payout uses secondary
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
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <Input
              type="search"
              placeholder="Search by Gig Title, Client or Student..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:max-w-xs text-xs sm:text-sm h-9"
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-[200px] text-xs sm:text-sm h-9">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="awaiting_payout">Awaiting Payout</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px] sm:min-w-[200px] text-xs sm:text-sm">Title</TableHead>
                <TableHead className="min-w-[120px] text-xs sm:text-sm hidden md:table-cell">Client</TableHead>
                <TableHead className="min-w-[120px] text-xs sm:text-sm hidden md:table-cell">Student</TableHead>
                <TableHead className="min-w-[100px] text-xs sm:text-sm hidden md:table-cell">Status</TableHead>
                <TableHead className="min-w-[100px] text-xs sm:text-sm hidden md:table-cell">Payment</TableHead>
                <TableHead className="min-w-[150px] text-xs sm:text-sm hidden md:table-cell">Deadline</TableHead>
                <TableHead className="min-w-[150px] text-xs sm:text-sm hidden md:table-cell">Created</TableHead>
                <TableHead className="text-right min-w-[80px] sm:min-w-[100px] text-xs sm:text-sm">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGigs.map((gig) => (
                <TableRow key={gig.id}>
                  <TableCell className="font-medium max-w-[150px] sm:max-w-xs truncate text-xs sm:text-sm">
                    <Link href={`/admin/manage-gigs/${gig.id}`} className="hover:underline text-primary">
                        {gig.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm hidden md:table-cell">{gig.clientUsername || 'N/A'}</TableCell>
                  <TableCell className="text-xs sm:text-sm hidden md:table-cell">{gig.selectedStudentUsername || 'N/A'}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize text-xs">
                        {gig.status === 'awaiting_payout' ? 'Awaiting Payout' : gig.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm hidden md:table-cell">{gig.currency} {gig.budget.toFixed(2)}</TableCell>
                  <TableCell className="text-xs sm:text-sm hidden md:table-cell">{formatDate(gig.deadline, true)}</TableCell>
                  <TableCell className="text-xs sm:text-sm hidden md:table-cell">{formatDate(gig.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/manage-gigs/${gig.id}`}><Eye className="mr-0 md:mr-1 h-4 w-4" /> <span className="hidden md:inline">View</span></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredGigs.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {searchTerm.trim() || statusFilter !== 'all' ? 'No gigs found for the selected filters.' : 'No gigs found.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
    
    
