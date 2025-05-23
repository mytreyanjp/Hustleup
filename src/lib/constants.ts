// src/lib/constants.ts
export const PREDEFINED_SKILLS = [
  // Design
  "Graphic Design", "UI Design", "UX Design", "Illustration", "Logo Design", "Branding", "Photoshop", "Illustrator", "Figma", "Sketch", "Canva", "Adobe XD",
  // Development
  "Web Development", "Frontend Development", "Backend Development", "Full Stack Development", "Mobile App Development", "JavaScript", "TypeScript", "React", "Next.js", "Angular", "Vue.js", "Node.js", "Python", "Django", "Flask", "Java", "Spring Boot", "PHP", "Laravel", "Ruby on Rails", "Swift", "Kotlin", "Flutter", "React Native", "HTML", "CSS", "Tailwind CSS",
  // Writing & Translation
  "Content Writing", "Copywriting", "Technical Writing", "Blog Writing", "Creative Writing", "Editing", "Proofreading", "Translation", "Localization",
  // Video & Animation
  "Video Editing", "Motion Graphics", "Animation", "Premiere Pro", "After Effects", "Final Cut Pro", "DaVinci Resolve", "Blender",
  // Audio & Music
  "Audio Editing", "Music Production", "Voice Over", "Sound Design", "Podcast Editing", "Audacity", "Logic Pro X", "Ableton Live",
  // Marketing & Sales
  "Digital Marketing", "SEO", "SEM", "Social Media Marketing", "Email Marketing", "Content Marketing", "PPC Advertising", "Sales", "Lead Generation",
  // Business & Admin
  "Virtual Assistant", "Data Entry", "Project Management", "Business Analysis", "Customer Service", "Market Research", "PowerPoint", "Excel", "Word",
  // Photography
  "Photography", "Photo Retouching", "Product Photography", "Lightroom",
  // AI & Data Science
  "Machine Learning", "Data Science", "AI Development", "Natural Language Processing (NLP)", "Computer Vision", "Data Analysis", "R Programming", "SQL",
] as const;

export type Skill = typeof PREDEFINED_SKILLS[number];
