
// =====================================================================================
// !! URGENT: DELETE THIS FILE !!
// =====================================================================================
// This file (src/app/admin/manage-gigs/[gigId]/page.tsx) is a DUPLICATE and
// causes a "parallel pages" routing conflict with:
//   src/app/(admin)/admin/manage-gigs/[gigId]/page.tsx
//
// This placeholder content is an attempt to temporarily resolve the error.
// THE PERMANENT FIX IS TO DELETE THIS ENTIRE FILE MANUALLY.
// =====================================================================================

export default function PlaceholderDuplicateAdminGigDetail() {
  // This component does nothing and should not be rendered.
  // Its existence (even if empty) can sometimes still cause routing issues if
  // Next.js detects it as a potential page component.
  return null;
}

// Adding a console warning that might show up during build or dev server startup
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.warn(`
    *************************************************************************************
    [HustleUp Auto-Generated Warning - Action Required]
    POTENTIAL ROUTING CONFLICT DETECTED BY PLACEHOLDER.
    The file at 'src/app/admin/manage-gigs/[gigId]/page.tsx' is a duplicate.
    PLEASE DELETE THIS FILE MANUALLY to resolve the Next.js "parallel pages" error.
    The correct file is located at 'src/app/(admin)/admin/manage-gigs/[gigId]/page.tsx'.
    A full server restart may be needed after deletion.
    *************************************************************************************
  `);
}
