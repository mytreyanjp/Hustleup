
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Renamed 'ref' to 'storageRefFn'
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

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
      form.setValue('image', undefined as any, { shouldValidate: true });
      setImagePreview(null);
    }
  };

  const onSubmit = async (data: PostFormValues) => {
    if (!user || !userProfile || role !== 'student') {
      toast({ title: "Cannot Post", description: "User not authorized or profile missing.", variant: "destructive" });
      return;
    }
    if (!storage) {
      toast({ title: "Storage Error", description: "Firebase Storage is not configured or available. Cannot upload file. Please check Firebase setup in your project and ensure Storage is enabled. If on Spark plan, ensure it allows Storage configuration or upgrade.", variant: "destructive", duration: 10000 });
      console.error("Firebase Storage object is null or undefined. Check Firebase configuration and initialization.");
      setIsSubmittingPost(false);
      return;
    }

    setIsSubmittingPost(true);
    setUploadProgress(0);
    console.log("Attempting to upload image for student post...");

    try {
      const file = data.image;
      const filePath = `student_post_images/${user.uid}/${Date.now()}_${file.name}`;
      const fileStorageRefInstance = storageRefFn(storage, filePath);
      
      console.log(`Uploading to Firebase Storage path: ${filePath}`);
      console.log("File details:", { name: file.name, size: file.size, type: file.type });

      const uploadTask = uploadBytesResumable(fileStorageRefInstance, file);
      console.log("Upload task created.");

      const imageUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
            console.log(`Upload is ${progress}% done. State: ${snapshot.state}. Bytes transferred: ${snapshot.bytesTransferred} of ${snapshot.totalBytes}`);
          },
          (error: any) => { 
            console.error("Firebase Storage Upload Error (student post):", error);
            console.error("Error Code:", error.code);
            console.error("Error Message:", error.message);
            if (error.serverResponse) {
              console.error("Server Response:", error.serverResponse);
            }
            console.error("Full Error Object:", JSON.stringify(error, null, 2));

            let detailedErrorMessage = `Could not upload image. Code: ${error.code || 'UNKNOWN'}. Message: ${error.message || 'No message'}.`;
            let toastTitle = "Image Upload Failed";
            let duration = 15000;

             switch (error.code) {
                case 'storage/unauthorized': 
                  detailedErrorMessage = "Upload failed: Permission denied. CRITICAL: Check Firebase Storage rules in your Firebase project console. Ensure they allow authenticated users to write to 'student_post_images/{studentId}/...'. If on Spark plan and cannot access Rules tab, you may need to upgrade to Blaze plan for full Storage functionality."; 
                  break;
                case 'storage/canceled': 
                  detailedErrorMessage = "Upload canceled by the user."; 
                  break;
                case 'storage/object-not-found': 
                  detailedErrorMessage = "Upload failed: The file path may be incorrect or the object does not exist. This can sometimes indicate a configuration issue with the storage bucket itself or incorrect rules."; 
                  break;
                case 'storage/bucket-not-found': 
                  detailedErrorMessage = "Upload failed: The Firebase Storage bucket configured in your project does not exist or is not accessible. Verify your `storageBucket` setting in firebase config and that Storage is enabled in Firebase Console."; 
                  break;
                case 'storage/project-not-found': 
                  detailedErrorMessage = "Upload failed: The Firebase project configured does not exist. Verify your Firebase project settings."; 
                  break;
                case 'storage/quota-exceeded': 
                  detailedErrorMessage = "Upload failed: Your Firebase Storage quota has been exceeded. Please upgrade your plan or free up space."; 
                  break;
                case 'storage/retry-limit-exceeded':
                  detailedErrorMessage = "Upload failed after multiple retries. Check network connection and Firebase Storage status.";
                  break;
                case 'storage/invalid-argument':
                  detailedErrorMessage = "Upload failed: Invalid argument provided to storage operation. This might be an issue with the file path or metadata.";
                  break;
                default:
                   if (error.message && error.message.toLowerCase().includes('network request failed') || error.code === 'storage/unknown' || !error.code) {
                       toastTitle = "Network Error During Upload";
                       detailedErrorMessage = `Upload failed due to a network issue (e.g., net::ERR_FAILED). Please check your internet connection. Also, verify CORS configuration for your Firebase Storage bucket if this persists. Ensure Firebase Storage is enabled and rules are set in your Firebase project. Raw error: ${error.message || 'Unknown network error'}`;
                       duration = 20000; // Longer for network/CORS type issues
                   } else {
                       detailedErrorMessage = `An unknown error occurred during upload (Code: ${error.code || 'N/A'}). Please check your network connection, Firebase Storage rules in Firebase Console, and ensure your Firebase project plan supports Storage operations. Server response (if any): ${error.serverResponse || 'N/A'}`; 
                   }
                  break;
            }
            toast({ 
              id: `image-upload-failed-student-post-${error.code || 'unknown'}`, 
              title: toastTitle, 
              description: detailedErrorMessage, 
              variant: "destructive",
              duration: duration
            });
            reject(error);
          },
          async () => {
            console.log("Upload task completed successfully. Getting download URL...");
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              console.log("Download URL obtained:", downloadURL);
              resolve(downloadURL);
            } catch (urlError: any) {
              console.error("Error getting download URL for student post:", urlError);
              toast({ title: "Upload Successful, but URL Failed", description: `Image uploaded, but failed to get download URL: ${urlError.message}`, variant: "destructive", duration: 10000 });
              reject(urlError);
            }
          }
        );
      });

      console.log("Image URL for Firestore:", imageUrl);
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
        title: 'Post Created!',
        description: 'Your post is now live on your profile.',
      });
      router.push(`/profile/${user.uid}`);

    } catch (error: any) {
      console.error('Error creating post (outer try-catch):', error);
      if (!toast.isActive(`image-upload-failed-student-post-${error.code || 'unknown'}`)) {
         toast({
           id: `post-creation-failed-student-post-${Date.now()}`,
           title: 'Failed to Create Post',
           description: (error.message && error.message.toLowerCase().includes("upload failed")) ? "See previous error for upload details." : (error.message || 'An unexpected error occurred while saving the post.'),
           variant: 'destructive',
           duration: 10000
         });
      }
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
                    <FormLabel>Image</FormLabel>
                    <FormControl>
                      <div>
                        <Input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          ref={fileInputRef}
                          onChange={handleImageChange}
                          className="hidden"
                          disabled={isSubmittingPost}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full flex items-center justify-center gap-2"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isSubmittingPost}
                        >
                          <UploadCloud className="h-5 w-5" />
                          {imagePreview ? 'Change Image' : 'Select Image'}
                        </Button>
                      </div>
                    </FormControl>
                    {imagePreview && (
                      <div className="mt-2 border rounded-md p-2 flex justify-center">
                        <img src={imagePreview} alt="Preview" className="max-h-60 object-contain rounded-md" data-ai-hint="user content image" />
                      </div>
                    )}
                    {uploadProgress !== null && (
                      <div className="mt-2 space-y-1">
                          <Progress value={uploadProgress} className="w-full h-2" />
                          <p className="text-xs text-muted-foreground text-center">Uploading: {uploadProgress.toFixed(0)}%</p>
                      </div>
                    )}
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
                disabled={isSubmittingPost || !form.formState.isValid || (uploadProgress !== null && uploadProgress < 100)}
              >
                {(isSubmittingPost || (uploadProgress !== null && uploadProgress < 100)) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Post
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
