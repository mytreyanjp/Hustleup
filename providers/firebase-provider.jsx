
   // Or show an error if Firebase couldn't initialize

   if (loading && typeof window !== 'undefined') {
     return (
       <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[999]">
         <Loader2 className="h-10 w-10 animate-spin text-primary" />
       </div>
     );
   }

   // Check if Firebase initialized correctly after loading
   if (!loading && (!auth || !db)) { // Check if core services are missing
     return (
       <div className="fixed inset-0 flex items-center justify-center bg-background/90 z-[999] p-4">
         <div className="text-center text-destructive-foreground bg-destructive p-6 rounded-lg shadow-lg max-w-md">
            <h2 className="text-xl font-semibold mb-2">Configuration Error</h2>
            <p className="text-sm">
              There seems to be an issue with the Firebase configuration. Please check the environment variables (<code>.env.local</code>) and ensure they are correct. Restart the development server after making changes.
            </p>
           <p className="text-xs mt-4">Missing required variables for Firebase to function.</p>
         </div>
       </div>
     );
   }


  const value = { user, userProfile, loading, role, refreshUserProfile };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

    