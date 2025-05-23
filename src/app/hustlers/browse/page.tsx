
"use client";

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirebase } from '@/context/firebase-context';
import { Users, Briefcase, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function BrowseHustlersPage() {
  const { user, loading, role } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    // Redirect if not loading and not a client
    if (!loading && role && role !== 'client') {
      // router.push('/'); // Or to a more appropriate page like student dashboard
      // For now, let's allow anyone to see the placeholder,
      // but in a real scenario, this page would be client-focused.
    }
  }, [user, loading, role, router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <Card className="glass-card text-center py-10">
        <CardHeader>
          <Users className="mx-auto h-16 w-16 text-primary mb-4" />
          <CardTitle className="text-3xl">Browse Hustlers</CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Find talented students for your projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xl font-semibold text-accent">
            Feature Coming Soon!
          </p>
          <p className="text-muted-foreground">
            Soon you'll be able to browse student profiles, filter by skills, and invite them to your gigs.
          </p>
          {role === 'client' && (
            <Button asChild>
              <Link href="/client/dashboard">
                <Briefcase className="mr-2 h-4 w-4" /> Go to Client Dashboard
              </Link>
            </Button>
          )}
          {role !== 'client' && !loading && (
             <Button asChild variant="outline">
              <Link href="/gigs/browse">
                Browse Gigs Instead
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
