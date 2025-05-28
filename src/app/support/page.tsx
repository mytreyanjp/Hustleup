
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function SupportPage() {
  const supportEmail = "promoflixindia@gmail.com";

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <div className="text-center">
        <HelpCircle className="mx-auto h-16 w-16 text-primary mb-4" />
        <h1 className="text-3xl font-bold tracking-tight">Support Center</h1>
        <p className="text-muted-foreground mt-2">
          Need help? We're here for you.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Contact Us</CardTitle>
          <CardDescription>
            For any questions, issues, or feedback, please reach out to our support team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-4 border rounded-lg">
            <Mail className="h-6 w-6 text-primary" />
            <div>
              <p className="font-semibold">Email Support</p>
              <a href={`mailto:${supportEmail}`} className="text-sm text-primary hover:underline">
                {supportEmail}
              </a>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            We aim to respond to all queries within 24-48 business hours. Please provide as much detail as possible so we can assist you effectively.
          </p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Frequently Asked Questions (FAQs)</CardTitle>
          <CardDescription>
            Find answers to common questions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Our FAQ section is currently under development and will be available soon.
            In the meantime, please contact us via email for any assistance.
          </p>
          {/* Placeholder for future FAQs */}
        </CardContent>
      </Card>

      <div className="text-center">
        <Button variant="outline" asChild>
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
