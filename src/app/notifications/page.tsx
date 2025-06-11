
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, orderBy, Timestamp, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, BellOff, CheckCheck, ArrowLeft, Info, Briefcase, UserX, UserCheck, AlertTriangle, Send, CheckCircle, XCircle } from 'lucide-react'; // Changed UserWarning to UserX
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Notification, NotificationType } from '@/types/notifications';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'gig_closed_due_to_ban': return <Briefcase className="h-5 w-5 text-destructive" />;
    case 'student_removed_due_to_ban': return <UserX className="h-5 w-5 text-destructive" />;
    case 'applicant_removed_due_to_ban': return <UserX className="h-5 w-5 text-destructive" />;
    case 'account_warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'role_updated': return <UserCheck className="h-5 w-5 text-blue-500" />;
    case 'payment_released': return <Send className="h-5 w-5 text-green-500" />;
    case 'report_submitted': return <Info className="h-5 w-5 text-blue-500" />;
    case 'report_reviewed': return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'new_applicant': return <UserCheck className="h-5 w-5 text-primary" />;
    case 'application_status_update': return <Briefcase className="h-5 w-5 text-primary" />;
    // Add more cases as new notification types are introduced
    default: return <Info className="h-5 w-5 text-muted-foreground" />;
  }
};


export default function NotificationsPage() {
  const { user, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/auth/login?redirect=/notifications');
        return;
      }
      if (user && db) {
        setIsLoading(true);
        setError(null);
        const notificationsQuery = query(
          collection(db, 'notifications'),
          where('recipientUserId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
          const fetchedNotifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
          setNotifications(fetchedNotifications);
          setIsLoading(false);
        }, (err) => {
          console.error("Error fetching notifications:", err);
          setError("Failed to load notifications. Please try again.");
          setIsLoading(false);
        });
        return () => unsubscribe();
      }
    }
  }, [user, authLoading, router]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!db) return;
    try {
      const notifDocRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifDocRef, { isRead: true });
      // Optimistic update handled by onSnapshot
    } catch (err) {
      console.error("Error marking notification as read:", err);
      toast({ title: "Error", description: "Could not mark notification as read.", variant: "destructive" });
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!db || !user) return;
    const unreadNotifications = notifications.filter(n => !n.isRead);
    if (unreadNotifications.length === 0) {
      toast({ title: "No unread notifications", description: "All notifications are already marked as read.", variant: "default" });
      return;
    }
    const batch = writeBatch(db);
    unreadNotifications.forEach(notif => {
      const notifDocRef = doc(db, 'notifications', notif.id);
      batch.update(notifDocRef, { isRead: true });
    });
    try {
      await batch.commit();
      toast({ title: "All Marked as Read", description: `${unreadNotifications.length} notifications marked as read.`});
    } catch (err) {
      console.error("Error marking all as read:", err);
      toast({ title: "Error", description: "Could not mark all notifications as read.", variant: "destructive" });
    }
  };

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'Just now';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  };

  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  if (error) {
    return <div className="text-center py-10 text-destructive"><p>{error}</p></div>;
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2 self-start">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        {notifications.some(n => !n.isRead) && (
          <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} className="w-full sm:w-auto">
            <CheckCheck className="mr-2 h-4 w-4" /> Mark All as Read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader><BellOff className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><CardTitle>No Notifications Yet</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">You have no notifications at this time.</p></CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <Card key={notif.id} className={cn("glass-card", !notif.isRead && "border-primary/50 ring-1 ring-primary/30")}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="pt-1">
                  {getNotificationIcon(notif.type)}
                </div>
                <div className="flex-grow">
                  <p className={cn("text-sm", !notif.isRead && "font-semibold")}>{notif.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(notif.createdAt)}</p>
                   {notif.relatedGigTitle && <p className="text-xs text-muted-foreground mt-0.5">Gig: {notif.relatedGigTitle}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                   {notif.link && (
                    <Button variant="link" size="xs" asChild className="h-auto p-0 text-xs">
                       <Link href={notif.link}>View Details</Link>
                    </Button>
                   )}
                  {!notif.isRead && (
                    <Button variant="ghost" size="xs" onClick={() => handleMarkAsRead(notif.id)} className="h-auto p-1 text-xs">
                       Mark as Read
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
