
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, Eye, Users as UsersIcon, Search as SearchIcon, Briefcase, GraduationCap, ShieldCheck as AdminIcon, Ban } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function AdminBrowseUsersPage() {
  const { user: adminUser, role: adminRole, loading: adminLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'client' | 'admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');

  useEffect(() => {
    if (!adminLoading && adminRole !== 'admin') {
      router.push('/');
      return;
    }
    if (!adminLoading && adminRole === 'admin' && db) {
      fetchUsers();
    }
  }, [adminLoading, adminRole, router]);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const usersQuery = query(collection(db, 'users'), orderBy('username', 'asc'));
      const usersSnapshot = await getDocs(usersQuery);
      const fetchedUsers = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data(),
      })) as UserProfile[];
      setAllUsers(fetchedUsers);
    } catch (err: any) {
      console.error("Error fetching users for admin:", err);
      setError("Failed to load users. Please try again.");
      toast({ title: "Loading Error", description: err.message || "Could not load users.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    let results = allUsers;

    if (roleFilter !== 'all') {
      results = results.filter(user => user.role === roleFilter);
    }

    if (statusFilter !== 'all') {
      results = results.filter(user => statusFilter === 'banned' ? user.isBanned === true : user.isBanned !== true);
    }

    if (searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase();
      results = results.filter(user => 
        user.username?.toLowerCase().includes(lowerSearchTerm) ||
        user.email?.toLowerCase().includes(lowerSearchTerm) ||
        (user.role === 'client' && user.companyName?.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return results;
  }, [allUsers, roleFilter, statusFilter, searchTerm]);

  const getInitials = (email?: string | null, username?: string | null, companyName?: string | null) => {
    const nameToUse = companyName || username;
    if (nameToUse && nameToUse.trim() !== '') return nameToUse.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
  };

  const getRoleIcon = (userRole?: UserProfile['role']) => {
    if (userRole === 'student') return <GraduationCap className="h-4 w-4 text-muted-foreground" />;
    if (userRole === 'client') return <Briefcase className="h-4 w-4 text-muted-foreground" />;
    if (userRole === 'admin') return <AdminIcon className="h-4 w-4 text-muted-foreground" />;
    return <UsersIcon className="h-4 w-4 text-muted-foreground" />;
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
          <CardTitle className="text-lg sm:text-xl">Browse All Users</CardTitle>
          <CardDescription>View, search, and filter all users on the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4">
            <div className="relative flex-grow sm:max-w-xs">
                <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                type="search"
                placeholder="Search by Name, Email, Company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 text-xs sm:text-sm h-9"
                />
            </div>
            <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as typeof roleFilter)}>
              <SelectTrigger className="w-full sm:w-[150px] text-xs sm:text-sm h-9">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-[150px] text-xs sm:text-sm h-9">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No users found for the selected filters.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredUsers.map((userItem) => (
                <Card key={userItem.uid} className="glass-card flex flex-col">
                  <CardHeader className="items-center text-center p-3 sm:p-4">
                    <Avatar className="h-16 w-16 sm:h-20 sm:w-20 mb-2">
                      <AvatarImage src={userItem.profilePictureUrl} alt={userItem.username || 'User'} />
                      <AvatarFallback>{getInitials(userItem.email, userItem.username, userItem.companyName)}</AvatarFallback>
                    </Avatar>
                    <CardTitle className="text-base sm:text-lg line-clamp-1">{userItem.companyName || userItem.username || 'User'}</CardTitle>
                    <div className="flex items-center gap-1.5">
                        {getRoleIcon(userItem.role)}
                        <CardDescription className="capitalize text-xs sm:text-sm">{userItem.role || 'N/A'}</CardDescription>
                    </div>
                    {userItem.isBanned && <Badge variant="destructive" className="mt-1 text-xs"><Ban className="mr-1 h-3 w-3"/>Banned</Badge>}
                  </CardHeader>
                  <CardContent className="text-center p-3 sm:p-4 pt-0 text-xs sm:text-sm text-muted-foreground flex-grow">
                    <p className="truncate">{userItem.email}</p>
                    {userItem.role === 'client' && userItem.username && userItem.companyName && userItem.username !== userItem.companyName && (
                        <p className="text-xs truncate">(Contact: {userItem.username})</p>
                    )}
                  </CardContent>
                  <CardFooter className="p-3 sm:p-4 pt-0">
                    <Button asChild className="w-full" size="sm" variant="outline">
                      <Link href={`/profile/${userItem.uid}`}><Eye className="mr-1" /> View Profile</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
