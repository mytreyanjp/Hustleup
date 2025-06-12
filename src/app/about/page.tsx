
"use client";

import { Button } from '@/components/ui/button';
import { HardHat, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AboutPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-15rem)] text-center px-4 py-8">
      <HardHat className="h-24 w-24 text-primary mb-6" />
      <h1 className="text-4xl md:text-5xl font-bold mb-4">
        Page Under Construction
      </h1>
      <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-md">
        The "PromoFlix" (About) page is currently being built. Please check back later!
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-5 w-5" /> Go Back
        </Button>
        <Button asChild>
          <Link href="/">
            Go to Homepage
          </Link>
        </Button>
      </div>
    </div>
  );
}
