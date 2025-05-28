
"use client";

import Link from 'next/link';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/mode-toggle';
import { useFirebase } from '@/context/firebase-context';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { LogOut, Settings, LayoutDashboard, Briefcase, GraduationCap, MessageSquare, Search as SearchIcon, Users as HustlersIcon, Compass, Loader2, HelpCircle, Bookmark, FileText as ApplicationsIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import type { Skill } from '@/lib/constants';

interface SuggestedGig {
  id: string;
  title: string;
  requiredSkills: Skill[];
  type: 'gig';
}

export default function Navbar() {
  const { user, userProfile, loading, role, totalUnreadChats } = useFirebase();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedGig[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);


  const fetchInitialSuggestions = useCallback(async () => {
    if (!db || suggestions.length > 0 && searchTerm.trim() === '') return; // Don't refetch if already have suggestions unless searching
    setIsLoadingSuggestions(true);
    try {
      const gigsCollectionRef = collection(db, 'gigs');
      // IMPORTANT: This query requires a composite index in Firestore:
      // Collection: 'gigs', Fields: 'status' (Ascending), 'createdAt' (Descending)
      const q = query(
        gigsCollectionRef,
        where('status', '==', 'open'),
        orderBy('createdAt', 'desc'),
        limit(10) // Fetch a small number for suggestions
      );
      const querySnapshot = await getDocs(q);
      const fetchedGigs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        title: doc.data().title || "Untitled Gig",
        requiredSkills: (doc.data().requiredSkills as Skill[]) || [],
        type: 'gig' as 'gig',
      })) as SuggestedGig[];
      setSuggestions(fetchedGigs);
    } catch (error) {
      console.error("Error fetching initial gig suggestions:", error);
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [suggestions.length, searchTerm]); // Added searchTerm dependency

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isSuggestionsOpen && searchTerm.trim() !== '' && !isLoadingSuggestions) {
      // Optionally re-fetch or rely on client-side filtering of initially fetched suggestions
      // For now, we filter client-side. If a more dynamic backend search for suggestions is needed,
      // fetchInitialSuggestions could be called here with the searchTerm.
      // For simplicity with Genkit, we'll rely on the initial fetch and client-side filtering.
    } else if (isSuggestionsOpen && suggestions.length === 0 && !isLoadingSuggestions) {
      fetchInitialSuggestions();
    }
  }, [isSuggestionsOpen, searchTerm, suggestions.length, isLoadingSuggestions, fetchInitialSuggestions]);


  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/');
      setSearchTerm('');
      setSuggestions([]);
      setIsSuggestionsOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const getInitials = (email: string | null | undefined) => {
    if (!email) return '??';
    const username = userProfile?.username;
    if (username && username.trim() !== '') return username.substring(0, 2).toUpperCase();
    return email.substring(0, 2).toUpperCase();
  };

  const handleSearchSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
      setIsSuggestionsOpen(false);
      // setSearchTerm(''); // Keep search term if user might want to refine from search page
    }
  };

  const filteredSuggestions = searchTerm.trim() === '' ? suggestions.slice(0,5) : suggestions.filter(suggestion => // Show some initial if no search term
    suggestion.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (suggestion.requiredSkills && suggestion.requiredSkills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())))
  ).slice(0,5); // Limit displayed suggestions

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Removed pl-10, container will use its default padding */}
      <div className="container flex h-16 items-center">
        <Link href="/" className="mr-4 flex items-center space-x-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span className="font-bold hidden sm:inline-block">HustleUp</span>
        </Link>

        <nav className="flex-1 items-center space-x-2 sm:space-x-4 hidden md:flex">
          <Link href="/gigs/browse" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center">
            <SearchIcon className={cn("mr-1 h-4 w-4", isClient ? "sm:inline-block" : "hidden")} />
             {isClient && role === 'student' ? 'Explore' : 'Gigs'}
          </Link>

          {isClient && role === 'client' && (
            <Link href="/hustlers/browse" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center">
              <HustlersIcon className={cn("mr-1 h-4 w-4", isClient ? "sm:inline-block" : "hidden")} /> Hustlers
            </Link>
          )}

          {isClient && role === 'student' && (
            <Link href="/student/dashboard" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
              Dashboard
            </Link>
          )}
          {isClient && role === 'client' && (
            <Link href="/client/dashboard" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
              Dashboard
            </Link>
          )}
          {isClient && user && (
            <Link href="/chat" className="relative text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center">
              <MessageSquare className={cn("mr-1 h-4 w-4", isClient ? "sm:inline-block" : "hidden")} />
              <span className="hidden lg:inline-block">Messages</span>
              {totalUnreadChats > 0 && (
                <span className="absolute top-0 right-0 flex h-4 w-4 -translate-y-1/3 translate-x-1/3 items-center justify-center rounded-full bg-red-500 text-white text-[10px] leading-none">
                  {totalUnreadChats > 9 ? '9+' : totalUnreadChats}
                </span>
              )}
            </Link>
          )}
        </nav>

        {/* This div groups search and profile elements, justify-end pushes them to the right of this div */}
        {/* The flex-1 on the nav element pushes this entire div to the right of the container */}
        <div className="flex flex-1 md:flex-none items-center justify-end space-x-2">
          {isClient && (
            <Popover open={isSuggestionsOpen} onOpenChange={(open) => {
              setIsSuggestionsOpen(open);
              if (open && suggestions.length === 0 && !isLoadingSuggestions) {
                fetchInitialSuggestions();
              }
            }}>
              <PopoverTrigger asChild>
                <form onSubmit={handleSearchSubmit} className="relative w-full max-w-xs md:ml-4">
                  <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    type="search"
                    placeholder="Search gigs..."
                    className={cn("pl-8 h-9 w-full")}
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        if (e.target.value.trim() !== '') {
                            setIsSuggestionsOpen(true);
                             if (suggestions.length === 0 && !isLoadingSuggestions) fetchInitialSuggestions(); // Fetch if suggestions empty
                        } else {
                            setIsSuggestionsOpen(false);
                        }
                    }}
                    onFocus={() => {
                         setIsSuggestionsOpen(true);
                         if (suggestions.length === 0 && !isLoadingSuggestions) fetchInitialSuggestions();
                    }}
                  />
                </form>
              </PopoverTrigger>
              {isSuggestionsOpen && (
                <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()} // Prevent auto-focus stealing
                    onInteractOutside={(e) => {
                        // Prevent closing if clicking on the search input itself
                        if (searchInputRef.current && searchInputRef.current.contains(e.target as Node)) {
                            return;
                        }
                        // setIsSuggestionsOpen(false); // Standard close on outside click
                    }}
                >
                  <Command shouldFilter={false}> {/* We handle filtering with filteredSuggestions */}
                    <CommandList>
                      {isLoadingSuggestions && (
                        <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                        </div>
                      )}
                      {!isLoadingSuggestions && searchTerm.trim() !== '' && filteredSuggestions.length === 0 && (
                        <CommandEmpty>No matching gigs found.</CommandEmpty>
                      )}
                      {!isLoadingSuggestions && filteredSuggestions.length > 0 && (
                        <CommandGroup heading="Suggested Gigs">
                          {filteredSuggestions.map((gig) => (
                            <CommandItem
                              key={gig.id}
                              value={gig.title} // For CMDK filtering, though we filter manually
                              onSelect={() => {
                                router.push(`/gigs/${gig.id}`);
                                setIsSuggestionsOpen(false);
                                // setSearchTerm(''); // Keep search term for context
                              }}
                              className="cursor-pointer"
                            >
                              <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
                              <span>{gig.title}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                       <CommandGroup>
                        <CommandItem
                            value={`search_all_for_${searchTerm}`}
                            onSelect={() => {
                                handleSearchSubmit(); // This will use the current searchTerm
                                setIsSuggestionsOpen(false);
                            }}
                            className="cursor-pointer italic"
                            disabled={!searchTerm.trim()}
                        >
                            <SearchIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                            <span>Search all for: "{searchTerm}"</span>
                        </CommandItem>
                       </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              )}
            </Popover>
          )}
          <ModeToggle />
          {isClient ? (
            loading ? (
              <Avatar className="h-8 w-8">
                <AvatarFallback>..</AvatarFallback>
              </Avatar>
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={userProfile?.profilePictureUrl} alt={userProfile?.username || user.email || 'User'} />
                      <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {userProfile?.username || user.email?.split('@')[0]}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground capitalize pt-1">
                        Role: {role || 'N/A'}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {role === 'student' && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/student/dashboard">
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          <span>Dashboard</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/student/profile">
                          <GraduationCap className="mr-2 h-4 w-4" />
                          <span>My Profile</span>
                        </Link>
                      </DropdownMenuItem>
                       <DropdownMenuItem asChild>
                        <Link href="/student/applications">
                          <ApplicationsIcon className="mr-2 h-4 w-4" />
                          <span>My Applications</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/student/bookmarks">
                          <Bookmark className="mr-2 h-4 w-4" />
                          <span>My Bookmarks</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {role === 'client' && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/client/dashboard">
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          <span>Dashboard</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/client/gigs">
                          <Briefcase className="mr-2 h-4 w-4" />
                          <span>My Gigs</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <div className="md:hidden"> {/* Links visible only on mobile dropdown */}
                    <DropdownMenuSeparator className="md:hidden" />
                    <DropdownMenuItem asChild className="md:hidden">
                       <Link href="/gigs/browse">
                         {isClient && role === 'student' ? <Compass className="mr-2 h-4 w-4" /> : <SearchIcon className="mr-2 h-4 w-4" />}
                         {isClient && role === 'student' ? 'Explore' : 'Gigs'}
                       </Link>
                    </DropdownMenuItem>
                    {isClient && role === 'client' && (
                        <DropdownMenuItem asChild className="md:hidden">
                            <Link href="/hustlers/browse">
                                <HustlersIcon className="mr-2 h-4 w-4" /> Hustlers
                            </Link>
                        </DropdownMenuItem>
                    )}
                    {isClient && user && (
                        <DropdownMenuItem asChild className="md:hidden">
                            <Link href="/chat" className="relative">
                                <MessageSquare className="mr-2 h-4 w-4" />
                                <span>Messages</span>
                                {totalUnreadChats > 0 && (
                                    <span className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 text-white text-[10px]">
                                        {totalUnreadChats > 9 ? '9+' : totalUnreadChats}
                                    </span>
                                )}
                            </Link>
                        </DropdownMenuItem>
                    )}
                  </div>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="mailto:promoflixindia@gmail.com">
                      <HelpCircle className="mr-2 h-4 w-4" />
                      <span>Support</span>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : ( // Not loading, no user
              <>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link href="/auth/login">Log In</Link>
                </Button>
                <Button asChild className="hidden sm:inline-flex">
                  <Link href="/auth/signup">Sign Up</Link>
                </Button>
                 <Button variant="ghost" asChild className="sm:hidden">
                  <Link href="/auth/login">Log In</Link>
                </Button>
              </>
            )
          ) : ( // isClient is false (SSR or initial client render)
            <div style={{ width: '7rem' }} /> // Placeholder for SSR to avoid layout shifts
          )}
        </div>
      </div>
    </header>
  );
}
