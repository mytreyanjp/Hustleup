
"use client";

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarDays, Star, Filter as FilterIcon, X as XIcon, Settings2, Layers, IndianRupee, Compass } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from '@/components/ui/separator';

const COMMISSION_RATE = 0.02; // 2%

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number; // Gross budget
  currency: string;
  deadline: Timestamp;
  requiredSkills: Skill[];
  clientId: string;
  clientUsername?: string;
  clientDisplayName?: string;
  clientAvatarUrl?: string;
  createdAt: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: { studentId: string; studentUsername: string; message?: string; appliedAt: Timestamp }[];
  applicationRequests?: { studentId: string; studentUsername: string; requestedAt: Timestamp; status: 'pending' | 'approved_to_apply' | 'denied_to_apply' }[];
  isFromFollowedClient?: boolean;
  numberOfReports?: number;
}

const budgetRanges = [
  { label: "Any Payment", value: "any" },
  { label: "< ₹5,000", value: "0-5000" },
  { label: "₹5,000 - ₹20,000", value: "5000-20000" },
  { label: "₹20,000 - ₹50,000", value: "20000-50000" },
  { label: "> ₹50,000", value: "50000-" },
];

export default function BrowseGigsPage() {
  const { user: currentUser, userProfile, loading: authLoading, role } = useFirebase();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSkillsFilter, setSelectedSkillsFilter] = useState<Skill[]>([]);
  const [selectedBudgetFilter, setSelectedBudgetFilter] = useState<string>("any");
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

  useEffect(() => {
    const fetchAndFilterGigs = async () => {
      setIsLoading(true);
      setError(null);
      if (!db) {
        setError("Database not available.");
        setIsLoading(false);
        return;
      }
      try {
        const gigsCollectionRef = collection(db, 'gigs');
        const q = query(
          gigsCollectionRef,
          where('status', '==', 'open'),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        let allOpenGigs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          isFromFollowedClient: false, 
        })) as Gig[];

        // Filter out gigs from blocked clients if viewer is a student
        if (currentUser && role === 'student' && userProfile && userProfile.blockedUserIds && userProfile.blockedUserIds.length > 0) {
          allOpenGigs = allOpenGigs.filter(gig => !userProfile.blockedUserIds?.includes(gig.clientId));
        }


        if (!authLoading && currentUser && role === 'student' && userProfile) {
          const followedClientIds = userProfile.following || [];
          const studentSkillsLower = (userProfile.skills as Skill[])?.map(s => s.toLowerCase()) || [];

          let followedGigsTemp: Gig[] = [];
          let skillBasedGigsTemp: Gig[] = [];
          let otherGigsTemp: Gig[] = []; 

          const unappliedGigs = allOpenGigs.filter(gig => {
            const hasRequested = gig.applicationRequests?.some(req => req.studentId === currentUser.uid);
            const hasAppliedFull = gig.applicants?.some(app => app.studentId === currentUser.uid);
            return !hasRequested && !hasAppliedFull;
          });


          unappliedGigs.forEach(gig => {
            if (followedClientIds.includes(gig.clientId)) {
              followedGigsTemp.push({ ...gig, isFromFollowedClient: true });
            } else {
              if (studentSkillsLower.length > 0) {
                const gigSkillsLower = gig.requiredSkills.map(s => s.toLowerCase());
                const hasMatchingSkill = studentSkillsLower.some(studentSkill => 
                  gigSkillsLower.some(reqSkill => {
                    const studentSkillWords = studentSkill.split(/\s+/).filter(w => w.length > 1);
                    const reqSkillWords = reqSkill.split(/\s+/).filter(w => w.length > 1);
                    return studentSkill.includes(reqSkill) || reqSkill.includes(studentSkill) ||
                           studentSkillWords.some(word => reqSkillWords.includes(word));
                  })
                );
                if (hasMatchingSkill) {
                  skillBasedGigsTemp.push(gig);
                } else {
                  otherGigsTemp.push(gig); 
                }
              } else {
                otherGigsTemp.push(gig);
              }
            }
          });
          
          setGigs([...followedGigsTemp, ...skillBasedGigsTemp, ...otherGigsTemp]);

        } else {
          setGigs(allOpenGigs.filter(gig => 
            !(currentUser && (
                (gig.applicationRequests?.some(req => req.studentId === currentUser.uid)) ||
                (gig.applicants?.some(app => app.studentId === currentUser.uid))
            ))
          ));
        }

      } catch (err: any) {
        console.error("Error fetching gigs:", err);
        setError("Failed to load gigs. Please try again later. This might be due to a missing Firestore index. Check the console for a link to create it.");
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) { 
        fetchAndFilterGigs();
    } else {
        setIsLoading(true); 
    }
  }, [authLoading, currentUser, role, userProfile]);

  const filteredAndSortedGigs = useMemo(() => {
    let processedGigs = [...gigs]; 

    if (selectedSkillsFilter.length > 0) {
      const filterSkillsLower = selectedSkillsFilter.map(s => s.toLowerCase());
      processedGigs = processedGigs.filter(gig => 
        gig.requiredSkills.some(reqSkill => filterSkillsLower.includes(reqSkill.toLowerCase()))
      );
    }

    if (selectedBudgetFilter !== "any") {
      const [minStr, maxStr] = selectedBudgetFilter.split('-');
      const min = parseInt(minStr, 10);
      const max = maxStr ? parseInt(maxStr, 10) : undefined;
      
      processedGigs = processedGigs.filter(gig => {
        const netBudget = gig.budget * (1 - COMMISSION_RATE); // Calculate net budget for filtering
        if (max === undefined) { 
          return netBudget >= min;
        }
        return netBudget >= min && netBudget <= max;
      });
    }
    
    processedGigs.sort((a, b) => {
      if (a.isFromFollowedClient && !b.isFromFollowedClient) return -1;
      if (!a.isFromFollowedClient && b.isFromFollowedClient) return 1;
      return b.createdAt.toMillis() - a.createdAt.toMillis(); 
    });

    return processedGigs;
  }, [gigs, selectedSkillsFilter, selectedBudgetFilter]);

  const formatDateDistance = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  };

   const formatDeadline = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return `Due on ${timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
   };
   
  const getClientInitials = (displayName?: string, username?: string) => {
    const nameToUse = displayName || username;
    if (nameToUse) return nameToUse.substring(0, 2).toUpperCase();
    return 'C';
  };

  const handleClearFilters = () => {
    setSelectedSkillsFilter([]);
    setSelectedBudgetFilter("any");
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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground pt-8 sm:pt-0">Explore Gigs</h1>
            <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="mt-4 sm:mt-0">
                        <FilterIcon className="mr-2 h-4 w-4" /> Filter Gigs
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] max-w-sm p-4" align="end">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="skill-filter-gigs" className="block text-sm font-medium text-muted-foreground mb-1">Skills</label>
                            <MultiSelectSkills
                                options={PREDEFINED_SKILLS}
                                selected={selectedSkillsFilter}
                                onChange={setSelectedSkillsFilter}
                                placeholder="Filter by skills..."
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="budget-filter-gigs" className="block text-sm font-medium text-muted-foreground mb-1">Payment (INR) - Student Payout</label>
                            <Select value={selectedBudgetFilter} onValueChange={setSelectedBudgetFilter}>
                                <SelectTrigger id="budget-filter-gigs" className="w-full">
                                <SelectValue placeholder="Select payment range" />
                                </SelectTrigger>
                                <SelectContent>
                                {budgetRanges.map(range => (
                                    <SelectItem key={range.value} value={range.value}>
                                    {range.label}
                                    </SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Separator />
                        <Button onClick={handleClearFilters} variant="ghost" className="w-full justify-start text-sm">
                            <XIcon className="mr-2 h-4 w-4" /> Clear All Filters
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
        
        {filteredAndSortedGigs.length === 0 && !pageIsLoading ? (
          <Card className="glass-card text-center py-10 max-w-lg mx-auto mt-4">
              <CardHeader className="p-4 sm:p-6">
                  <FilterIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <CardTitle>No Gigs Found</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                  <p className="text-muted-foreground">
                     No open gigs match your current filters or skill preferences. Try adjusting your filters or check back later!
                  </p>
              </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 sm:gap-6 pb-8">
            {filteredAndSortedGigs.map((gig) => {
              const netPayment = gig.budget * (1 - COMMISSION_RATE);
              return (
              <Card key={gig.id} className="glass-card flex flex-col"> 
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex justify-between items-start">
                      <Link href={`/gigs/${gig.id}`} className="hover:underline flex-grow mr-2">
                        <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
                      </Link>
                      {gig.isFromFollowedClient && (
                          <Badge variant="outline" className="text-xs border-primary text-primary ml-auto shrink-0 flex items-center gap-1">
                              <Star className="h-3 w-3" /> Following
                          </Badge>
                      )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={gig.clientAvatarUrl} alt={gig.clientDisplayName || gig.clientUsername || 'Client'} />
                      <AvatarFallback>{getClientInitials(gig.clientDisplayName, gig.clientUsername)}</AvatarFallback>
                    </Avatar>
                    <CardDescription className="text-xs text-muted-foreground">
                      {gig.clientDisplayName || gig.clientUsername || 'Client'} &bull; {formatDateDistance(gig.createdAt)}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow p-4 sm:p-6 pt-0">
                  <p className="text-sm line-clamp-2 sm:line-clamp-3 mb-3 sm:mb-4">{gig.description}</p>
                   <div className="mb-3 sm:mb-4">
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1">Required Skills:</h4>
                      <div className="flex flex-wrap gap-1">
                          {gig.requiredSkills?.slice(0, 3).map((skill, index) => ( 
                              <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                          ))}
                          {gig.requiredSkills?.length > 3 && <Badge variant="outline" className="text-xs">+{gig.requiredSkills.length - 3} more</Badge>}
                      </div>
                   </div>
                   <div className="flex items-center text-xs sm:text-sm text-muted-foreground mb-1">
                       <IndianRupee className="mr-1 h-4 w-4" /> Payment: ₹{netPayment.toFixed(2)} (Student Payout)
                   </div>
                   <div className="flex items-center text-xs sm:text-sm text-muted-foreground mb-1">
                       <CalendarDays className="mr-1 h-4 w-4" /> {formatDeadline(gig.deadline)}
                   </div>
                   {gig.numberOfReports > 0 && (
                    <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                       <Layers className="mr-1 h-4 w-4" /> Requires {gig.numberOfReports} progress report{gig.numberOfReports > 1 ? 's' : ''}
                   </div>
                   )}
                </CardContent>
                <CardFooter className="p-4 sm:p-6 pt-0">
                  {role === 'admin' ? (
                    <Button asChild className="w-full" size="sm" variant="secondary">
                        <Link href={`/admin/manage-gigs/${gig.id}`}>
                            <Settings2 className="mr-2 h-4 w-4" /> Manage Gig
                        </Link>
                    </Button>
                  ) : (
                    <Button asChild className="w-full" size="sm">
                        <Link href={`/gigs/${gig.id}`}>
                        {role === 'client' ? "View Details" : "View Details & Apply"}
                        </Link>
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )})}
          </div>
        )}
      </div>
    </div>
  );
}

