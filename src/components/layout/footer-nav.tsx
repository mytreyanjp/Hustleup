
"use client";

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Compass, Users, Briefcase, MessageSquare, User as UserIcon, Home } from 'lucide-react';
import { useFirebase } from '@/context/firebase-context';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  unreadCount?: number;
}

const NavItem: React.FC<NavItemProps> = ({ href, icon: Icon, label, isActive, unreadCount }) => {
  return (
    <Link href={href} className={cn(
      "flex flex-col items-center justify-center flex-1 py-2 px-1 text-xs",
      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
    )}>
      <div className="relative">
        <Icon className="h-5 w-5 mb-0.5" />
        {unreadCount && unreadCount > 0 && (
          <Badge variant="destructive" className="absolute -top-1 -right-2 text-[9px] h-4 w-4 p-0 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </div>
      <span className={cn("truncate", isActive && "font-semibold")}>{label}</span>
    </Link>
  );
};

export default function FooterNav() {
  const { user, role, totalUnreadChats } = useFirebase();
  const pathname = usePathname();

  if (!user) { // Don't show footer nav if user is not logged in for now
    return null;
  }

  const getDashboardUrl = () => {
    if (role === 'student') return '/student/profile';
    if (role === 'client') return '/client/dashboard';
    return '/'; // Fallback, though ideally user has a role
  };

  const navItems = [
    { href: "/gigs/browse", icon: Compass, label: "Explore", show: true },
    role === 'client' && { href: "/hustlers/browse", icon: Users, label: "Hustlers", show: true },
    role === 'student' && { href: "/student/works", icon: Briefcase, label: "Works", show: true },
    { href: "/chat", icon: MessageSquare, label: "Messages", show: !!user, unreadCount: totalUnreadChats },
    { href: getDashboardUrl(), icon: UserIcon, label: role === 'student' ? "Profile" : "Dashboard", show: !!user },
  ].filter(Boolean) as NavItemProps[]; // Filter out false values from conditional rendering

  return (
    <footer className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-md z-40">
      <nav className="flex items-center justify-around h-16">
        {navItems.map((item) => (
          item.show && (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              isActive={pathname === item.href}
              unreadCount={item.unreadCount}
            />
          )
        ))}
      </nav>
    </footer>
  );
}
