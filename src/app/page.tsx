import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Briefcase, GraduationCap } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center px-4">
      <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
        Welcome to HustleUp
      </h1>
      <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl">
        The platform where ambitious students connect with clients needing freelance talent. Post gigs, find talent, get paid.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 mb-12">
        {/* Link for clients remains signup */}
        <Button asChild size="lg">
          <Link href="/auth/signup?role=client">
            <Briefcase className="mr-2 h-5 w-5" /> Post a Gig
          </Link>
        </Button>
        {/* Link for students/finding work now goes to browse page */}
        <Button asChild variant="secondary" size="lg">
          <Link href="/gigs/browse">
            <GraduationCap className="mr-2 h-5 w-5" /> Find Work
          </Link>
        </Button>
      </div>
       <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
        <span>Already have an account?</span>
        <Button variant="link" asChild className="p-0 h-auto">
          <Link href="/auth/login">
            Log In <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Placeholder for future sections like How it Works, Testimonials, etc. */}
      {/*
      <section className="mt-16 w-full max-w-4xl">
        <h2 className="text-2xl font-semibold mb-6">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">1. Sign Up</h3>
            <p className="text-sm text-muted-foreground">Choose your role: Student looking for gigs or Client posting opportunities.</p>
          </div>
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">2. Connect</h3>
            <p className="text-sm text-muted-foreground">Clients post gigs, students apply. Use our chat to discuss details.</p>
          </div>
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">3. Collaborate & Pay</h3>
            <p className="text-sm text-muted-foreground">Complete the work and get paid securely through Razorpay.</p>
          </div>
        </div>
      </section>
       */}
    </div>
  );
}
