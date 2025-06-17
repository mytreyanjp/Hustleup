
"use client";

import { useState, useEffect } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, IndianRupee } from 'lucide-react'; 
import Link from 'next/link';
import { format } from 'date-fns';

interface Transaction {
  id: string; 
  gigId: string;
  gigTitle: string; 
  studentId: string;
  studentUsername: string; 
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending' | 'pending_release_to_student'; 
  paymentId?: string; // Generic payment ID, no longer Razorpay specific
  paidAt: Timestamp;
}

export default function ClientPaymentsPage() {
  const { user, loading, role } = useFirebase();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || role !== 'client')) {
      router.push('/auth/login');
    } else if (user && role === 'client') {
      fetchTransactions();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, role, router]);

  const fetchTransactions = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const transactionsRef = collection(db, "transactions");
      const q = query(
        transactionsRef,
        where("clientId", "==", user.uid), 
        orderBy("paidAt", "desc")
      );
      const querySnapshot = await getDocs(q);

      const fetchedTransactions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Transaction[];

      setTransactions(fetchedTransactions);
    } catch (err: any) {
      console.error("Error fetching transactions:", err);
      setError("Failed to load payment history. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return format(timestamp.toDate(), "MMM d, yyyy, h:mm a"); 
    } catch (e) {
      return 'Invalid Date';
    }
  };

   const getStatusBadgeVariant = (status: Transaction['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'succeeded': return 'default'; 
           case 'failed': return 'destructive';
           case 'pending': return 'secondary';
           case 'pending_release_to_student': return 'outline'; 
           default: return 'outline';
       }
   };

  if (isLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-destructive">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight">Payment History</h1>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>A record of all payments made for completed gigs.</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-10">
                 <IndianRupee className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No payment history found.</p>
               <p className="text-sm text-muted-foreground mt-1">Payments will appear here after you pay for completed gigs.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Gig Title</TableHead>
                  <TableHead>Paid To (Student)</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                   <TableHead>Payment ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(tx.paidAt)}</TableCell>
                    <TableCell>
                        <Link href={`/gigs/${tx.gigId}`} className="hover:underline font-medium">
                            {tx.gigTitle}
                        </Link>
                    </TableCell>
                    <TableCell>{tx.studentUsername}</TableCell>
                    <TableCell className="text-right font-medium">
                        ₹{tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(tx.status)} className="capitalize">
                        {tx.status === 'pending_release_to_student' ? 'Processing by HustleUp' : tx.status}
                      </Badge>
                    </TableCell>
                     <TableCell className="text-xs text-muted-foreground truncate max-w-[100px]">
                        {tx.paymentId || 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

