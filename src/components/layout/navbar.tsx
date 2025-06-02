
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/mode-toggle';
import { useFirebase } from '@/context/firebase-context';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { LogOut, Settings, LayoutDashboard, Briefcase, GraduationCap, MessageSquare, Search as SearchIcon, Users as HustlersIcon, Compass, Loader2, HelpCircle, Bookmark, FileText as ApplicationsIcon, Menu as MenuIcon, User as UserIcon, Edit3, Sun, Moon, Laptop, Star as StarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import type { Skill } from '@/lib/constants';
import { useTheme } from 'next-themes';

interface SuggestedGig {
  id: string;
  title: string;
  requiredSkills: Skill[];
  type: 'gig';
}

export default function Navbar() {
  const { user, userProfile, loading, role, totalUnreadChats } = useFirebase();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [isClient, setIsClient] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedGig[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);


  const fetchInitialSuggestions = useCallback(async () => {
    if (!db || (suggestions.length > 0 && searchTerm.trim() === '')) return;
    setIsLoadingSuggestions(true);
    try {
      const gigsCollectionRef = collection(db, 'gigs');
      const q = query(
        gigsCollectionRef,
        where('status', '==', 'open'),
        orderBy('createdAt', 'desc'),
        limit(5) 
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
  }, [suggestions.length, searchTerm]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isSuggestionsOpen && suggestions.length === 0 && !isLoadingSuggestions && searchTerm.trim() === '') {
      fetchInitialSuggestions();
    }
  }, [isSuggestionsOpen, suggestions.length, isLoadingSuggestions, fetchInitialSuggestions, searchTerm]);


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
    }
  };

  const filteredSuggestions = searchTerm.trim() === '' && suggestions.length > 0
    ? suggestions
    : suggestions.filter(suggestion =>
        suggestion.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (suggestion.requiredSkills && suggestion.requiredSkills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())))
      ).slice(0,5); 

  const dashboardUrl = role === 'student' ? '/student/profile' : role === 'client' ? '/client/dashboard' : '/';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center pl-4"> 
        <div className="mr-4 flex items-center space-x-2 cursor-default">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span className="font-bold inline-block">HustleUp</span>
        </div>

        <nav className="flex-1 items-center space-x-2 sm:space-x-4 hidden md:flex">
          <Link href="/gigs/browse" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center">
            <Compass className={cn("mr-1 h-4 w-4", isClient ? "sm:inline-block" : "hidden")} />
             {isClient && role === 'student' ? 'Explore' : 'Gigs'}
          </Link>

          {isClient && role === 'client' && (
            <Link href="/hustlers/browse" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center">
              <HustlersIcon className={cn("mr-1 h-4 w-4", isClient ? "sm:inline-block" : "hidden")} /> Hustlers
            </Link>
          )}

          {isClient && role === 'student' && (
            <Link href="/student/works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center">
                <Briefcase className="mr-1 h-4 w-4 sm:inline-block" /> Your Works
            </Link>
          )}
          {isClient && user && (
            <Link href="/chat" className="relative text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center">
              <MessageSquare className={cn("mr-1 h-4 w-4", isClient ? "sm:inline-block" : "hidden")} />
              <span className="hidden lg:inline-block">Messages</span>
              {totalUnreadChats > 0 && (
                <span className="absolute -top-1 -right-1 flex h-[18px] w-[18px] -translate-y-1/3 translate-x-1/3 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none p-0">
                  {totalUnreadChats > 9 ? '9+' : totalUnreadChats}
                </span>
              )}
            </Link>
          )}
        </nav>

        <div className="flex flex-1 md:flex-none items-center justify-end space-x-2">
          {isClient && (
            <Popover open={isSuggestionsOpen} onOpenChange={(open) => {
              setIsSuggestionsOpen(open);
              if (open && suggestions.length === 0 && !isLoadingSuggestions && searchTerm.trim() === '') {
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
                        const newSearchTerm = e.target.value;
                        setSearchTerm(newSearchTerm);
                        if (newSearchTerm.trim() !== '') {
                            setIsSuggestionsOpen(true);
                             if (suggestions.length === 0 && !isLoadingSuggestions) fetchInitialSuggestions();
                        } else {
                            setIsSuggestionsOpen(false); 
                        }
                    }}
                    onFocus={() => {
                         setIsSuggestionsOpen(true);
                         if (suggestions.length === 0 && !isLoadingSuggestions && searchTerm.trim() === '') {
                             fetchInitialSuggestions();
                         }
                    }}
                  />
                </form>
              </PopoverTrigger>
              {isSuggestionsOpen && (
                <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onInteractOutside={(e) => {
                        if (searchInputRef.current && searchInputRef.current.contains(e.target as Node)) {
                            return; 
                        }
                        setIsSuggestionsOpen(false);
                    }}
                >
                  <Command shouldFilter={false}>
                    <CommandList>
                      {isLoadingSuggestions && searchTerm.trim() === '' && (
                        <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading suggestions...
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
                              value={gig.title}
                              onSelect={() => {
                                router.push(`/gigs/${gig.id}`);
                                setIsSuggestionsOpen(false);
                                setSearchTerm('');
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
                                handleSearchSubmit();
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
          <div className="hidden md:flex items-center">
            <ModeToggle />
          </div>
          {isClient ? (
            loading ? (
              <div className="flex items-center space-x-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>..</AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                  <MenuIcon />
                </Button>
              </div>
            ) : user ? (
              <div className="flex items-center space-x-1">
                <Link href={dashboardUrl} passHref>
                  <Avatar className="h-8 w-8 cursor-pointer">
                    <AvatarImage src={userProfile?.profilePictureUrl} alt={userProfile?.username || user.email || 'User'} />
                    <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
                  </Avatar>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="User menu">
                      <MenuIcon />
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
                          <Link href="/student/profile">
                            <UserIcon className="mr-2 h-4 w-4" />
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
                         <DropdownMenuItem asChild>
                          <Link href="/student/works">
                            <Briefcase className="mr-2 h-4 w-4" />
                            <span>Your Works</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/student/reviews">
                            <StarIcon className="mr-2 h-4 w-4" />
                            <span>My Reviews</span>
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
                          <Link href="/client/profile/edit">
                            <Edit3 className="mr-2 h-4 w-4" />
                            <span>Edit Profile</span>
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
                    <DropdownMenuSeparator className="md:hidden" />
                    <div className="md:hidden">
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Sun className="mr-2 h-4 w-4" />
                                <span>Theme</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={() => setTheme("light")} className="py-1">
                                    <Sun className="mr-2 h-4 w-4" />
                                    Light
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTheme("dark")} className="py-1">
                                    <Moon className="mr-2 h-4 w-4" />
                                    Dark
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTheme("system")} className="py-1">
                                    <Laptop className="mr-2 h-4 w-4" />
                                    System
                                </DropdownMenuItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/settings">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/support">
                        <HelpCircle className="mr-2 h-4 w-4" />
                        <span>Support</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
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
          ) : (
            <div style={{ width: '7rem' }} /> // Placeholder for non-client side render to avoid layout shift
          )}
        </div>
      </div>
    </header>
  );
}


    