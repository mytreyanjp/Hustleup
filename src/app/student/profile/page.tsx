
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc, collection, query, where, getDocs, Timestamp, getDoc } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, UploadCloud, Users, FileText as ApplicationsIcon, Search, Wallet, Edit, Bookmark, Briefcase, GraduationCap, Link as LinkIcon, Grid3X3, Image as ImageIconLucide, ExternalLink } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';
import type { UserProfile } from '@/context/firebase-context';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';


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
  skills: z.array(z.string()).max(15, { message: 'Maximum 15 skills allowed' }).optional(),
  portfolioLinks: z.array(portfolioLinkSchema).max(5, { message: 'Maximum 5 portfolio links allowed' }).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function StudentProfilePage() {
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormReady, setIsFormReady] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableGigsCount, setAvailableGigsCount] = useState<number | null>(null);
  const [activeApplicationsCount, setActiveApplicationsCount] = useState<number | null>(null);
  const [bookmarkedGigsCount, setBookmarkedGigsCount] = useState<number | null>(null);
  const [currentWorksCount, setCurrentWorksCount] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [modalUserList, setModalUserList] = useState<UserProfile[]>([]);
  const [isLoadingModalList, setIsLoadingModalList] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      bio: '',
      skills: [],
      portfolioLinks: [],
    },
  });

  const { fields: actualLinkFields, append: actualAppendLink, remove: actualRemoveLink } = useFieldArray({
    control: form.control,
    name: "portfolioLinks"
  });

  const populateFormAndPreview = useCallback((profile: UserProfile | null) => {
    if (profile) {
      form.reset({
        username: profile.username || user?.email?.split('@')[0] || '',
        bio: profile.bio || '',
        skills: (profile.skills as Skill[]) || [],
        portfolioLinks: profile.portfolioLinks?.map(link => ({ value: link })) || [],
      });
      setImagePreview(profile.profilePictureUrl || null);
    } else if (user) {
      form.reset({
        username: user.email?.split('@')[0] || '',
        bio: '',
        skills: [],
        portfolioLinks: [],
      });
      setImagePreview(null);
    }
  }, [form, user]);

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        router.push('/auth/login?redirect=/student/profile');
      } else {
        populateFormAndPreview(userProfile);
        setIsFormReady(true);
      }
    }
  }, [user, userProfile, authLoading, role, router, populateFormAndPreview]);

  useEffect(() => {
    if (user && userProfile && role === 'student' && db) {
      const fetchStudentDashboardStats = async () => {
        setIsLoadingStats(true);
        try {
          const gigsCollectionRef = collection(db, 'gigs');
          const openGigsQuery = query(gigsCollectionRef, where('status', '==', 'open'));
          const openGigsSnapshot = await getDocs(openGigsQuery);
          let allOpenGigs = openGigsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gig));
          allOpenGigs = allOpenGigs.filter(gig =>
            !(gig.applicants && gig.applicants.some(app => app.studentId === user.uid))
          );
          let matchingGigsCount = 0;
          if (userProfile.skills && userProfile.skills.length > 0) {
            const studentSkillsLower = (userProfile.skills as Skill[]).map(s => s.toLowerCase());
            matchingGigsCount = allOpenGigs.filter(gig =>
              gig.requiredSkills.some(reqSkill => {
                const reqSkillLower = reqSkill.toLowerCase();
                return studentSkillsLower.some(studentSkillLower =>
                  studentSkillLower.includes(reqSkillLower) || reqSkillLower.includes(studentSkillLower)
                );
              })
            ).length;
          } else {
            matchingGigsCount = allOpenGigs.length;
          }
          setAvailableGigsCount(matchingGigsCount);

          const allGigsForAppsSnapshot = await getDocs(collection(db, 'gigs'));
          let currentActiveApplications = 0;
          let currentActiveWorks = 0;
          allGigsForAppsSnapshot.forEach(doc => {
            const gig = doc.data() as Gig;
            if (gig.applicants) {
              const studentApplication = gig.applicants.find(app => app.studentId === user.uid);
              if (studentApplication && (studentApplication.status === 'pending' || studentApplication.status === 'accepted')) {
                currentActiveApplications++;
              }
            }
            if (gig.selectedStudentId === user.uid && gig.status === 'in-progress') {
              currentActiveWorks++;
            }
          });
          setActiveApplicationsCount(currentActiveApplications);
          setCurrentWorksCount(currentActiveWorks);
          setBookmarkedGigsCount(userProfile.bookmarkedGigIds?.length || 0);
        } catch (error) {
          console.error("Error fetching student dashboard stats:", error);
          toast({ title: "Stats Error", description: "Could not load dashboard statistics.", variant: "destructive" });
          setAvailableGigsCount(0);
          setActiveApplicationsCount(0);
          setBookmarkedGigsCount(0);
          setCurrentWorksCount(0);
        } finally {
          setIsLoadingStats(false);
        }
      };
      fetchStudentDashboardStats();
    } else if (!authLoading && userProfile === null && user && role === 'student') {
      setIsLoadingStats(false);
      setAvailableGigsCount(0);
      setActiveApplicationsCount(0);
      setBookmarkedGigsCount(0);
      setCurrentWorksCount(0);
    }
  }, [user, userProfile, role, authLoading, toast]);

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Image Too Large", description: "Please select an image smaller than 5MB.", variant: "destructive" });
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        toast({ title: "Invalid File Type", description: "Please select a JPG, PNG, WEBP, or GIF image.", variant: "destructive" });
        return;
      }
      setSelectedImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleImageUpload = async () => {
    if (!selectedImageFile || !user) {
      toast({ title: "No Image Selected", description: "Please select an image file to upload.", variant: "destructive" });
      return;
    }
    if (!storage) {
      toast({ title: "Storage Error", description: "Firebase Storage is not configured. Cannot upload. Check setup.", variant: "destructive", duration: 10000 });
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    const filePath = `profile_pictures/${user.uid}/${Date.now()}_${selectedImageFile.name}`;
    const fileStorageRefInstance = storageRefFn(storage, filePath); // Renamed for clarity
    const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedImageFile);
    uploadTask.on('state_changed',
      (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      (error: any) => {
        console.error("Firebase Storage Upload Error (Student Profile Pic):", error);
        let detailedErrorMessage = `Could not upload image. Code: ${error.code || 'UNKNOWN'}. Message: ${error.message || 'No message'}.`;
        let toastTitle = "Upload Failed";
        let duration = 15000;

        switch (error.code) {
          case 'storage/unauthorized':
            detailedErrorMessage = "Upload failed: Permission denied. CRITICAL: Check Firebase Storage rules for 'profile_pictures/{userId}/...'. Ensure they allow authenticated users to write. Also, check login status. If on Spark plan and cannot access Rules tab, you may need to upgrade to Blaze plan.";
            break;
          case 'storage/canceled': detailedErrorMessage = "Upload canceled."; break;
          case 'storage/object-not-found': detailedErrorMessage = "Upload failed: Path or object not found. Check Storage bucket config or rules."; break;
          case 'storage/bucket-not-found': detailedErrorMessage = "Upload failed: Firebase Storage bucket not found. Verify `storageBucket` in Firebase config and ensure Storage is enabled."; break;
          case 'storage/project-not-found': detailedErrorMessage = "Upload failed: Firebase project not found. Verify Firebase project settings."; break;
          case 'storage/quota-exceeded': detailedErrorMessage = "Upload failed: Storage quota exceeded. Upgrade plan or free up space."; break;
          case 'storage/retry-limit-exceeded': detailedErrorMessage = "Upload failed after retries. Check network and Firebase Storage status."; break;
          default:
            if (error.message && (error.message.toLowerCase().includes('network request failed') || error.message.toLowerCase().includes('net::err_failed')) || error.code === 'storage/unknown' || !error.code) {
              toastTitle = "Network Error During Upload";
              detailedErrorMessage = `Upload failed (network issue). Check internet, browser Network tab, CORS for Storage bucket. Ensure Storage is enabled and rules are set. Error: ${error.message || 'Unknown network error'}`;
              duration = 20000;
            } else {
              detailedErrorMessage = `An unknown error occurred (Code: ${error.code || 'N/A'}). Check network, Storage rules, project plan. Server response: ${error.serverResponse || 'N/A'}`;
            }
            break;
        }
        toast({
          id: `student-pfp-upload-failed-${error.code || 'unknown'}`,
          title: toastTitle,
          description: detailedErrorMessage,
          variant: "destructive",
          duration: duration
        });
        setIsUploading(false); setUploadProgress(null); setSelectedImageFile(null);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const userDocRef = doc(db, 'users', user.uid);
          await updateDoc(userDocRef, { profilePictureUrl: downloadURL, updatedAt: Timestamp.now() });
          toast({ title: "Profile Picture Updated!", description: "Your new picture is now live." });
          if (refreshUserProfile) await refreshUserProfile();
          setSelectedImageFile(null); 
        } catch (updateError: any) {
          console.error("Error updating profile picture URL in Firestore:", updateError);
          toast({ title: "Update Failed", description: `Could not save profile picture URL: ${updateError.message}`, variant: "destructive" });
        } finally {
          setIsUploading(false); setUploadProgress(null);
        }
      }
    );
  };

  const onSubmit = async (data: ProfileFormValues) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData: Partial<UserProfile> = {
        username: data.username,
        bio: data.bio || '',
        skills: data.skills || [],
        portfolioLinks: data.portfolioLinks?.map(link => link.value).filter(Boolean) || [],
        updatedAt: Timestamp.now(),
      };
      
      if (userProfile?.profilePictureUrl && !selectedImageFile) { 
        updateData.profilePictureUrl = userProfile.profilePictureUrl;
      } else if (imagePreview && !selectedImageFile && (!userProfile || userProfile.profilePictureUrl !== imagePreview)) {
         updateData.profilePictureUrl = imagePreview; 
      }


      await updateDoc(userDocRef, updateData);
      toast({ title: 'Profile Updated', description: 'Your profile details have been successfully saved.' });
      if (refreshUserProfile) await refreshUserProfile();
      setIsEditing(false); 
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast({ title: 'Update Failed', description: `Could not update profile: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    populateFormAndPreview(userProfile); 
    setSelectedImageFile(null); 
    setIsEditing(false);
  };

  const getInitials = (email: string | null | undefined, username?: string | null) => {
    if (username) return username.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
  };

  const handleOpenFollowingModal = async () => {
    if (!userProfile || !userProfile.following || userProfile.following.length === 0) {
        setModalUserList([]);
        setShowFollowingModal(true);
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

  const handleOpenFollowersModal = () => {
    setModalUserList([]); 
    setShowFollowersModal(true);
    setIsLoadingModalList(false);
  };


  const followersCount = userProfile?.followersCount || 0;
  const followingCount = userProfile?.following?.length || 0;

  if (authLoading || !isFormReady) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <Card className="glass-card">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            <div className="relative group shrink-0">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 text-4xl border-2 border-muted shadow-md">
                <AvatarImage src={imagePreview || userProfile?.profilePictureUrl} alt={userProfile?.username || 'User'} />
                <AvatarFallback>{getInitials(user?.email, userProfile?.username)}</AvatarFallback>
              </Avatar>
              {isEditing && (
                <Button
                  variant="outline" size="sm"
                  className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 h-8 w-8 p-0 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                  onClick={() => fileInputRef.current?.click()}
                  title="Change profile picture"
                  disabled={isUploading}
                >
                  <UploadCloud className="h-4 w-4" />
                </Button>
              )}
            </div>
            <input type="file" ref={fileInputRef} hidden accept="image/png, image/jpeg, image/webp, image/gif" onChange={handleImageFileChange} disabled={!isEditing || isUploading} />
            
            <div className='text-center sm:text-left flex-grow space-y-1'>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-xl sm:text-2xl">{userProfile?.username || user?.email?.split('@')[0] || 'Your Profile'}</CardTitle>
                {!isEditing && (
                  <Button variant="outline" onClick={() => setIsEditing(true)} className="text-xs sm:text-sm w-full sm:w-auto">
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
              {isEditing && selectedImageFile && !isUploading && (
                <Button onClick={handleImageUpload} size="sm" className="mt-2">
                  <UploadCloud className="mr-2 h-4 w-4" /> Upload New Picture
                </Button>
              )}
              {isEditing && isUploading && uploadProgress !== null && (
                <div className="mt-2 space-y-1">
                  <Progress value={uploadProgress} className="w-full h-2" />
                  <p className="text-xs text-muted-foreground text-center">Uploading: {uploadProgress.toFixed(0)}%</p>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                          maxSkills={15}
                        />
                      </FormControl>
                      <FormDescription>List your key skills (max 15).</FormDescription>
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
                  <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSubmitting || isUploading}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting || isUploading}>
                    {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
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
              {!userProfile?.bio && (!userProfile?.skills || userProfile.skills.length === 0) && (!userProfile?.portfolioLinks || userProfile.portfolioLinks.filter(link => link.trim() !== '').length === 0) && (
                <p className="text-muted-foreground text-center py-4">Your profile is looking a bit empty. Click "Edit Profile" to add your details!</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-8" />

      <div className="space-y-6">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Your Activity Overview</h2>
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-sm font-medium">Available Gigs</CardTitle>
              <Search className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
              <div className="text-2xl sm:text-3xl font-bold">
                {isLoadingStats && availableGigsCount === null ? <Loader2 className="h-7 w-7 animate-spin" /> : availableGigsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Opportunities matching your skills.</p>
              <Button variant="link" size="sm" className="p-0 h-auto mt-3 text-sm" asChild><Link href="/gigs/browse">Browse Gigs</Link></Button>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-sm font-medium">Active Applications</CardTitle>
              <ApplicationsIcon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
              <div className="text-2xl sm:text-3xl font-bold">
                {isLoadingStats && activeApplicationsCount === null ? <Loader2 className="h-7 w-7 animate-spin" /> : activeApplicationsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Applications that are pending or accepted.</p>
              <Button variant="link" size="sm" className="p-0 h-auto mt-3 text-sm" asChild><Link href="/student/applications">View Applications</Link></Button>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-sm font-medium">Bookmarked Gigs</CardTitle>
              <Bookmark className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
              <div className="text-2xl sm:text-3xl font-bold">
                {isLoadingStats && bookmarkedGigsCount === null ? <Loader2 className="h-7 w-7 animate-spin" /> : bookmarkedGigsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Gigs you've saved for later.</p>
              <Button variant="link" size="sm" className="p-0 h-auto mt-3 text-sm" asChild><Link href="/student/bookmarks">View Bookmarks</Link></Button>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-sm font-medium">Current Works</CardTitle>
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
              <div className="text-2xl sm:text-3xl font-bold">
                {isLoadingStats && currentWorksCount === null ? <Loader2 className="h-7 w-7 animate-spin" /> : currentWorksCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Gigs you are currently working on.</p>
              <Button variant="link" size="sm" className="p-0 h-auto mt-3 text-sm" asChild><Link href="/student/works">Manage Works</Link></Button>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
              <Wallet className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
              <div className="text-2xl sm:text-3xl font-bold">$0.00</div>
              <p className="text-xs text-muted-foreground mt-1">Total earnings from completed gigs.</p>
              <Button variant="link" size="sm" className="p-0 h-auto mt-3 text-sm" asChild><Link href="/student/wallet">View Wallet History</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator className="my-8" />

      <Card className="glass-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>My Recent Posts</CardTitle>
          <CardDescription>A quick look at your latest content. <Link href="/student/posts/new" className="text-sm text-primary hover:underline">Create a new post</Link></CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          {/* Placeholder for recent posts preview - will need to fetch student's own posts here */}
          <p className="text-sm text-muted-foreground">Your posts will appear here.</p>
        </CardContent>
      </Card>

       {/* Followers Modal */}
       <Dialog open={showFollowersModal} onOpenChange={setShowFollowersModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Followers</DialogTitle>
            <DialogDescription>
              Users who follow you.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
          {userProfile && userProfile.followersCount === 0 ? (
                <p className="text-sm text-muted-foreground text-center">You have no followers yet.</p>
            ) : (
                <p className="text-sm text-muted-foreground">
                    Fetching a complete list of followers requires a more advanced backend setup for optimal performance.
                    This feature will be enhanced in a future update.
                </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Following Modal */}
      <Dialog open={showFollowingModal} onOpenChange={setShowFollowingModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Following</DialogTitle>
            <DialogDescription>
              Users you are following.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] py-4">
            {isLoadingModalList ? (
              <div className="flex justify-center items-center h-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : modalUserList.length > 0 ? (
              <ul className="space-y-3">
                {modalUserList.map(followedUser => (
                  <li key={followedUser.uid} className="flex items-center justify-between">
                    <Link href={`/profile/${followedUser.uid}`} className="flex items-center gap-3 hover:underline" onClick={() => setShowFollowingModal(false)}>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={followedUser.profilePictureUrl} alt={followedUser.username} />
                        <AvatarFallback>{getInitials(followedUser.email, followedUser.username)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{followedUser.companyName || followedUser.username || 'User'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground text-center">You are not following anyone yet.</p>
            )}
          </ScrollArea>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

    
