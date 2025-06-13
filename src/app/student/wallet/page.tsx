
"use client";

import { useState, useEffect } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Wallet, Download, IndianRupee } from 'lucide-react'; // Added IndianRupee
import Link from 'next/link';
import { format } from 'date-fns';

// Assume the same Transaction interface as client/payments,
// but queried by studentId
interface Transaction {
  id: string; // Firestore document ID
  gigId: string;
  gigTitle: string; // Denormalized
  clientId: string; // Added clientId
  clientUsername: string; // Denormalized
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending' | 'processing'; // Added processing
  razorpayPaymentId: string;
  paidAt: Timestamp; // Timestamp of successful payment/payout initiation
}

export default function StudentWalletPage() {
  const { user, loading, role } = useFirebase();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);

  useEffect(() => {
    if (!loading && (!user || role !== 'student')) {
      router.push('/auth/login');
    } else if (user && role === 'student') {
      fetchTransactions();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, role, router]);

  const fetchTransactions = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      // Querying the same 'transactions' collection, but by studentId
      const transactionsRef = collection(db, "transactions");
      const q = query(
        transactionsRef,
        where("studentId", "==", user.uid), // Filter by student ID
         where("status", "==", "succeeded"), // Only show successful payouts
        orderBy("paidAt", "desc")
      );
      const querySnapshot = await getDocs(q);

      let earnedSum = 0;
      const fetchedTransactions = querySnapshot.docs.map(doc => {
         const data = doc.data();
         earnedSum += data.amount || 0;
        return {
          id: doc.id,
          ...data,
        } as Transaction;
      });

      setTransactions(fetchedTransactions);
       setTotalEarned(earnedSum);
    } catch (err: any) {
      console.error("Error fetching student transactions:", err);
      setError("Failed to load your earnings history. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

   const formatDate = (timestamp: Timestamp | undefined): string => {
     if (!timestamp) return 'N/A';
     try {
       return format(timestamp.toDate(), "MMM d, yyyy"); // e.g., Jan 15, 2025
     } catch (e) {
       return 'Invalid Date';
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
      <h1 className="text-3xl font-bold tracking-tight">My Wallet</h1>

       <Card className="glass-card bg-gradient-to-r from-primary to-accent text-primary-foreground">
           <CardHeader>
               <CardTitle className="text-xl">Total Earnings</CardTitle>
                <CardDescription className="text-primary-foreground/80">The sum of all successful payouts received.</CardDescription>
           </CardHeader>
            <CardContent>
               <p className="text-4xl font-bold">₹{totalEarned.toFixed(2)}</p>
            </CardContent>
             {/* Optional: Add payout button if implementing withdrawals */}
             {/* <CardFooter>
                 <Button variant="secondary">Withdraw Funds (Soon)</Button>
             </CardFooter> */}
       </Card>


      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Earnings History</CardTitle>
          <CardDescription>Record of payments received from clients for completed gigs.</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
             <div className="text-center py-10">
                 <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No earnings history found yet.</p>
               <p className="text-sm text-muted-foreground mt-1">Completed and paid gigs will appear here.</p>
                <Button variant="outline" asChild className="mt-4">
                     <Link href="/gigs/browse">Find Gigs to Earn</Link>
                 </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date Received</TableHead>
                  <TableHead>Gig Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
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
                    <TableCell>{tx.clientUsername || 'N/A'}</TableCell>
                    <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                       + ₹{tx.amount.toFixed(2)}
                    </TableCell>
                     <TableCell className="text-xs text-muted-foreground truncate max-w-[100px]">
                       {tx.razorpayPaymentId}
                     </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
         {transactions.length > 0 && (
             <CardFooter className="justify-end">
                 <Button variant="outline" disabled>
                     <Download className="mr-2 h-4 w-4" /> Export History (Soon)
                 </Button>
             </CardFooter>
         )}
      </Card>
    </div>
  );
}
