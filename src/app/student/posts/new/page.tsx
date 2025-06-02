
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
// import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Media upload disabled
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Image as ImageIcon, ArrowLeft } from 'lucide-react';
// import { Progress } from '@/components/ui/progress'; // Media upload disabled

const postSchema = z.object({
  caption: z.string().max(1000, { message: 'Caption cannot exceed 1000 characters' }).optional(),
  // Image field is still in schema, but UI for it will be disabled.
  // This means the form might not be submittable as is.
  image: z.instanceof(File, { message: 'An image is required.' })
    .refine(file => file.size <= 5 * 1024 * 1024, `Max image size is 5MB.`)
    .refine(
      file => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type),
      "Only .jpg, .jpeg, .png, .webp and .gif formats are supported."
    ).optional(), // Making it optional since UI is disabled for now
});

type PostFormValues = z.infer<typeof postSchema>;

export default function NewPostPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  // const [imagePreview, setImagePreview] = useState<string | null>(null); // Media upload disabled
  // const [uploadProgress, setUploadProgress] = useState<number | null>(null); // Media upload disabled
  // const fileInputRef = useRef<HTMLInputElement>(null); // Media upload disabled

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      caption: '',
      image: undefined,
    },
  });

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        toast({ title: "Access Denied", description: "You must be logged in as a student to create a post.", variant: "destructive" });
        router.push('/auth/login?redirect=/student/dashboard');
      }
    }
  }, [authLoading, user, role, router, toast]);

  // handleImageChange removed as media upload is disabled

  const onSubmit = async (data: PostFormValues) => {
    if (!user || !userProfile || role !== 'student') {
      toast({ title: "Cannot Post", description: "User not authorized or profile missing.", variant: "destructive" });
      return;
    }
    // Image upload is disabled, so we can't proceed if an image is required by schema.
    // For now, we'll just show a toast if an image is expected but not provided via UI.
    if (!data.image && postSchema.shape.image.isOptional() === false) {
        toast({ title: "Image Required", description: "An image is required to create a post. Media uploads are currently disabled.", variant: "destructive" });
        return;
    }
    if (!storage && data.image) { // If image was somehow set (e.g. schema changed)
        toast({ title: "Storage Error", description: "Firebase Storage is not configured.", variant: "destructive" });
        return;
    }

    setIsSubmittingPost(true);
    // setUploadProgress(0); // Media upload disabled

    try {
      // Image upload logic removed as media upload is disabled
      // If we were to allow posts without images, the logic would simplify significantly here.
      // For now, this function will likely not be fully executed due to image requirement.

      // const imageUrl = "DISABLED"; // Placeholder if we were to proceed without image

      const postsCollectionRef = collection(db, 'student_posts');
      await addDoc(postsCollectionRef, {
        studentId: user.uid,
        studentUsername: userProfile.username || user.email?.split('@')[0] || 'Student',
        studentProfilePictureUrl: userProfile.profilePictureUrl || '',
        // imageUrl: imageUrl, // Would be undefined or a placeholder
        caption: data.caption || '',
        createdAt: serverTimestamp(),
        likes: [],
        commentCount: 0,
      });

      toast({
        title: 'Post Created (Text Only)!', // Modified message
        description: 'Your post is now live on your profile.',
      });
      router.push(`/profile/${user.uid}`);

    } catch (error: any) {
      console.error('Error creating post:', error);
      toast({
           id: `post-creation-failed-student-post-${Date.now()}`,
           title: 'Failed to Create Post',
           description: (error.message || 'An unexpected error occurred while saving the post.'),
           variant: 'destructive',
           duration: 10000
         });
    } finally {
      setIsSubmittingPost(false);
      // setUploadProgress(null); // Media upload disabled
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-2xl">Create a New Post</CardTitle>
          <CardDescription>Share an image and a caption with your followers. (Image uploads currently disabled)</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image (Uploads Disabled)</FormLabel>
                    <FormControl>
                      <div>
                        {/* File input button and preview removed as media upload is disabled */}
                         <p className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/50 text-center">
                           <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                           Image uploads are temporarily disabled.
                         </p>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="caption"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Caption (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Write something about your post..."
                        {...field}
                        rows={4}
                        disabled={isSubmittingPost}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmittingPost /* || !form.formState.isValid - Image field might make it invalid */}
              >
                {isSubmittingPost && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Post (Text Only)
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
