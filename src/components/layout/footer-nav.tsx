
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
    <Link 
      href={href} 
      className={cn(
        "flex flex-col items-center justify-center flex-1 py-2 px-1 text-xs h-full", 
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      aria-label={label}
      title={label}
    >
      <div className="relative">
        <Icon className="h-6 w-6" /> 
        {unreadCount && unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1.5 -right-2 text-[10px] h-[18px] w-[18px] p-0 flex items-center justify-center leading-none"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </div>
    </Link>
  );
};

export default function FooterNav() {
  const { user, role, totalUnreadChats } = useFirebase();
  const pathname = usePathname();

  if (!user) { 
    return null;
  }

  const getDashboardUrl = () => {
    if (role === 'student') return '/student/profile';
    if (role === 'client') return '/client/dashboard';
    return '/'; 
  };

  const navItemsBase = [
    { href: "/gigs/browse", icon: Compass, label: "Explore", show: true },
    // Conditional items will be added below
    { href: "/chat", icon: MessageSquare, label: "Messages", show: !!user, unreadCount: totalUnreadChats },
    { href: getDashboardUrl(), icon: UserIcon, label: role === 'student' ? "Profile" : "Dashboard", show: !!user },
  ];

  let specificNavItems = [];
  if (role === 'client') {
    specificNavItems.push({ href: "/hustlers/browse", icon: Users, label: "Hustlers", show: true });
  } else if (role === 'student') {
    specificNavItems.push({ href: "/student/works", icon: Briefcase, label: "Works", show: true });
  }

  // Insert role-specific items into a consistent position, e.g., after "Explore"
  const navItems = [
    navItemsBase[0],
    ...specificNavItems,
    ...navItemsBase.slice(1)
  ].filter(Boolean) as unknown as NavItemProps[];


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
