
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Image as ImageIcon, ArrowLeft, X } from 'lucide-react';
import NextImage from 'next/image';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const postSchema = z.object({
  caption: z.string().max(1000, { message: 'Caption cannot exceed 1000 characters' }).optional(),
  image: z.instanceof(File, { message: 'An image is required.' })
    .refine(file => file.size <= 5 * 1024 * 1024, `Max image size is 5MB.`)
    .refine(
      file => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type),
      "Only .jpg, .jpeg, .png, .webp and .gif formats are supported."
    ),
});

type PostFormValues = z.infer<typeof postSchema>;

export default function NewPostPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      form.setValue('image', file, { shouldValidate: true });
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      form.setValue('image', undefined);
      setImagePreview(null);
    }
  };

  const clearImagePreview = () => {
    setImagePreview(null);
    form.setValue('image', undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset file input
    }
  };

  const onSubmit = async (data: PostFormValues) => {
    if (!user || !userProfile || role !== 'student' || !data.image) {
      toast({ title: "Cannot Post", description: "User not authorized, profile missing, or image not selected.", variant: "destructive" });
      return;
    }
    if (!storage) {
        toast({ title: "Storage Error", description: "Firebase Storage is not configured.", variant: "destructive" });
        return;
    }

    setIsSubmittingPost(true);
    setUploadProgress(0);

    try {
      const imageFile = data.image;
      const storagePath = `student_posts/${user.uid}/${Date.now()}_${imageFile.name}`;
      const imageRef = storageRefFn(storage, storagePath);
      const uploadTask = uploadBytesResumable(imageRef, imageFile);

      let imageUrl = "";

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => {
            console.error('Upload error:', error);
            reject(error);
          },
          async () => {
            imageUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve();
          }
        );
      });
      
      if (!imageUrl) {
        throw new Error("Image URL not obtained after upload.");
      }

      const postsCollectionRef = collection(db, 'student_posts');
      await addDoc(postsCollectionRef, {
        studentId: user.uid,
        studentUsername: userProfile.username || user.email?.split('@')[0] || 'Student',
        studentProfilePictureUrl: userProfile.profilePictureUrl || '',
        imageUrl: imageUrl,
        caption: data.caption || '',
        createdAt: serverTimestamp(),
        likes: [],
        commentCount: 0,
      });

      toast({
        title: 'Post Created Successfully!',
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
      setUploadProgress(null);
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
          <CardDescription>Share an image and a caption with your followers.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image (Max 5MB)</FormLabel>
                    <FormControl>
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full flex items-center justify-center gap-2 h-auto py-6 border-dashed",
                            imagePreview && "hidden" 
                          )}
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isSubmittingPost || !!uploadProgress}
                        >
                          <UploadCloud className="h-6 w-6 text-muted-foreground" />
                          <span className="text-muted-foreground">Click to upload image</span>
                        </Button>
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleImageChange}
                          disabled={isSubmittingPost || !!uploadProgress}
                        />
                        {imagePreview && (
                          <div className="mt-2 relative aspect-video w-full max-w-md mx-auto rounded-md overflow-hidden border">
                            <NextImage src={imagePreview} alt="Selected image preview" layout="fill" objectFit="contain" />
                            <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute top-2 right-2 h-7 w-7 opacity-80 hover:opacity-100"
                                onClick={clearImagePreview}
                                disabled={isSubmittingPost || !!uploadProgress}
                                title="Remove image"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {uploadProgress !== null && (
                <div className="space-y-1">
                    <Progress value={uploadProgress} className="w-full h-2" />
                    <p className="text-xs text-muted-foreground text-center">{Math.round(uploadProgress)}% uploaded</p>
                </div>
              )}

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
                disabled={isSubmittingPost || !!uploadProgress || !form.formState.isValid}
              >
                {isSubmittingPost && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmittingPost ? (uploadProgress !== null && uploadProgress < 100 ? 'Uploading...' : 'Creating Post...') : 'Create Post'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}


    