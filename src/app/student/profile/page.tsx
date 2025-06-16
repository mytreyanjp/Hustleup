
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc, collection, query, where, getDocs, Timestamp, getDoc, orderBy, arrayUnion, arrayRemove, increment, deleteDoc } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
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
import Image from 'next/image';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogPrimitiveTitle,
  AlertDialogDescription as AlertDialogPrimitiveDescription,
  AlertDialogFooter // Added missing import
} from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PostViewDialog } from '@/components/posts/post-view-dialog';
import type { StudentPost } from '@/types/posts';
import { Progress } from '@/components/ui/progress';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Skeleton } from "@/components/ui/skeleton";

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
      'image/png',
      0.9
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
];

export default function StudentProfilePage() {
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormReady, setIsFormReady] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [selectedPredefinedAvatar, setSelectedPredefinedAvatar] = useState<string | null>(null);
  const [showAvatarGrid, setShowAvatarGrid] = useState(false);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imgSrcToCrop, setImgSrcToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const aspect = 1;

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
  const [postToDelete, setPostToDelete] = useState<StudentPost | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);


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
      } else if (userProfile) {
        populateFormAndPreview(userProfile);
        fetchStudentPosts();
        setIsFormReady(true);
      } else {
        setIsFormReady(false);
      }
    }
  }, [user, userProfile, authLoading, role, router, populateFormAndPreview, fetchStudentPosts]);


  useEffect(() => {
    if (user && userProfile && role === 'student' && db && !userProfile.isBanned) {
      const fetchStudentDashboardStats = async () => {
        setIsLoadingStats(true);
        try {
          const openGigsQuery = query(collection(db, 'gigs'), where('status', '==', 'open'));
          const openGigsSnapshot = await getDocs(openGigsQuery);
          setAvailableGigsCount(openGigsSnapshot.size);

          const gigsCollectionRef = collection(db, 'gigs');
          const allGigsSnapshot = await getDocs(gigsCollectionRef);
          let activeApps = 0;
          allGigsSnapshot.forEach(gigDoc => {
            const gigData = gigDoc.data() as Gig;
            if (gigData.applicants?.some(app => app.studentId === user.uid && app.status === 'pending')) {
              activeApps++;
            }
          });
          setActiveApplicationsCount(activeApps);

          setBookmarkedGigsCount(userProfile.bookmarkedGigIds?.length || 0);

          const currentWorksQuery = query(collection(db, 'gigs'), where('selectedStudentId', '==', user.uid), where('status', '==', 'in-progress'));
          const currentWorksSnapshot = await getDocs(currentWorksQuery);
          setCurrentWorksCount(currentWorksSnapshot.size);

          const reviewsQuery = query(collection(db, 'reviews'), where('studentId', '==', user.uid));
          const reviewsSnapshot = await getDocs(reviewsQuery);
          setReviewsCount(reviewsSnapshot.size);

        } catch (error) {
          console.error("Error fetching student dashboard stats:", error);
          toast({ title: "Stats Error", description: "Could not load dashboard statistics.", variant: "destructive" });
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

 useEffect(() => {
    if (selectedFile && !cropModalOpen) {
        const reader = new FileReader();
        reader.onloadend = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(selectedFile);
        form.setValue("imageUrl", "");
        setSelectedPredefinedAvatar(null);
    } else if (watchedImageUrl && form.formState.errors.imageUrl === undefined) {
        setImagePreview(watchedImageUrl);
        setSelectedPredefinedAvatar(null);
        setSelectedFile(null);
    } else if (!watchedImageUrl && selectedPredefinedAvatar) {
        setImagePreview(selectedPredefinedAvatar);
        setSelectedFile(null);
    } else if (!watchedImageUrl && !selectedPredefinedAvatar && !selectedFile && !cropModalOpen && userProfile) {
        setImagePreview(userProfile.profilePictureUrl || null);
    }
  }, [selectedFile, watchedImageUrl, selectedPredefinedAvatar, userProfile, form, form.formState.errors.imageUrl, cropModalOpen]);

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
      setSelectedFile(croppedFile);

      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(croppedFile);

      form.setValue("imageUrl", "");
      setSelectedPredefinedAvatar(null);
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

      if (selectedFile) {
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

  const getInitials = (email?: string | null, username?: string | null) => {
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
      if (file.size > 5 * 1024 * 1024) {
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
    if (userProfile?.profilePictureUrl && !PREDEFINED_AVATARS.some(a => a.url === userProfile.profilePictureUrl)) {
        setImagePreview(userProfile.profilePictureUrl);
        form.setValue("imageUrl", userProfile.profilePictureUrl || "");
        setSelectedPredefinedAvatar(null);
    } else if (userProfile?.profilePictureUrl && PREDEFINED_AVATARS.some(a => a.url === userProfile.profilePictureUrl)) {
        setImagePreview(userProfile.profilePictureUrl);
        setSelectedPredefinedAvatar(userProfile.profilePictureUrl);
        form.setValue("imageUrl", "");
    } else {
        setImagePreview(null);
        form.setValue("imageUrl", "");
        setSelectedPredefinedAvatar(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setCrop(undefined);
    setCompletedCrop(undefined);
  };


  const handleOpenFollowingModal = async () => {
    if (!userProfile || !userProfile.following || userProfile.following.length === 0) {
        setModalUserList([]);
        setShowFollowingModal(true);
        return;
    }
    if (!db) {
        toast({ title: "Database Error", description: "Could not load following list.", variant: "destructive" });
        return;
    }
    setIsLoadingModalList(true);
    setShowFollowingModal(true);
    try {
        const followingProfilesPromises = userProfile.following.map(uid => getDoc(doc(db, 'users', uid)));
        const followingSnapshots = await Promise.all(followingProfilesPromises);
        const fetchedProfiles = followingSnapshots
            .filter(snap => snap.exists())
            .map(snap => ({ uid: snap.id, ...snap.data() } as UserProfile));
        setModalUserList(fetchedProfiles);
    } catch (error) {
        console.error("Error fetching following list:", error);
        toast({ title: "Error", description: "Could not load following list.", variant: "destructive" });
        setModalUserList([]);
    } finally {
        setIsLoadingModalList(false);
    }
  };

  const handleOpenFollowersModal = async () => {
    if (!userProfile || !db) {
        toast({ title: "Error", description: "Profile data not available.", variant: "destructive" });
        return;
    }
    if (userProfile.followersCount === 0) {
        setModalUserList([]);
        setShowFollowersModal(true);
        return;
    }

    setIsLoadingModalList(true);
    setShowFollowersModal(true);
    try {
        const followersQuery = query(collection(db, 'users'), where('following', 'array-contains', userProfile.uid));
        const followersSnapshots = await getDocs(followersQuery);
        const fetchedProfiles = followersSnapshots.docs
            .map(snap => ({ uid: snap.id, ...snap.data() } as UserProfile));
        setModalUserList(fetchedProfiles);
    } catch (error: any) {
        console.error("Error fetching followers list:", error);
        toast({ title: "Error", description: `Could not load followers list: ${error.message}. Check for Firestore index requirements.`, variant: "destructive" });
        setModalUserList([]);
    } finally {
        setIsLoadingModalList(false);
    }
  };

  const handleOpenDeletePostDialog = (post: StudentPost) => {
    setPostToDelete(post);
  };

  const handleConfirmDeletePost = async () => {
    if (!postToDelete || !user || user.uid !== postToDelete.studentId || !db) {
        toast({title: "Error", description: "Cannot delete post. Invalid conditions or permissions.", variant: "destructive"});
        setPostToDelete(null);
        return;
    }
    setIsDeletingPost(true);
    try {
        const postDocRef = doc(db, 'student_posts', postToDelete.id);
        await deleteDoc(postDocRef);

        if (postToDelete.imageUrl && storage) {
            try {
                const imagePath = decodeURIComponent(new URL(postToDelete.imageUrl).pathname.split('/o/')[1].split('?')[0]);
                const imageRef = storageRefFn(storage, imagePath);
                await deleteObject(imageRef);
            } catch (storageError: any) {
                console.warn("Could not delete post image from storage:", storageError);
                if (storageError.code !== 'storage/object-not-found') {
                   toast({ title: "Storage Deletion Issue", description: `Post document deleted, but image removal failed: ${storageError.message}. Check storage rules.`, variant: "default", duration: 7000});
                }
            }
        }
        toast({ title: "Post Deleted", description: "Your post has been successfully removed." });
        await fetchStudentPosts();
        if (selectedPostForDialog?.id === postToDelete.id) {
            setSelectedPostForDialog(null);
        }
    } catch (error: any) {
        console.error("Error deleting post:", error);
        toast({ title: "Deletion Failed", description: `Could not delete post: ${error.message}`, variant: "destructive" });
    } finally {
        setIsDeletingPost(false);
        setPostToDelete(null);
    }
  };


  const followersCount = userProfile?.followersCount || 0;
  const followingCount = userProfile?.following?.length || 0;

  if (authLoading || !isFormReady || !userProfile) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      {userProfile.isBanned && (
        <Card className="glass-card border-destructive">
          <CardHeader className="p-4">
            <CardTitle className="text-destructive flex items-center gap-2"><UserX className="h-5 w-5"/> Account Suspended</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm text-destructive/90">Your account is currently suspended. You cannot edit your profile or use most platform features. Please contact support if you believe this is an error.</p>
          </CardContent>
        </Card>
      )}
      <Card className="glass-card">
        <CardHeader className="p-4 sm:p-6">
           <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            <div className="relative group shrink-0">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 text-4xl border-2 border-muted shadow-md">
                <AvatarImage src={imagePreview || undefined} alt={userProfile.username || 'User'} />
                <AvatarFallback>{getInitials(user?.email, userProfile.username)}</AvatarFallback>
              </Avatar>
              {isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-background shadow-md hover:bg-accent"
                  onClick={() => setShowAvatarGrid(prev => !prev)}
                  aria-label="Choose avatar"
                  disabled={userProfile.isBanned}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className='text-center sm:text-left flex-grow space-y-1'>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-xl sm:text-2xl">{userProfile.username || user?.email?.split('@')[0] || 'Your Profile'}</CardTitle>
                {!isEditing && (
                  <Button variant="outline" onClick={() => setIsEditing(true)} className="text-xs sm:text-sm w-full sm:w-auto" disabled={userProfile.isBanned}>
                    <Edit className="mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Edit Profile
                  </Button>
                )}
              </div>
              <CardDescription className="text-xs sm:text-sm">{userProfile.email || 'No email provided'}</CardDescription>
              <div className="flex items-center justify-center sm:justify-start gap-4 text-xs sm:text-sm text-muted-foreground pt-1">
                 <button onClick={handleOpenFollowersModal} className="flex items-center gap-1 hover:underline focus:outline-none" disabled={userProfile.isBanned}>
                    <Users className="h-4 w-4" /> <span className="font-semibold text-foreground">{followersCount}</span> Followers
                 </button>
                 <button onClick={handleOpenFollowingModal} className="flex items-center gap-1 hover:underline focus:outline-none" disabled={userProfile.isBanned}>
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
                {showAvatarGrid && (
                  <div className="w-full pt-4 border-t">
                    <p className="text-sm font-medium text-center mb-3">Choose a Predefined Avatar</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {PREDEFINED_AVATARS.map((avatar) => (
                        <button
                          type="button"
                          key={avatar.url}
                          onClick={() => handleSelectPredefinedAvatar(avatar.url)}
                          className={cn(
                            "rounded-lg overflow-hidden border-2 p-0.5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 aspect-square",
                            imagePreview === avatar.url && !watchedImageUrl && !selectedFile ? "border-primary ring-2 ring-primary ring-offset-2" : "border-transparent hover:border-muted-foreground/50"
                          )}
                          title={`Select avatar: ${avatar.hint}`}
                        >
                          <Image
                            src={avatar.url}
                            alt={avatar.hint}
                            width={80}
                            height={80}
                            className="object-cover w-full h-full"
                            data-ai-hint={avatar.hint}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                 <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <UploadCloud className="h-4 w-4 text-muted-foreground" /> Upload Profile Picture
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleFileSelectForCropper}
                      ref={fileInputRef}
                      className="text-sm file:mr-2 file:py-1.5 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                      disabled={isSubmitting || !!uploadProgress}
                    />
                  </FormControl>
                  {uploadProgress !== null && (
                    <div className="space-y-1 pt-1">
                        <Progress value={uploadProgress} className="w-full h-2" />
                        <p className="text-xs text-muted-foreground text-center">{Math.round(uploadProgress)}% uploaded</p>
                    </div>
                  )}
                  <FormDescription>Max 5MB. JPG, PNG, WEBP, GIF. Image will be cropped to square.</FormDescription>
                </FormItem>

                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
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
                 {(selectedFile || selectedPredefinedAvatar || watchedImageUrl || userProfile.profilePictureUrl) && isEditing && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearImageSelection} className="text-destructive hover:text-destructive flex items-center gap-1 w-full justify-start pl-0">
                        <X className="h-4 w-4" /> Clear Profile Picture
                    </Button>
                )}
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
            <div className="space-y-6">
              {userProfile.bio && (
                <div>
                  <h3 className="font-semibold text-lg mb-1">Bio</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{userProfile.bio}</p>
                </div>
              )}
              {userProfile.skills && userProfile.skills.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-2">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {userProfile.skills.map((skill, index) => (
                      <Badge key={index} variant="secondary" className="px-3 py-1 text-sm">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {userProfile.portfolioLinks && userProfile.portfolioLinks.filter(link => link.trim() !== '').length > 0 && (
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
              {!userProfile.bio && (!userProfile.skills || userProfile.skills.length === 0) && (!userProfile.portfolioLinks || userProfile.portfolioLinks.filter(link => link.trim() !== '').length === 0) && !userProfile.isBanned && (
                <p className="text-muted-foreground text-center py-4">Your profile is looking a bit empty. Click "Edit Profile" to add your details!</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-8" />
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-xl">Activity Overview</CardTitle>
            <CardDescription>A quick look at your HustleUp journey.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex justify-center items-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : userProfile.isBanned ? (
                 <p className="text-sm text-destructive text-center py-4">Account functionality is limited due to suspension.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                <Link href="/gigs/browse" className="p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                  <Search className="h-8 w-8 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{availableGigsCount ?? <Skeleton className="h-6 w-10 mx-auto" />}</p>
                  <p className="text-xs text-muted-foreground">Available Gigs</p>
                </Link>
                <Link href="/student/applications" className="p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                  <ApplicationsIcon className="h-8 w-8 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{activeApplicationsCount ?? <Skeleton className="h-6 w-10 mx-auto" />}</p>
                  <p className="text-xs text-muted-foreground">Active Applications</p>
                </Link>
                <Link href="/student/bookmarks" className="p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                  <Bookmark className="h-8 w-8 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{bookmarkedGigsCount ?? <Skeleton className="h-6 w-10 mx-auto" />}</p>
                  <p className="text-xs text-muted-foreground">Bookmarked Gigs</p>
                </Link>
                <Link href="/student/works" className="p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                  <Briefcase className="h-8 w-8 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{currentWorksCount ?? <Skeleton className="h-6 w-10 mx-auto" />}</p>
                  <p className="text-xs text-muted-foreground">Current Works</p>
                </Link>
                <Link href="/student/reviews" className="p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                  <StarIcon className="h-8 w-8 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{reviewsCount ?? <Skeleton className="h-6 w-10 mx-auto" />}</p>
                  <p className="text-xs text-muted-foreground">Reviews Received</p>
                </Link>
                <Link href="/student/wallet" className="p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                  <Wallet className="h-8 w-8 mx-auto text-primary mb-1" />
                  <p className="text-xs text-muted-foreground mt-2">My Wallet</p>
                  <p className="text-xs text-muted-foreground">(View earnings)</p>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

      <Separator className="my-8" />

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">My Recent Posts</CardTitle>
            <CardDescription>Showcase your work and updates.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" disabled={userProfile.isBanned}>
            <Link href="/student/posts/new"><PlusCircle className="mr-2 h-4 w-4"/> New Post</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingPosts ? (
             <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : posts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
              {posts.map(post => (
                <div key={post.id} className="relative group">
                  <button
                    className="aspect-square w-full relative group/post-item overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    onClick={() => setSelectedPostForDialog(post)}
                    aria-label={`View post: ${post.caption || 'Image post'}`}
                    disabled={userProfile.isBanned}
                  >
                    {post.imageUrl && post.imageUrl.trim() !== '' ? (
                      <Image
                        src={post.imageUrl}
                        alt={post.caption || `Post by ${userProfile.username || 'user'}`}
                        layout="fill"
                        objectFit="cover"
                        className="group-hover/post-item:scale-105 transition-transform duration-300"
                        data-ai-hint="student work"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full w-full bg-muted rounded-md">
                        <ImageIconLucide className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </button>
                  <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={() => handleOpenDeletePostDialog(post)}
                      title="Delete Post"
                      disabled={userProfile.isBanned}
                  >
                      <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <ImageIconLucide className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <p>You haven't made any posts yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPostForDialog && (
        <PostViewDialog
          post={selectedPostForDialog}
          isOpen={!!selectedPostForDialog}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedPostForDialog(null);
          }}
          viewerUser={user}
          viewerUserProfile={userProfile}
          onCommentAdded={fetchStudentPosts}
          onInitiateDelete={handleOpenDeletePostDialog}
          canViewerDeletePost={user?.uid === selectedPostForDialog.studentId}
        />
      )}

      <AlertDialog open={!!postToDelete} onOpenChange={(isOpen) => !isOpen && setPostToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogPrimitiveTitle>Delete this post?</AlertDialogPrimitiveTitle>
            <AlertDialogPrimitiveDescription>
              This action cannot be undone. The post and its image will be permanently deleted.
            </AlertDialogPrimitiveDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPost}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeletePost} disabled={isDeletingPost} className="bg-destructive hover:bg-destructive/90">
              {isDeletingPost ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Yes, Delete Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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

      <Dialog open={showFollowersModal} onOpenChange={setShowFollowersModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Followers</DialogTitle>
            <DialogDescription>Users who follow you.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] py-4">
            {isLoadingModalList ? (
              <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : modalUserList.length > 0 ? (
              <ul className="space-y-3">
                {modalUserList.map(userItem => (
                  <li key={userItem.uid} className="flex items-center justify-between">
                    <Link href={`/profile/${userItem.uid}`} className="flex items-center gap-3 hover:underline" onClick={() => setShowFollowersModal(false)}>
                      <Avatar className="h-8 w-8"><AvatarImage src={userItem.profilePictureUrl} alt={userItem.username} /><AvatarFallback>{getInitials(undefined, userItem.username)}</AvatarFallback></Avatar>
                      <span className="text-sm font-medium">{userItem.username || 'User'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (<p className="text-sm text-muted-foreground text-center">You have no followers yet.</p>)}
          </ScrollArea>
          <DialogFooter><DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFollowingModal} onOpenChange={setShowFollowingModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Following</DialogTitle>
            <DialogDescription>Users you are following.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] py-4">
            {isLoadingModalList ? (
              <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : modalUserList.length > 0 ? (
              <ul className="space-y-3">
                {modalUserList.map((followedUser) => (
                  <li key={followedUser.uid} className="flex items-center justify-between">
                    <Link href={`/profile/${followedUser.uid}`} className="flex items-center gap-3 hover:underline" onClick={() => setShowFollowingModal(false)}>
                      <Avatar className="h-8 w-8"><AvatarImage src={followedUser.profilePictureUrl} alt={followedUser.username} /><AvatarFallback>{getInitials(undefined, followedUser.username)}</AvatarFallback></Avatar>
                      <span className="text-sm font-medium">{followedUser.username || 'User'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (<p className="text-sm text-muted-foreground text-center">You are not following anyone yet.</p>)}
          </ScrollArea>
          <DialogFooter><DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

