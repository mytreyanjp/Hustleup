// THIS FILE (/src/app/admin/manage-gigs/[gigId]/page.tsx) IS CAUSING A ROUTING CONFLICT.
// IT MUST BE MANUALLY DELETED.
// It conflicts with the correct file: /src/app/(admin)/admin/manage-gigs/[gigId]/page.tsx
//
// Exporting null and setting dynamic = 'error' is an attempt to make Next.js ignore it or error out,
// but deletion is the proper fix.

export default function ConflictingPageShouldBeDeletedAndWillError() {
  // This component should ideally not even be reached if dynamic='error' works as intended
  // for the parallel route conflict.
  if (typeof window !== 'undefined') {
    console.error(
      "CRITICAL ERROR: Conflicting page component from /src/app/admin/manage-gigs/[gigId]/page.tsx was rendered. This file MUST BE DELETED."
    );
  }
  return null;
}

// Attempt to make Next.js explicitly error out if it tries to render this page.
export const dynamic = 'error';
// Indicate that this page should not be revalidated (though 'error' should prevent rendering).
export const revalidate = 0;
