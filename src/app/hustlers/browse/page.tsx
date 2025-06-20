
"use client";

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, Search, FilterIcon, X as XIcon, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { UserProfile } from '@/context/firebase-context'; 
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from '@/components/ui/separator';
import { useFirebase } from '@/context/firebase-context'; // Import useFirebase


export default function BrowseHustlersPage() {
  const { user: currentUser, userProfile: viewerUserProfile, loading: authLoading } = useFirebase(); // Get viewer's profile
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
        const q = query(usersRef, where('role', '==', 'student'), orderBy('username', 'asc'));
        const querySnapshot = await getDocs(q);

        let fetchedStudents = querySnapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data(),
        })) as UserProfile[];
        
        // Filter out blocked users if viewerUserProfile is available
        if (viewerUserProfile && viewerUserProfile.blockedUserIds && viewerUserProfile.blockedUserIds.length > 0) {
            fetchedStudents = fetchedStudents.filter(student => !viewerUserProfile.blockedUserIds?.includes(student.uid));
        }

        setStudents(fetchedStudents);
      } catch (err: any) {
        console.error("Error fetching students:", err);
        setError("Failed to load student profiles. This might be due to a missing Firestore index. Please check your Firebase console for errors and create the required index if prompted.");
      } finally {
        setIsLoading(false);
      }
    };

    // Fetch students only after authLoading is false, to ensure viewerUserProfile is potentially available
    if (!authLoading) {
        fetchStudents();
    }

  }, [authLoading, viewerUserProfile]);

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
  
  const pageIsLoading = authLoading || isLoading;

  if (pageIsLoading) {
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
    <div
      className="relative min-h-[calc(100vh-4rem)] w-screen ml-[calc(50%-50vw)] mt-[-2rem] mb-[-2rem] bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url('https://picsum.photos/1980/1080')" }}
      data-ai-hint="modern office"
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm"></div>
      
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center text-center sm:text-left mb-8">
          <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground pt-8 sm:pt-0">Browse Hustlers</h1>
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
          <Card className="glass-card text-center py-10 max-w-lg mx-auto mt-4">
            <CardHeader className="p-4 sm:p-6">
              <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle>No Students Found</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <p className="text-muted-foreground">No student profiles match your current filters. Try broadening your search!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 pb-8">
            {filteredStudents.map((student) => (
              <Link 
                href={`/profile/${student.uid}`} 
                key={student.uid} 
                className="block hover:shadow-xl focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-shadow duration-200 rounded-lg group h-full"
              >
                <Card className="glass-card flex flex-col h-full group-hover:border-primary/50 transition-colors duration-200">
                  <CardHeader className="items-center text-center p-4 sm:p-6 pb-3 flex-grow">
                    <Avatar className="h-16 w-16 sm:h-20 sm:w-20 mb-2">
                      <AvatarImage src={student.profilePictureUrl} alt={student.username || 'Student'} />
                      <AvatarFallback>{getInitials(student.email, student.username)}</AvatarFallback>
                    </Avatar>
                    <CardTitle className="text-base sm:text-lg truncate w-full">{student.companyName || student.username || 'User'}</CardTitle>
                    <CardDescription className="capitalize text-xs sm:text-sm truncate w-full">{student.role}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

