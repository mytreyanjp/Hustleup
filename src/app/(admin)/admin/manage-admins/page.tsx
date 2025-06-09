
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export default function ManageAdminsPage() {
  const { user: currentAdmin, userProfile: currentAdminProfile } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null); // Store UID of user being updated

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
      setUsers(fetchedUsers);
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
      // If demoting from admin, set to 'student' as a default.
      // Consider a more robust way to store/retrieve previous role if needed.
      const roleToSet = newRole === 'admin' ? 'admin' : 'student'; 

      await updateDoc(userDocRef, { role: roleToSet });
      toast({
        title: "Role Updated",
        description: `User's role successfully changed to ${roleToSet}.`,
      });
      fetchUsers(); // Refresh the list
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
    <div className="space-y-6">
      <Button variant="outline" size="sm" onClick={() => router.push('/admin/dashboard')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Admin Dashboard
      </Button>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Manage Admin Access</CardTitle>
          <CardDescription>Promote users to admin or demote admins.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((userItem) => (
                <TableRow key={userItem.uid}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={userItem.profilePictureUrl} alt={userItem.username || userItem.email || ''} />
                            <AvatarFallback>{getInitials(userItem.email, userItem.username)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{userItem.username || 'N/A'}</span>
                    </div>
                  </TableCell>
                  <TableCell>{userItem.email}</TableCell>
                  <TableCell>
                    <Badge variant={userItem.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                        {userItem.role || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {userItem.role === 'admin' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRoleChange(userItem.uid, 'student')} // Demote to student by default
                        disabled={isUpdatingRole === userItem.uid || (currentAdmin?.uid === userItem.uid)}
                      >
                        {isUpdatingRole === userItem.uid ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-4 w-4" />}
                        Demote from Admin
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleRoleChange(userItem.uid, 'admin')}
                        disabled={isUpdatingRole === userItem.uid}
                      >
                        {isUpdatingRole === userItem.uid ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        Promote to Admin
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground py-8">No users found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
