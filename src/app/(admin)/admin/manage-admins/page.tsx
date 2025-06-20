
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'; // Added addDoc, serverTimestamp
import { db } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input'; // Added Input for search
import { Loader2, ArrowLeft, ShieldCheck, UserMinus, UserPlus, Search } from 'lucide-react'; // Added Search icon
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

type NotificationType = 'role_updated'; // Specific to this page for now

const createAdminRoleUpdateNotification = async (
    recipientUserId: string,
    message: string,
    adminActorId?: string,
    adminActorUsername?: string
) => {
    if (!db) {
        console.error("Firestore (db) not available for creating role update notification.");
        return;
    }
    try {
        await addDoc(collection(db, 'notifications'), {
            recipientUserId,
            message,
            type: 'role_updated' as NotificationType,
            isRead: false,
            createdAt: serverTimestamp(),
            adminActorId: adminActorId || 'system_admin',
            adminActorUsername: adminActorUsername || 'Admin Action',
        });
        console.log(`Role update notification created for ${recipientUserId}: ${message}`);
    } catch (error) {
        console.error("Error creating role update notification document:", error);
    }
};


export default function ManageAdminsPage() {
  const { user: currentAdmin, userProfile: currentAdminProfile } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    if (!db) {
      toast({ title: "Error", description: "Database not available.", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const fetchedUsers = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data(),
      })) as UserProfile[];
      setAllUsers(fetchedUsers);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({ title: "Error", description: "Could not load users.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) {
      return allUsers;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allUsers.filter(user =>
      user.username?.toLowerCase().includes(lowerSearchTerm) ||
      user.email?.toLowerCase().includes(lowerSearchTerm)
    );
  }, [allUsers, searchTerm]);

  const handleRoleChange = async (targetUserId: string, newRole: 'admin' | 'student' | 'client' | null) => {
    if (!currentAdmin || !db) {
        toast({ title: "Error", description: "Action cannot be completed.", variant: "destructive" });
        return;
    }
    if (targetUserId === currentAdmin.uid && newRole !== 'admin') {
        toast({ title: "Action Not Allowed", description: "You cannot demote yourself.", variant: "destructive"});
        return;
    }

    setIsUpdatingRole(targetUserId);
    try {
      const userDocRef = doc(db, 'users', targetUserId);
      const roleToSet = newRole === 'admin' ? 'admin' : (newRole || 'student'); // Default to student if null

      await updateDoc(userDocRef, { role: roleToSet });
      toast({
        title: "Role Updated",
        description: `User's role successfully changed to ${roleToSet}. A notification has been sent to the user.`,
      });

      const notificationMessage = `Your role on the platform has been updated to ${roleToSet} by an administrator.`;
      await createAdminRoleUpdateNotification(
        targetUserId,
        notificationMessage,
        currentAdmin.uid,
        currentAdminProfile?.username || currentAdmin.email?.split('@')[0] || 'Admin'
      );

      fetchUsers(); 
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast({ title: "Error", description: `Could not update role: ${error.message}`, variant: "destructive" });
    } finally {
      setIsUpdatingRole(null);
    }
  };
  
  const getInitials = (email?: string | null, username?: string | null) => {
    if (username && username.trim() !== '') return username.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
  };


  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
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
          <CardTitle className="text-lg sm:text-xl">Manage Admin Access</CardTitle>
          <CardDescription>Promote users to admin or demote admins. Search by username or email.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="mb-4 relative">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search users by username or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-full sm:max-w-sm text-sm"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">User</TableHead>
                <TableHead className="min-w-[150px]">Email</TableHead>
                <TableHead className="min-w-[100px]">Current Role</TableHead>
                <TableHead className="text-right min-w-[200px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((userItem) => (
                <TableRow key={userItem.uid}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={userItem.profilePictureUrl} alt={userItem.username || userItem.email || ''} />
                            <AvatarFallback>{getInitials(userItem.email, userItem.username)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate">{userItem.username || 'N/A'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="truncate">{userItem.email}</TableCell>
                  <TableCell>
                    <Badge variant={userItem.role === 'admin' ? 'default' : 'secondary'} className="capitalize text-xs">
                        {userItem.role || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col sm:flex-row gap-2 justify-end">
                        {userItem.role === 'admin' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRoleChange(userItem.uid, userItem.previousRole || 'student')} // Revert to previous or default to student
                            disabled={isUpdatingRole === userItem.uid || (currentAdmin?.uid === userItem.uid)}
                            className="w-full sm:w-auto text-xs sm:text-sm"
                          >
                            {isUpdatingRole === userItem.uid ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />}
                            Demote
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleRoleChange(userItem.uid, 'admin')}
                            disabled={isUpdatingRole === userItem.uid}
                            className="w-full sm:w-auto text-xs sm:text-sm"
                          >
                            {isUpdatingRole === userItem.uid ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />}
                            Promote to Admin
                          </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredUsers.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm.trim() ? 'No users match your search.' : 'No users found.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
    
