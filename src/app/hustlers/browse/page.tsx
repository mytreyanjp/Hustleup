
"use client";

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, Search, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { UserProfile } from '@/context/firebase-context'; 

export default function BrowseHustlersPage() {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStudents = async () => {
      setIsLoading(true);
      setError(null);
      if (!db) {
        setError("Database not available.");
        setIsLoading(false);
        return;
      }
      try {
        const usersRef = collection(db, 'users');
        // Query for users where role is 'student' and order by username
        // IMPORTANT: This query requires a composite index in Firestore:
        // Collection: 'users', Fields: 'role' (Ascending), 'username' (Ascending)
        // You should have received a console error with a link to create this if it was missing.
        // Link: https://console.firebase.google.com/v1/r/project/hustleup-ntp15/firestore/indexes?create_composite=Ckxwcm9qZWN0cy9odXN0bGV1cC1udHAxNS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvdXNlcnMvaW5kZXhlcy9fEAEaCAoEcm9sZRABGgwKCHVzZXJuYW1lEAEaDAoIX19uYW1lX18QAQ
        const q = query(usersRef, where('role', '==', 'student'), orderBy('username', 'asc'));
        const querySnapshot = await getDocs(q);

        const fetchedStudents = querySnapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data(),
        })) as UserProfile[];
        setStudents(fetchedStudents);
      } catch (err: any) {
        console.error("Error fetching students:", err);
        setError("Failed to load student profiles. This might be due to a missing Firestore index. Please check your Firebase console for errors and create the required index if prompted.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, []);

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

  if (error) {
    return (
      <div className="text-center py-10 text-destructive">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center">
        <Users className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-primary mb-2" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Browse Hustlers</h1>
        <p className="text-muted-foreground text-sm sm:text-base">Discover talented students ready for your next project.</p>
      </div>

      {students.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader className="p-4 sm:p-6">
            <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle>No Students Found</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <p className="text-muted-foreground">No student profiles are available at the moment. Check back later!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {students.map((student) => (
            <Card key={student.uid} className="glass-card flex flex-col">
              <CardHeader className="items-center text-center p-4 sm:p-6">
                <Avatar className="h-20 w-20 sm:h-24 sm:w-24 mb-3">
                  <AvatarImage src={student.profilePictureUrl} alt={student.username || 'Student'} />
                  <AvatarFallback>{getInitials(student.email, student.username)}</AvatarFallback>
                </Avatar>
                <CardTitle className="text-md sm:text-lg line-clamp-1">{student.username || 'Student User'}</CardTitle>
                {student.bio && (
                  <CardDescription className="text-xs sm:text-sm line-clamp-2">
                    {student.bio}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-grow p-4 sm:p-6 pt-0">
                {student.skills && student.skills.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1 text-center">Top Skills:</h4>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {student.skills.slice(0, 3).map((skill, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                      ))}
                      {student.skills.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{student.skills.length - 3} more</Badge>
                      )}
                    </div>
                  </div>
                )}
                {!student.skills || student.skills.length === 0 && !student.bio && (
                    <p className="text-xs text-muted-foreground text-center">Profile details not yet available.</p>
                )}
              </CardContent>
              <CardFooter className="p-4 sm:p-6 pt-0">
                <Button asChild className="w-full" size="sm">
                  <Link href={`/profile/${student.uid}`}>
                    View Profile <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

