
"use client";

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, Search, ArrowRight, Filter as FilterIcon, X as XIcon } from 'lucide-react';
import Link from 'next/link';
import type { UserProfile } from '@/context/firebase-context'; 
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from '@/components/ui/separator';

export default function BrowseHustlersPage() {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkillsFilter, setSelectedSkillsFilter] = useState<Skill[]>([]);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

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
        // IMPORTANT: This query requires a composite index in Firestore:
        // Collection: 'users', Fields: 'role' (Ascending), 'username' (Ascending)
        // Create it in your Firebase console if it's missing.
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

  const filteredStudents = useMemo(() => {
    if (selectedSkillsFilter.length === 0) {
      return students;
    }
    const filterSkillsLower = selectedSkillsFilter.map(s => s.toLowerCase());
    return students.filter(student =>
      student.skills && student.skills.some(skill => filterSkillsLower.includes(skill.toLowerCase()))
    );
  }, [students, selectedSkillsFilter]);

  const getInitials = (email?: string | null, username?: string | null) => {
    if (username && username.trim() !== '') return username.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
  };

  const handleClearFilters = () => {
    setSelectedSkillsFilter([]);
    setIsFilterPopoverOpen(false); 
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-center text-center sm:text-left">
        <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Browse Hustlers</h1>
            <p className="text-muted-foreground text-sm sm:text-base">Discover talented students ready for your next project.</p>
        </div>
        <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="mt-4 sm:mt-0">
                    <FilterIcon className="mr-2 h-4 w-4" /> Filter Hustlers
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] max-w-sm p-4" align="end">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="skill-filter-hustlers" className="block text-sm font-medium text-muted-foreground mb-1">Skills</label>
                        <MultiSelectSkills
                            options={PREDEFINED_SKILLS}
                            selected={selectedSkillsFilter}
                            onChange={setSelectedSkillsFilter}
                            placeholder="Filter by skills..."
                            className="w-full"
                        />
                    </div>
                    <Separator />
                    <Button onClick={handleClearFilters} variant="ghost" className="w-full justify-start text-sm">
                        <XIcon className="mr-2 h-4 w-4" /> Clear All Filters
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
      </div>

      {filteredStudents.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader className="p-4 sm:p-6">
            <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle>No Students Found</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <p className="text-muted-foreground">No student profiles match your current filters. Try broadening your search!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
          {filteredStudents.map((student) => (
            <Card key={student.uid} className="glass-card flex flex-col">
              <CardHeader className="items-center text-center p-4 sm:p-6">
                <Avatar className="h-20 w-20 sm:h-20 mb-3">
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
