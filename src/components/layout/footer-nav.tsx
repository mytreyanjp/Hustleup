
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Users, Briefcase, MessageSquare, User as UserIcon, PlusCircle } from 'lucide-react';
import { useFirebase } from '@/context/firebase-context';
import { cn } from '@/lib/utils';

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
        "flex items-center justify-center flex-1 py-2 px-1 h-full",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      aria-label={label}
      title={label}
    >
      <div className="relative inline-flex items-center justify-center">
        <Icon className="h-6 w-6" />
        {typeof unreadCount === 'number' && unreadCount > 0 && (
          <span
            className="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
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

  let generatedNavItems: Omit<NavItemProps, 'isActive'>[] = [];

  generatedNavItems.push({ href: "/gigs/browse", icon: Compass, label: "Explore" });

  if (role === 'student') {
    generatedNavItems.push({ href: "/student/works", icon: Briefcase, label: "Works" });
  } else if (role === 'client') {
    generatedNavItems.push({ href: "/hustlers/browse", icon: Users, label: "Hustlers" });
    generatedNavItems.push({ href: "/client/gigs/new", icon: PlusCircle, label: "New Gig" });
  }
  
  generatedNavItems.push({ href: "/chat", icon: MessageSquare, label: "Messages", unreadCount: totalUnreadChats });
  generatedNavItems.push({ href: getDashboardUrl(), icon: UserIcon, label: role === 'student' ? "Profile" : "Dashboard" });
  
  const navItems = generatedNavItems.map(item => ({
      ...item,
      isActive: pathname === item.href,
      show: true, // All generated items are shown if user exists
  }));


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
              isActive={item.isActive}
              unreadCount={item.unreadCount}
            />
          )
        ))}
      </nav>
    </footer>
  );
}
