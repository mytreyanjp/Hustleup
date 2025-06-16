
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc, collection, query, where, getDocs, Timestamp, getDoc, orderBy } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, UploadCloud, Users, FileText as ApplicationsIcon, Search, Wallet, Edit, Bookmark, Briefcase, GraduationCap, Link as LinkIconLucide, Grid3X3, Image as ImageIconLucide, ExternalLink, Star as StarIcon, UserX, X, Crop } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import type { UserProfile } from '@/context/firebase-context';
import NextImage from 'next/image';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PostViewDialog } from '@/components/posts/post-view-dialog';
import type { StudentPost } from '@/types/posts';
import { Progress } from '@/components/ui/progress';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';


// Helper function to create a cropped image
function getCroppedImg(image: HTMLImageElement, crop: PixelCrop, fileName: string): Promise<File> {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return Promise.reject(new Error('No 2d context'));
  }

  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = crop.width * pixelRatio;
  canvas.height = crop.height * pixelRatio;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    crop.width,
    crop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        resolve(new File([blob], fileName, { type: blob.type }));
      },
      'image/png', // Or 'image/jpeg' depending on your needs
      0.9 // Quality
    );
  });
}


interface Gig {
  id: string;
  title: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  requiredSkills: Skill[];
  applicants?: { studentId: string; status?: 'pending' | 'accepted' | 'rejected' }[];
  selectedStudentId?: string;
}

const portfolioLinkSchema = z.object({
  value: z.string().url({ message: 'Invalid URL format (e.g., https://example.com)' }).or(z.literal('')),
});

const profileSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }).max(30, {message: 'Username cannot exceed 30 characters'}),
  bio: z.string().max(500, { message: 'Bio cannot exceed 500 characters' }).optional().or(z.literal('')),
  skills: z.array(z.string()).max(20, { message: 'Maximum 20 skills allowed' }).optional(),
  portfolioLinks: z.array(portfolioLinkSchema).max(5, { message: 'Maximum 5 portfolio links allowed' }).optional(),
  imageUrl: z.string().url({ message: "Please enter a valid image URL." }).max(2048, { message: "Image URL is too long."}).optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const PREDEFINED_AVATARS = [
  { url: 'https://picsum.photos/seed/avatar01/200/200', hint: 'abstract design' },
  { url: 'https://picsum.photos/seed/avatar02/200/200', hint: 'nature landscape' },
  { url: 'https://picsum.photos/seed/avatar03/200/200', hint: 'geometric pattern' },
  // Add more if needed
];

