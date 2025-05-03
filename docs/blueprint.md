# **App Name**: HustleUp

## Core Features:

- Authentication: Use Firebase Auth for email/password login. During signup, let users select their role: 'Student' or 'Client'.
- Student Dashboard: Create and edit a public portfolio profile with username, profile picture, bio, skills (tags or text array), and portfolio links (array of URLs). View available gigs, apply with a message/file, track applications, and chat with clients.
- Client Dashboard: Post gigs with title, description, budget, deadline, and required skills. See applicants, view student profiles, invite them, initiate/respond to chats, trigger Razorpay payment, and store transaction details.
- Chat System: Real-time messaging using Firestore or Realtime Database. Each conversation tied to a gig or direct student invitation. Use role-based logic to show chat differently to students and clients.
- Wallet/Payments: Integrate Razorpay via frontend SDK, show test-mode Razorpay popup, store transaction data in Firestore, and show summary of payments in student/client dashboards.

## Style Guidelines:

- Primary Color: Dark Blue `#1A202C`
- Secondary: Light Gray `#EDF2F7`
- Accent: Teal `#4DC0B5`
- Fonts: Clean, sans-serif (e.g. Inter, Poppins)
- Layout inspired by Apple & Fiverr: Full-width cards with glassmorphism, fixed top navbar, minimal/smooth transitions, dark mode support.
- Include subtle Framer Motion–style animations.
- Use consistent icon set (e.g. Heroicons or Lucide)