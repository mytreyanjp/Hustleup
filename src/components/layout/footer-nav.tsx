
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Users, Briefcase, MessageSquare, User as UserIcon } from 'lucide-react';
import { useFirebase } from '@/context/firebase-context';
import { cn } from '@/lib/utils';
// Removed Badge import as we'll use a simple span for consistency with Navbar

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
        "flex items-center justify-center flex-1 py-2 px-1 h-full", // Removed flex-col
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      aria-label={label}
      title={label}
    >
      <div className="relative inline-flex items-center justify-center">
        <Icon className="h-6 w-6" />
        {/* Conditionally render the badge as a span if unreadCount > 0 */}
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

  const navItemsBase = [
    { href: "/gigs/browse", icon: Compass, label: "Explore", show: true },
    { href: "/chat", icon: MessageSquare, label: "Messages", show: !!user, unreadCount: totalUnreadChats },
    { href: getDashboardUrl(), icon: UserIcon, label: role === 'student' ? "Profile" : "Dashboard", show: !!user },
  ];

  let specificNavItems = [];
  if (role === 'client') {
    specificNavItems.push({ href: "/hustlers/browse", icon: Users, label: "Hustlers", show: true });
  } else if (role === 'student') {
    specificNavItems.push({ href: "/student/works", icon: Briefcase, label: "Works", show: true });
  }

  const navItems = [
    navItemsBase[0],
    ...specificNavItems,
    ...navItemsBase.slice(1)
  ].filter(Boolean) as NavItemProps[];


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