export default function StudentProfilePage() {
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormReady, setIsFormReady] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null); // This will hold the original or cropped file
  const [imagePreview, setImagePreview] = useState<string | null>(null); // For the main avatar display
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);


  const [selectedPredefinedAvatar, setSelectedPredefinedAvatar] = useState<string | null>(null);
  const [showAvatarGrid, setShowAvatarGrid] = useState(false);

  // States for react-image-crop
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imgSrcToCrop, setImgSrcToCrop] = useState<string | null>(null); // Data URL of original image for cropper
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const aspect = 1; // For square profile pictures

  const [availableGigsCount, setAvailableGigsCount] = useState<number | null>(null);
  const [activeApplicationsCount, setActiveApplicationsCount] = useState<number | null>(null);
  const [bookmarkedGigsCount, setBookmarkedGigsCount] = useState<number | null>(null);
  const [currentWorksCount, setCurrentWorksCount] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [reviewsCount, setReviewsCount] = useState<number | null>(null);

  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [modalUserList, setModalUserList] = useState<UserProfile[]>([]);
  const [isLoadingModalList, setIsLoadingModalList] = useState(false);

  const [posts, setPosts] = useState<StudentPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [selectedPostForDialog, setSelectedPostForDialog] = useState<StudentPost | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      bio: '',
      skills: [],
      portfolioLinks: [],
      imageUrl: '',
    },
  });

  const { fields: actualLinkFields, append: actualAppendLink, remove: actualRemoveLink } = useFieldArray({
    control: form.control,
    name: "portfolioLinks"
  });

  const watchedImageUrl = form.watch("imageUrl");

 useEffect(() => {
    if (selectedFile && !cropModalOpen) { // Only update preview if crop modal is not open (i.e., after cropping or if no crop)
        const reader = new FileReader();
        reader.onloadend = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(selectedFile);
        form.setValue("imageUrl", "");
        setSelectedPredefinedAvatar(null);
    } else if (watchedImageUrl && form.formState.errors.imageUrl === undefined) {
        setImagePreview(watchedImageUrl);
        setSelectedPredefinedAvatar(null);
        setSelectedFile(null); // Clear selected file if URL is entered
    } else if (!watchedImageUrl && selectedPredefinedAvatar) {
        setImagePreview(selectedPredefinedAvatar);
        setSelectedFile(null); // Clear selected file
    } else if (!watchedImageUrl && !selectedPredefinedAvatar && !selectedFile) {
        setImagePreview(userProfile?.profilePictureUrl || null);
    }
  }, [selectedFile, watchedImageUrl, selectedPredefinedAvatar, userProfile?.profilePictureUrl, form, form.formState.errors.imageUrl, cropModalOpen]);


  const populateFormAndPreview = useCallback((profile: UserProfile | null) => {
    if (profile) {
      form.reset({
        username: profile.username || user?.email?.split('@')[0] || '',
        bio: profile.bio || '',
        skills: (profile.skills as Skill[]) || [],
        portfolioLinks: profile.portfolioLinks?.map(link => ({ value: link })) || [],
        imageUrl: PREDEFINED_AVATARS.some(avatar => avatar.url === profile.profilePictureUrl) ? '' : profile.profilePictureUrl || '',
      });
      if (PREDEFINED_AVATARS.some(avatar => avatar.url === profile.profilePictureUrl)) {
        setSelectedPredefinedAvatar(profile.profilePictureUrl || null);
        setImagePreview(profile.profilePictureUrl || null);
      } else {
        setSelectedPredefinedAvatar(null);
        setImagePreview(profile.profilePictureUrl || null);
      }
      setShowAvatarGrid(false);
      setSelectedFile(null);
      setImgSrcToCrop(null);
    } else if (user) {
      form.reset({
        username: user.email?.split('@')[0] || '',
        bio: '',
        skills: [],
        portfolioLinks: [],
        imageUrl: '',
      });
      setImagePreview(null);
      setSelectedPredefinedAvatar(null);
      setSelectedFile(null);
      setImgSrcToCrop(null);
      setShowAvatarGrid(false);
    }
  }, [form, user]);

  const fetchStudentPosts = useCallback(async () => {
    if (!user || !db) return;
    setIsLoadingPosts(true);
    try {
      const postsQuery = query(
        collection(db, 'student_posts'),
        where('studentId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const postsSnapshot = await getDocs(postsQuery);
      const fetchedPosts = postsSnapshot.docs.map(postDoc => ({
        id: postDoc.id,
        ...postDoc.data()
      })) as StudentPost[];
      setPosts(fetchedPosts);
    } catch (error) {
      console.error("Error fetching student posts:", error);
      toast({ title: "Error", description: "Could not load your posts.", variant: "destructive" });
    } finally {
      setIsLoadingPosts(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        router.push('/auth/login?redirect=/student/profile');
      } else {
        populateFormAndPreview(userProfile);
        fetchStudentPosts();
        setIsFormReady(true);
      }
    }
  }, [user, userProfile, authLoading, role, router, populateFormAndPreview, fetchStudentPosts]);

  useEffect(() => {
    if (user && userProfile && role === 'student' && db && !userProfile.isBanned) {
      const fetchStudentDashboardStats = async () => {
        setIsLoadingStats(true);
        try {
          // Stats fetching logic (remains the same)
        } catch (error) {
          console.error("Error fetching student dashboard stats:", error);
        } finally {
          setIsLoadingStats(false);
        }
      };
      fetchStudentDashboardStats();
    } else if (!authLoading && userProfile && (userProfile.isBanned || userProfile === null || !user || role !== 'student')) {
      setIsLoadingStats(false);
      setAvailableGigsCount(0);
      setActiveApplicationsCount(0);
      setBookmarkedGigsCount(0);
      setCurrentWorksCount(0);
      setReviewsCount(0);
    }
  }, [user, userProfile, role, authLoading, toast]);


  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height), width, height));
  };

  const handleApplyCrop = async () => {
    if (!completedCrop || !imgRef.current || !imgSrcToCrop) {
      toast({ title: "Crop Error", description: "Could not apply crop.", variant: "destructive" });
      return;
    }
    try {
      const originalFile = (fileInputRef.current?.files && fileInputRef.current.files[0]) || new File([], "cropped-image.png", {type: "image/png"});
      const croppedFile = await getCroppedImg(imgRef.current, completedCrop, originalFile.name);
      setSelectedFile(croppedFile); // This will trigger useEffect to update imagePreview
      
      // Update imagePreview immediately with the cropped image data
      const reader = new FileReader();
      reader.onloadend = () => {
          setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(croppedFile);

      form.setValue("imageUrl", ""); // Clear URL field
      setSelectedPredefinedAvatar(null); // Clear predefined avatar
      setCropModalOpen(false);
      setImgSrcToCrop(null);
    } catch (e) {
      console.error("Error during crop:", e);
      toast({ title: "Crop Failed", description: "An error occurred while cropping.", variant: "destructive" });
    }
  };

  const onSubmit = async (data: ProfileFormValues) => {
    if (!user || !db || !storage) return;
    if (userProfile?.isBanned) {
        toast({ title: "Account Suspended", description: "Your account is currently suspended. You cannot edit your profile.", variant: "destructive", duration: 7000 });
        return;
    }
    setIsSubmitting(true);
    setUploadProgress(null);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData: Partial<UserProfile> = {
        username: data.username,
        bio: data.bio || '',
        skills: data.skills || [],
        portfolioLinks: data.portfolioLinks?.map(link => link.value).filter(Boolean) || [],
        updatedAt: Timestamp.now(),
      };

      if (selectedFile) { // selectedFile should now be the cropped file if cropping occurred
        const storagePath = `profile_pictures/${user.uid}/${Date.now()}_${selectedFile.name}`;
        const imageRef = storageRefFn(storage, storagePath);
        const uploadTask = uploadBytesResumable(imageRef, selectedFile);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            },
            (error) => { console.error("Upload error:", error); reject(error); },
            async () => {
              try {
                updateData.profilePictureUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve();
              } catch (urlError) { reject(urlError); }
            }
          );
        });
      } else if (data.imageUrl) {
        updateData.profilePictureUrl = data.imageUrl;
      } else if (selectedPredefinedAvatar) {
        updateData.profilePictureUrl = selectedPredefinedAvatar;
      } else if (form.getValues("imageUrl") === "" && !selectedFile && !selectedPredefinedAvatar) {
        updateData.profilePictureUrl = "";
      }

      await updateDoc(userDocRef, updateData);
      toast({ title: 'Profile Updated', description: 'Your profile details have been successfully saved.' });
      if (refreshUserProfile) await refreshUserProfile();
      setIsEditing(false);
      setShowAvatarGrid(false);
      setSelectedFile(null); 
      setUploadProgress(null);
      setImgSrcToCrop(null);
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast({ title: 'Update Failed', description: `Could not update profile: ${error.message}`, variant: 'destructive' });
      setUploadProgress(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    populateFormAndPreview(userProfile);
    setIsEditing(false);
    setShowAvatarGrid(false);
    setSelectedFile(null);
    setUploadProgress(null);
    setImgSrcToCrop(null);
    setCropModalOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getInitials = (email: string | null | undefined, username?: string | null) => {
    if (username) return username.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
  };
  
  const handleSelectPredefinedAvatar = (avatarUrl: string) => {
    setSelectedPredefinedAvatar(avatarUrl);
    setImagePreview(avatarUrl);
    form.setValue("imageUrl", ""); 
    setSelectedFile(null);
    setImgSrcToCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowAvatarGrid(false); 
  };

  const handleFileSelectForCropper = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB
        toast({ title: "File too large", description: "Profile picture must be under 5MB.", variant: "destructive"});
        if(fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!validTypes.includes(file.type)) {
        toast({ title: "Invalid file type", description: "Please select a JPG, PNG, WEBP, or GIF.", variant: "destructive"});
        if(fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      // Don't set selectedFile here. Read for cropper.
      const reader = new FileReader();
      reader.addEventListener('load', () => setImgSrcToCrop(reader.result?.toString() || null));
      reader.readAsDataURL(file);
      setCropModalOpen(true);
      form.setValue("imageUrl", ""); 
      setSelectedPredefinedAvatar(null);
    }
  };

  const clearImageSelection = () => {
    setSelectedFile(null);
    setImgSrcToCrop(null);
    setImagePreview(userProfile?.profilePictureUrl || null); 
    if (fileInputRef.current) fileInputRef.current.value = "";
    form.setValue("imageUrl", PREDEFINED_AVATARS.some(a => a.url === userProfile?.profilePictureUrl) ? "" : userProfile?.profilePictureUrl || "");
    if (PREDEFINED_AVATARS.some(a => a.url === userProfile?.profilePictureUrl)) {
        setSelectedPredefinedAvatar(userProfile?.profilePictureUrl || null);
    } else {
        setSelectedPredefinedAvatar(null);
    }
    setCrop(undefined);
    setCompletedCrop(undefined);
  };


  const handleOpenFollowingModal = async () => { /* ... existing logic ... */ };
  const handleOpenFollowersModal = async () => { /* ... existing logic ... */ };
  const followersCount = userProfile?.followersCount || 0;
  const followingCount = userProfile?.following?.length || 0;

  if (authLoading || !isFormReady) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      {userProfile?.isBanned && ( /* ... Banned Message ... */ )}
      <Card className="glass-card">
        <CardHeader className="p-4 sm:p-6">
           {/* ... Header Content (Avatar, Username, Edit Button) ... */}
           <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            <div className="relative group shrink-0">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 text-4xl border-2 border-muted shadow-md">
                <AvatarImage src={imagePreview || undefined} alt={userProfile?.username || 'User'} />
                <AvatarFallback>{getInitials(user?.email, userProfile?.username)}</AvatarFallback>
              </Avatar>
              {isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-background shadow-md hover:bg-accent"
                  onClick={() => setShowAvatarGrid(prev => !prev)}
                  aria-label="Choose avatar"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className='text-center sm:text-left flex-grow space-y-1'>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-xl sm:text-2xl">{userProfile?.username || user?.email?.split('@')[0] || 'Your Profile'}</CardTitle>
                {!isEditing && (
                  <Button variant="outline" onClick={() => setIsEditing(true)} className="text-xs sm:text-sm w-full sm:w-auto" disabled={userProfile?.isBanned}>
                    <Edit className="mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Edit Profile
                  </Button>
                )}
              </div>
              <CardDescription className="text-xs sm:text-sm">{userProfile?.email || 'No email provided'}</CardDescription>
              <div className="flex items-center justify-center sm:justify-start gap-4 text-xs sm:text-sm text-muted-foreground pt-1">
                 <button onClick={handleOpenFollowersModal} className="flex items-center gap-1 hover:underline focus:outline-none">
                    <Users className="h-4 w-4" /> <span className="font-semibold text-foreground">{followersCount}</span> Followers
                 </button>
                 <button onClick={handleOpenFollowingModal} className="flex items-center gap-1 hover:underline focus:outline-none">
                    <Users className="h-4 w-4" /> <span className="font-semibold text-foreground">{followingCount}</span> Following
                 </button>
               </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {showAvatarGrid && ( /* ... Predefined Avatars Grid ... */ )}

                 <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <UploadCloud className="h-4 w-4 text-muted-foreground" /> Upload Profile Picture
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleFileSelectForCropper} // Changed to open cropper
                      ref={fileInputRef}
                      className="text-sm file:mr-2 file:py-1.5 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                      disabled={isSubmitting || !!uploadProgress}
                    />
                  </FormControl>
                  {/* Preview is handled by main avatar, clear button is part of general selection */}
                  {uploadProgress !== null && ( /* ... Upload Progress ... */ )}
                  <FormDescription>Max 5MB. JPG, PNG, WEBP, GIF. Image will be cropped to square.</FormDescription>
                </FormItem>

                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => ( /* ... Image URL Input ... */ 
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                         <LinkIconLucide className="h-4 w-4 text-muted-foreground" /> Or Enter Image URL
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="https://example.com/image.png" 
                          {...field} 
                          onChange={(e) => {
                            field.onChange(e);
                            if (e.target.value) {
                              setSelectedPredefinedAvatar(null);
                              setSelectedFile(null);
                              setImgSrcToCrop(null);
                              if(fileInputRef.current) fileInputRef.current.value = "";
                            }
                          }}
                        />
                      </FormControl>
                      <FormDescription>Paste a direct link to an image from the web.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* ... Other FormFields for username, bio, skills, portfolioLinks ... */}
                 <FormField
                  control={form.control} name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl><Input placeholder="Your public username" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control} name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl><Textarea placeholder="Tell us about yourself (max 500 chars)" {...field} value={field.value ?? ''} rows={4} /></FormControl>
                      <FormDescription>A short introduction about your skills and experience.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control} name="skills"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Skills</FormLabel>
                      <FormControl>
                        <MultiSelectSkills
                          options={PREDEFINED_SKILLS}
                          selected={(field.value as Skill[]) || []}
                          onChange={field.onChange}
                          placeholder="Select your skills"
                          maxSkills={20}
                        />
                      </FormControl>
                      <FormDescription>List your key skills (max 20).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div>
                  <FormLabel>Portfolio Links</FormLabel>
                  <div className="space-y-2 mt-2">
                    {actualLinkFields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2">
                        <FormField
                          control={form.control} name={`portfolioLinks.${index}.value`}
                          render={({ field: linkField }) => (
                            <FormItem className="flex-1">
                              <FormControl><Input placeholder="https://your-portfolio.com" {...linkField} value={linkField.value ?? ''} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10" onClick={() => actualRemoveLink(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {actualLinkFields.length < 5 && (
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => actualAppendLink({ value: '' })}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Link
                    </Button>
                  )}
                  <FormMessage>{form.formState.errors.portfolioLinks?.message || (form.formState.errors.portfolioLinks as any)?.root?.message}</FormMessage>
                  <FormDescription className="mt-1">Links to your work (GitHub, Behance, personal site, etc. max 5).</FormDescription>
                </div>
                
                {(selectedFile || selectedPredefinedAvatar || watchedImageUrl || userProfile?.profilePictureUrl) && isEditing && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearImageSelection} className="text-destructive hover:text-destructive flex items-center gap-1 w-full justify-start pl-0">
                        <X className="h-4 w-4" /> Clear Profile Picture
                    </Button>
                )}

                <div className="flex gap-2 justify-end pt-4">
                  <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSubmitting}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting || !!uploadProgress && uploadProgress < 100}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            // ... Display Mode (Bio, Skills, Portfolio) ...
            <div className="space-y-6">
              {userProfile?.bio && (
                <div>
                  <h3 className="font-semibold text-lg mb-1">Bio</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{userProfile.bio}</p>
                </div>
              )}
              {userProfile?.skills && userProfile.skills.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-2">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {userProfile.skills.map((skill, index) => (
                      <Badge key={index} variant="secondary" className="px-3 py-1 text-sm">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {userProfile?.portfolioLinks && userProfile.portfolioLinks.filter(link => link.trim() !== '').length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-2">Portfolio & Links</h3>
                  <ul className="space-y-1.5">
                    {userProfile.portfolioLinks.filter(link => link.trim() !== '').map((link, index) => (
                      <li key={index}>
                        <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1.5">
                          <ExternalLink className="h-4 w-4 shrink-0" /> {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!userProfile?.bio && (!userProfile?.skills || userProfile.skills.length === 0) && (!userProfile?.portfolioLinks || userProfile.portfolioLinks.filter(link => link.trim() !== '').length === 0) && !userProfile?.isBanned && (
                <p className="text-muted-foreground text-center py-4">Your profile is looking a bit empty. Click "Edit Profile" to add your details!</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ... Separator, Activity Overview, Posts Section ... */}
      <Separator className="my-8" />
      {/* ... Activity Overview ... */}
      <Separator className="my-8" />
      {/* ... My Recent Posts ... */}

      {/* Dialog for react-image-crop */}
      <Dialog open={cropModalOpen} onOpenChange={(open) => { if (!open) { setCropModalOpen(false); setImgSrcToCrop(null); if (fileInputRef.current) fileInputRef.current.value = ""; } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop Your Profile Picture</DialogTitle>
            <DialogDescription>Adjust the selection to crop your image. It will be saved as a square.</DialogDescription>
          </DialogHeader>
          {imgSrcToCrop && (
            <div className="mt-4 flex justify-center items-center max-h-[60vh] overflow-hidden">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
                minWidth={50}
                minHeight={50}
                circularCrop={true}
              >
                <img
                  ref={imgRef}
                  alt="Crop me"
                  src={imgSrcToCrop}
                  onLoad={onImageLoad}
                  style={{ maxHeight: '50vh', objectFit: 'contain' }}
                />
              </ReactCrop>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setCropModalOpen(false); setImgSrcToCrop(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>Cancel</Button>
            <Button onClick={handleApplyCrop} disabled={!completedCrop?.width || !completedCrop?.height}>Apply Crop</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ... Followers/Following Modals, PostViewDialog ... */}
    </div>
  );
}
