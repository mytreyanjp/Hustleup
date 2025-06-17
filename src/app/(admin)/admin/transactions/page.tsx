
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Eye, Search, IndianRupee } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface Transaction {
    id: string;
    clientId: string;
    clientUsername: string;
    studentId: string;
    studentUsername: string;
    gigId: string;
    gigTitle: string;
    amount: number;
    currency: string;
    status: 'succeeded' | 'failed' | 'pending' | 'pending_release_to_student' | 'payout_to_student_succeeded';
    paymentId?: string; 
    paidAt: Timestamp;
    payoutProcessedAt?: Timestamp;
}

const COMMISSION_RATE = 0.02; // 2% commission

export default function AdminTransactionsPage() {
  const { user: adminUser, role: adminRole, loading: adminLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<'all' | Transaction['status']>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTransactions = useCallback(async () => {
    if (!db) {
      setError("Database not available.");
      toast({ title: "Database Error", description: "Firestore is not available.", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const transactionsQuery = query(collection(db, 'transactions'), orderBy('paidAt', 'desc'));
      const transactionsSnapshot = await getDocs(transactionsQuery);
      const fetchedTransactions = transactionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Transaction[];
      setTransactions(fetchedTransactions);
    } catch (err: any) {
      console.error("Error fetching transactions for admin:", err);
      setError("Failed to load transactions. Please try again.");
      toast({ title: "Loading Error", description: err.message || "Could not load transactions.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!adminLoading && adminRole === 'admin') {
      fetchTransactions();
    } else if (!adminLoading && adminRole !== 'admin') {
      router.push('/'); 
    }
  }, [adminLoading, adminRole, router, fetchTransactions]);

  const filteredTransactions = useMemo(() => {
    let results = transactions;

    if (statusFilter !== 'all') {
      results = results.filter(tx => tx.status === statusFilter);
    }

    if (searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase();
      results = results.filter(tx => 
        tx.gigTitle.toLowerCase().includes(lowerSearchTerm) ||
        tx.clientUsername?.toLowerCase().includes(lowerSearchTerm) ||
        tx.studentUsername?.toLowerCase().includes(lowerSearchTerm) ||
        tx.paymentId?.toLowerCase().includes(lowerSearchTerm) ||
        tx.id.toLowerCase().includes(lowerSearchTerm)
      );
    }
    return results;
  }, [transactions, statusFilter, searchTerm]);

  const formatDate = (timestamp: Timestamp | undefined, specific: boolean = false): string => {
    if (!timestamp) return 'N/A';
    try {
      return format(timestamp.toDate(), specific ? "PPpp" : "PP");
    } catch (e) { return 'Invalid date'; }
  };

  const getStatusBadgeVariant = (status: Transaction['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'succeeded': case 'payout_to_student_succeeded': return 'default';
           case 'pending_release_to_student': return 'outline';
           case 'pending': return 'secondary';
           case 'failed': return 'destructive';
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
          <CardTitle className="text-lg sm:text-xl">Monitor Transactions</CardTitle>
          <CardDescription>View platform financial transactions and 2% commissions earned.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-grow sm:max-w-md">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                type="search"
                placeholder="Search by Gig, User, Payment ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 text-xs sm:text-sm h-9"
                />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-[220px] text-xs sm:text-sm h-9">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending_release_to_student">Paid by Client (Held)</SelectItem>
                <SelectItem value="payout_to_student_succeeded">Paid to Student</SelectItem>
                <SelectItem value="succeeded">Succeeded (General)</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px] text-xs sm:text-sm">Date</TableHead>
                <TableHead className="min-w-[100px] text-xs sm:text-sm hidden md:table-cell">Amount</TableHead>
                <TableHead className="min-w-[120px] text-xs sm:text-sm hidden md:table-cell">Commission (INR)</TableHead>
                <TableHead className="min-w-[150px] text-xs sm:text-sm">Status</TableHead>
                <TableHead className="min-w-[120px] text-xs sm:text-sm hidden md:table-cell">Client</TableHead>
                <TableHead className="min-w-[120px] text-xs sm:text-sm hidden md:table-cell">Student</TableHead>
                <TableHead className="min-w-[150px] sm:min-w-[200px] text-xs sm:text-sm">Gig Title</TableHead>
                <TableHead className="min-w-[100px] text-xs sm:text-sm hidden md:table-cell">Payment ID</TableHead>
                <TableHead className="text-right min-w-[80px] text-xs sm:text-sm">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((tx) => {
                let commissionAmount: number | null = null;
                if (tx.status === 'pending_release_to_student' || tx.status === 'payout_to_student_succeeded' || tx.status === 'succeeded') {
                    commissionAmount = tx.amount * COMMISSION_RATE;
                }
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatDate(tx.payoutProcessedAt || tx.paidAt)}</TableCell>
                    <TableCell className="text-xs sm:text-sm hidden md:table-cell">₹{tx.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-xs sm:text-sm hidden md:table-cell">
                        {commissionAmount !== null ? `₹${commissionAmount.toFixed(2)}` : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(tx.status)} className="capitalize text-xs whitespace-nowrap">
                          {tx.status === 'pending_release_to_student' ? 'Paid by Client (Held)' : 
                           tx.status === 'payout_to_student_succeeded' ? 'Paid to Student' : 
                           tx.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm hidden md:table-cell truncate max-w-[100px]">
                      <Link href={`/profile/${tx.clientId}`} className="hover:underline text-primary" target="_blank">
                          {tx.clientUsername}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm hidden md:table-cell truncate max-w-[100px]">
                       <Link href={`/profile/${tx.studentId}`} className="hover:underline text-primary" target="_blank">
                          {tx.studentUsername}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium max-w-[150px] sm:max-w-xs truncate text-xs sm:text-sm">
                      <Link href={`/admin/manage-gigs/${tx.gigId}`} className="hover:underline text-primary">
                          {tx.gigTitle}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm hidden md:table-cell truncate max-w-[100px]">{tx.paymentId || 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/manage-gigs/${tx.gigId}`}><Eye className="mr-0 md:mr-1 h-4 w-4" /> <span className="hidden md:inline">View Gig</span></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredTransactions.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {searchTerm.trim() || statusFilter !== 'all' ? 'No transactions found for the selected filters.' : 'No transactions found.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
    
