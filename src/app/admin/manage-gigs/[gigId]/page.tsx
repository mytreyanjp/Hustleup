// THIS FILE (/src/app/admin/manage-gigs/[gigId]/page.tsx) IS CAUSING A ROUTING CONFLICT.
// IT MUST BE MANUALLY DELETED.
// It conflicts with the correct file: /src/app/(admin)/admin/manage-gigs/[gigId]/page.tsx

export const message = "This file should be deleted. It is causing a routing conflict.";

// Not exporting a default function component to try and prevent Next.js from treating it as a page.
// However, manual deletion is the only guaranteed fix for this type of file-based routing conflict.

console.error(
  "CRITICAL ERROR: Conflicting file /src/app/admin/manage-gigs/[gigId]/page.tsx is still present and might be causing routing issues. This file MUST BE DELETED MANUALLY."
);

// If Next.js still picks this up, it might throw an error due to missing default export for a page.
// Forcing an error if somehow processed:
if (typeof window !== 'undefined') {
  // This will likely not run if Next.js build/dev server already identifies the no-default-export issue.
  // throw new Error("Conflicting page /src/app/admin/manage-gigs/[gigId]/page.tsx was processed. It must be deleted.");
}
