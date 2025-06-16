
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Edit, User, Briefcase, Building, Globe, Info, Mail, Phone, ArrowLeft, Link as LinkIconLucide, X, Crop } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import NextImage from 'next/image';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';


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


const clientProfileEditSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username cannot exceed 50 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters").max(100, "Company name cannot exceed 100 characters"),
  website: z.string().url({ message: "Please enter a valid URL (e.g., https://example.com)" }).max(100).or(z.literal('')),
  companyDescription: z.string().min(20, "Company description must be at least 20 characters").max(500, "Company description cannot exceed 500 characters"),
  personalEmail: z.string().email({ message: 'Invalid email format' }).max(100).optional().or(z.literal('')),
  personalPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format (e.g., +1234567890)' }).max(20).optional().or(z.literal('')),
  imageUrl: z.string().url({ message: "Please enter a valid image URL." }).max(2048, { message: "Image URL is too long."}).optional().or(z.literal('')),
});

type ClientProfileEditFormValues = z.infer<typeof clientProfileEditSchema>;

const PREDEFINED_AVATARS = [
  { url: 'https://picsum.photos/seed/avatar01/200/200', hint: 'abstract design' },
  { url: 'https://picsum.photos/seed/avatar02/200/200', hint: 'nature landscape' },
  { url: 'https://picsum.photos/seed/avatar03/200/200', hint: 'geometric pattern' },
  // Add more if needed
];

export default function EditClientProfilePage() {
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormReady, setIsFormReady] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [selectedPredefinedAvatar, setSelectedPredefinedAvatar] = useState<string | null>(null);
  const [showAvatarGrid, setShowAvatarGrid] = useState(false);

  // States for react-image-crop
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imgSrcToCrop, setImgSrcToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const aspect = 1; // For square profile pictures

  const form = useForm<ClientProfileEditFormValues>({
    resolver: zodResolver(clientProfileEditSchema),
    defaultValues: {
      username: '',
      companyName: '',
      website: '',
      companyDescription: '',
      personalEmail: '',
      personalPhone: '',
      imageUrl: '',
    },
  });

  const watchedImageUrl = form.watch("imageUrl");

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
    } else if (!watchedImageUrl && !selectedPredefinedAvatar && !selectedFile) {
        setImagePreview(userProfile?.profilePictureUrl || null);
    }
  }, [selectedFile, watchedImageUrl, selectedPredefinedAvatar, userProfile?.profilePictureUrl, form, form.formState.errors.imageUrl, cropModalOpen]);


  const populateFormAndPreview = useCallback((profile: UserProfile | null) => {
    if (profile) {
      form.reset({
        username: profile.username || user?.email?.split('@')[0] || '',
        companyName: profile.companyName || '',
        website: profile.website || '',
        companyDescription: profile.companyDescription || '',
        personalEmail: profile.personalEmail || '',
        personalPhone: profile.personalPhone || '',
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
        companyName: '',
        website: '',
        companyDescription: '',
        personalEmail: '',
        personalPhone: '',
        imageUrl: '',
      });
      setImagePreview(null);
      setSelectedPredefinedAvatar(null);
      setSelectedFile(null);
      setImgSrcToCrop(null);
      setShowAvatarGrid(false);
    }
  }, [form, user]);


  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        router.push('/auth/login?redirect=/client/profile/edit');
      } else { 
        populateFormAndPreview(userProfile);
        setIsFormReady(true);
      }
    }
  }, [user, userProfile, authLoading, role, router, populateFormAndPreview]);

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


  const onSubmit = async (data: ClientProfileEditFormValues) => {
    if (!user || !db || !storage) return;
    setIsSubmitting(true);
    setUploadProgress(null);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData: Partial<UserProfile> = {
        username: data.username,
        companyName: data.companyName,
        website: data.website,
        companyDescription: data.companyDescription,
        personalEmail: data.personalEmail || '',
        personalPhone: data.personalPhone || '',
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
      toast({ title: 'Profile Updated', description: 'Your client profile has been successfully saved.' });
      if (refreshUserProfile) await refreshUserProfile();
      router.push('/client/dashboard');
      setSelectedFile(null);
      setUploadProgress(null);
      setImgSrcToCrop(null);
    } catch (error: any) {
      console.error('Client profile update error:', error);
      toast({ title: 'Update Failed', description: `Could not update profile: ${error.message}`, variant: 'destructive' });
      setUploadProgress(null);
    } finally {
      setIsSubmitting(false);
    }
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

  const getInitials = (email: string | null | undefined, username?: string | null, companyName?: string | null) => {
    const nameToUse = companyName || username;
    if (nameToUse && nameToUse.trim() !== '') return nameToUse.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
  };

  if (authLoading || !isFormReady) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-2xl">Edit Client Profile</CardTitle>
          <CardDescription>Update your company and contact information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative group">
              <Avatar className="h-28 w-28 text-3xl border-2 border-muted shadow-md">
                <AvatarImage src={imagePreview || undefined} alt={userProfile?.companyName || userProfile?.username || 'Client'} />
                <AvatarFallback>{getInitials(user?.email, userProfile?.username, userProfile?.companyName)}</AvatarFallback>
              </Avatar>
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
            </div>

            {showAvatarGrid && (
              <div className="w-full pt-4 border-t mt-4">
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
                      <NextImage
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
             
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        placeholder="https://example.com/your-logo.png" 
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
                    <FormDescription>Paste a direct link to an image (e.g., your company logo).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {(selectedFile || selectedPredefinedAvatar || watchedImageUrl || userProfile?.profilePictureUrl) && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearImageSelection} className="text-destructive hover:text-destructive flex items-center gap-1 w-full justify-start pl-0">
                        <X className="h-4 w-4" /> Clear Profile Picture
                    </Button>
              )}


              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <User className="h-4 w-4 text-muted-foreground" /> Contact Person Name / Username
                    </FormLabel>
                    <FormControl><Input placeholder="e.g., John Doe (Public contact)" {...field} /></FormControl>
                    <FormDescription>This is the name displayed on your public profile as the contact person.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Building className="h-4 w-4 text-muted-foreground" /> Company Name
                    </FormLabel>
                    <FormControl><Input placeholder="e.g., Acme Innovations Inc." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Globe className="h-4 w-4 text-muted-foreground" /> Company Website
                    </FormLabel>
                    <FormControl><Input placeholder="https://yourcompany.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Info className="h-4 w-4 text-muted-foreground" /> About Your Company
                    </FormLabel>
                    <FormControl><Textarea placeholder="Tell students about your company, its mission, and the types of projects you typically offer (min 20 characters)." {...field} rows={4} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Card className="bg-secondary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Personal Contact Details (for sharing)</CardTitle>
                  <CardDescription className="text-xs">These details are optional and will only be shared in a chat if you explicitly choose to. They are not public on your profile.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="personalEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Mail className="h-4 w-4 text-muted-foreground" /> Personal Email (Optional)
                        </FormLabel>
                        <FormControl><Input type="email" placeholder="your.personal@example.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="personalPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Phone className="h-4 w-4 text-muted-foreground" /> Personal Phone (Optional)
                        </FormLabel>
                        <FormControl><Input type="tel" placeholder="+1234567890" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || !!uploadProgress && uploadProgress < 100}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Dialog for react-image-crop */}
      <Dialog open={cropModalOpen} onOpenChange={(open) => { if (!open) { setCropModalOpen(false); setImgSrcToCrop(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}}>
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

    </div>
  );
}
