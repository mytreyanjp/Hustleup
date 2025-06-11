
"use client";

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search as SearchIconLucide, Briefcase, Users, CalendarDays, DollarSign, UserCircle, Filter as FilterIcon, X as XIcon, GraduationCap, Building } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Skill } from '@/lib/constants';
import type { UserProfile } from '@/context/firebase-context';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { PREDEFINED_SKILLS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface GigSearchResult {
  id: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  deadline: Timestamp;
  requiredSkills: Skill[];
  clientUsername?: string; 
  clientDisplayName?: string;
  clientAvatarUrl?: string;
  createdAt: Timestamp;
}

interface UserSearchResult extends UserProfile {}

type ActiveTab = 'gigs' | 'students' | 'clients';

const budgetRanges = [
  { label: "Any Payment", value: "any" },
  { label: "< ₹5,000", value: "0-5000" },
  { label: "₹5,000 - ₹20,000", value: "5000-20000" },
  { label: "₹20,000 - ₹50,000", value: "20000-50000" },
  { label: "> ₹50,000", value: "50000-" },
];

function SearchResultsPageContent() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q');
  const { user: currentUser, loading: authLoading } = useFirebase();

  const [allFetchedGigs, setAllFetchedGigs] = useState<GigSearchResult[]>([]);
  const [allFetchedUsers, setAllFetchedUsers] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('gigs');

  // Filter states
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [selectedSkillsFilterGigs, setSelectedSkillsFilterGigs] = useState<Skill[]>([]);
  const [selectedBudgetFilterGigs, setSelectedBudgetFilterGigs] = useState<string>("any");
  // User role filter removed, handled by tabs now

  useEffect(() => {
    if (!searchQuery || searchQuery.trim() === "") {
      setAllFetchedGigs([]);
      setAllFetchedUsers([]);
      setIsLoading(false);
      setActiveTab('gigs'); // Default to gigs if search is cleared
      return;
    }
    setActiveTab('gigs'); // Reset to gigs tab on new search

    const fetchResults = async () => {
      setIsLoading(true);
      setError(null);
      const lowerSearchTerm = searchQuery.toLowerCase();

      try {
        // Fetch Gigs
        const gigsCollectionRef = collection(db, 'gigs');
        const gigsQuery = query(gigsCollectionRef, where('status', '==', 'open'), orderBy('createdAt', 'desc'));
        const gigsSnapshot = await getDocs(gigsQuery);
        const allOpenGigs = gigsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as GigSearchResult[];

        const searchedGigs = allOpenGigs.filter(gig => {
          const titleMatch = gig.title.toLowerCase().includes(lowerSearchTerm);
          const descriptionMatch = gig.description.toLowerCase().includes(lowerSearchTerm);
          const skillsMatch = gig.requiredSkills.some(skill => skill.toLowerCase().includes(lowerSearchTerm));
          return titleMatch || descriptionMatch || skillsMatch;
        });
        setAllFetchedGigs(searchedGigs);

        // Fetch Users
        const usersCollectionRef = collection(db, 'users');
        // Consider adding orderBy('username') if your Firestore indexes support it with the search logic
        const usersSnapshot = await getDocs(usersCollectionRef);
        const allUsers = usersSnapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data(),
        })) as UserSearchResult[];

        const searchedUsers = allUsers.filter(userDoc => {
          const usernameMatch = userDoc.username?.toLowerCase().includes(lowerSearchTerm);
          const companyNameMatch = userDoc.companyName?.toLowerCase().includes(lowerSearchTerm);
          let skillsMatch = false;
          if (userDoc.role === 'student' && userDoc.skills) {
            skillsMatch = userDoc.skills.some((skill: string) => skill.toLowerCase().includes(lowerSearchTerm));
          }
          if (currentUser && userDoc.uid === currentUser.uid) return false; // Exclude self
          if (userDoc.role === 'admin') return false; // Exclude admins from public search
          if (userDoc.isBanned) return false; // Exclude banned users

          return usernameMatch || companyNameMatch || skillsMatch;
        });
        setAllFetchedUsers(searchedUsers);

      } catch (err: any) {
        console.error("Error fetching search results:", err);
        setError("Failed to load search results. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [searchQuery, currentUser]);

  const filteredGigs = useMemo(() => {
    let processedGigs = [...allFetchedGigs];
    if (selectedSkillsFilterGigs.length > 0) {
      const filterSkillsLower = selectedSkillsFilterGigs.map(s => s.toLowerCase());
      processedGigs = processedGigs.filter(gig =>
        gig.requiredSkills.some(reqSkill => filterSkillsLower.includes(reqSkill.toLowerCase()))
      );
    }
    if (selectedBudgetFilterGigs !== "any") {
      const [minStr, maxStr] = selectedBudgetFilterGigs.split('-');
      const min = parseInt(minStr, 10);
      const max = maxStr ? parseInt(maxStr, 10) : undefined;
      processedGigs = processedGigs.filter(gig => {
        if (max === undefined) return gig.budget >= min;
        return gig.budget >= min && gig.budget <= max;
      });
    }
    return processedGigs;
  }, [allFetchedGigs, selectedSkillsFilterGigs, selectedBudgetFilterGigs]);

  const filteredStudents = useMemo(() => {
    return allFetchedUsers.filter(user => user.role === 'student');
  }, [allFetchedUsers]);

  const filteredClients = useMemo(() => {
    return allFetchedUsers.filter(user => user.role === 'client');
  }, [allFetchedUsers]);


  const handleClearFilters = () => {
    setSelectedSkillsFilterGigs([]);
    setSelectedBudgetFilterGigs("any");
    // No user role filter to clear here anymore
    setIsFilterPopoverOpen(false);
  };

  const formatDateDistance = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  };

  const formatDeadline = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getInitials = (displayName?: string | null, email?: string | null | undefined, username?: string | null) => {
    const nameToUse = displayName || username;
    if (nameToUse) return nameToUse.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
  };

  if (authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (isLoading && searchQuery && searchQuery.trim() !== "") {
    return <div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  if (error) {
    return <div className="text-center py-10 text-destructive"><p>{error}</p></div>;
  }

  if (!searchQuery || searchQuery.trim() === "") {
    return (
      <div className="text-center py-10">
        <SearchIconLucide className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Enter a search term to find gigs or users.</p>
      </div>
    );
  }
  
  const renderTabButton = (tabName: ActiveTab, label: string, icon: React.ElementType) => {
    const IconComponent = icon;
    let count = 0;
    if (tabName === 'gigs') count = filteredGigs.length;
    else if (tabName === 'students') count = filteredStudents.length;
    else if (tabName === 'clients') count = filteredClients.length;

    return (
        <Button
            variant={activeTab === tabName ? "secondary" : "ghost"}
            onClick={() => setActiveTab(tabName)}
            className={cn("flex-1 sm:flex-none justify-center sm:justify-start py-2 px-3 h-auto text-sm sm:text-base", activeTab === tabName && "shadow-sm")}
        >
            <IconComponent className="mr-2 h-5 w-5" />
            {label} ({count})
        </Button>
    );
  };


  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight mb-4 sm:mb-0">Search Results for "{searchQuery}"</h1>
        <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <FilterIcon className="mr-2 h-4 w-4" /> Filter Results
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] max-w-md p-4" align="end">
            <div className="space-y-4">
              <h4 className="font-medium leading-none text-lg">Filter Options</h4>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Filter Gigs</p>
              <div>
                <label htmlFor="gig-skill-filter" className="block text-xs font-medium text-muted-foreground mb-1">By Skills</label>
                <MultiSelectSkills
                  options={PREDEFINED_SKILLS}
                  selected={selectedSkillsFilterGigs}
                  onChange={setSelectedSkillsFilterGigs}
                  placeholder="Select skills..."
                  className="w-full"
                  id="gig-skill-filter"
                />
              </div>
              <div>
                <label htmlFor="gig-budget-filter" className="block text-xs font-medium text-muted-foreground mb-1">By Payment (INR)</label>
                <Select value={selectedBudgetFilterGigs} onValueChange={setSelectedBudgetFilterGigs}>
                  <SelectTrigger id="gig-budget-filter" className="w-full text-xs h-9">
                    <SelectValue placeholder="Select payment range" />
                  </SelectTrigger>
                  <SelectContent>
                    {budgetRanges.map(range => (
                      <SelectItem key={range.value} value={range.value} className="text-xs">{range.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <Button onClick={handleClearFilters} variant="ghost" className="w-full justify-start text-sm text-destructive hover:text-destructive hover:bg-destructive/10">
                <XIcon className="mr-2 h-4 w-4" /> Clear All Filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col sm:flex-row border-b">
        {renderTabButton('gigs', 'Gigs', Briefcase)}
        {renderTabButton('students', 'Students', GraduationCap)}
        {renderTabButton('clients', 'Clients', Building)}
      </div>

      <div className="mt-6">
        {activeTab === 'gigs' && (
          <section>
            {filteredGigs.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No gigs found matching your search and filter criteria.</p>
            ) : (
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredGigs.map((gig) => (
                  <Card key={gig.id} className="glass-card flex flex-col">
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={gig.clientAvatarUrl} alt={gig.clientDisplayName || gig.clientUsername || 'Client'} />
                          <AvatarFallback>{getInitials(gig.clientDisplayName, undefined, gig.clientUsername)}</AvatarFallback>
                        </Avatar>
                        <CardDescription className="text-xs text-muted-foreground">
                          {gig.clientDisplayName || gig.clientUsername || 'Client'} &bull; {formatDateDistance(gig.createdAt)}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-2 p-4 sm:p-6 pt-0">
                      <p className="text-sm line-clamp-2 sm:line-clamp-3">{gig.description}</p>
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1">Required Skills:</h4>
                        <div className="flex flex-wrap gap-1">
                          {gig.requiredSkills?.slice(0, 3).map((skill, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                          ))}
                          {gig.requiredSkills?.length > 3 && <Badge variant="outline" className="text-xs">+{gig.requiredSkills.length - 3} more</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                        <DollarSign className="mr-1 h-4 w-4" /> Payment: {gig.currency} {gig.budget.toFixed(2)}
                      </div>
                      <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                        <CalendarDays className="mr-1 h-4 w-4" /> Deadline: {formatDeadline(gig.deadline)}
                      </div>
                    </CardContent>
                    <CardFooter className="p-4 sm:p-6 pt-0">
                      <Button asChild className="w-full" size="sm">
                        <Link href={`/gigs/${gig.id}`}>View Details</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'students' && (
          <section>
            {filteredStudents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No students found matching your search criteria.</p>
            ) : (
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map((userResult) => (
                  <Card key={userResult.uid} className="glass-card">
                    <CardHeader className="items-center text-center p-4 sm:p-6">
                      <Avatar className="h-20 w-20 mb-2">
                        <AvatarImage src={userResult.profilePictureUrl} alt={userResult.username || 'User'} />
                        <AvatarFallback>{getInitials(undefined, userResult.email, userResult.username)}</AvatarFallback>
                      </Avatar>
                      <CardTitle className="text-lg line-clamp-1">{userResult.username || 'Student'}</CardTitle>
                      <CardDescription className="capitalize text-sm">{userResult.role}</CardDescription>
                    </CardHeader>
                    {userResult.skills && userResult.skills.length > 0 && (
                      <CardContent className="text-center p-4 sm:p-6 pt-0">
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1">Top Skills:</h4>
                        <div className="flex flex-wrap gap-1 justify-center">
                          {userResult.skills.slice(0, 3).map((skill: string, index: number) => (
                            <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                          ))}
                          {userResult.skills.length > 3 && <Badge variant="outline" className="text-xs">+{userResult.skills.length - 3} more</Badge>}
                        </div>
                      </CardContent>
                    )}
                    <CardFooter className="p-4 sm:p-6 pt-0">
                      <Button asChild className="w-full" size="sm" variant="outline">
                        <Link href={`/profile/${userResult.uid}`}>View Profile</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'clients' && (
          <section>
            {filteredClients.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No clients found matching your search criteria.</p>
            ) : (
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredClients.map((userResult) => (
                  <Card key={userResult.uid} className="glass-card">
                    <CardHeader className="items-center text-center p-4 sm:p-6">
                      <Avatar className="h-20 w-20 mb-2">
                        <AvatarImage src={userResult.profilePictureUrl} alt={userResult.companyName || userResult.username || 'User'} />
                        <AvatarFallback>{getInitials(userResult.companyName, userResult.email, userResult.username)}</AvatarFallback>
                      </Avatar>
                      <CardTitle className="text-lg line-clamp-1">{userResult.companyName || userResult.username || 'Client'}</CardTitle>
                      <CardDescription className="capitalize text-sm">{userResult.role}</CardDescription>
                    </CardHeader>
                    {userResult.companyDescription && (
                        <CardContent className="text-center p-4 sm:p-6 pt-0">
                            <p className="text-xs text-muted-foreground line-clamp-2 sm:line-clamp-3">{userResult.companyDescription}</p>
                        </CardContent>
                    )}
                    <CardFooter className="p-4 sm:p-6 pt-0">
                      <Button asChild className="w-full" size="sm" variant="outline">
                        <Link href={`/profile/${userResult.uid}`}>View Profile</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
      <SearchResultsPageContent />
    </Suspense>
  );
}

    