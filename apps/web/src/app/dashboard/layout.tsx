'use client';

import AppSidebar from '@/layout/AppSidebar';
import AppHeader from '@/layout/AppHeader';
import { useSidebar } from '@/context/SidebarContext';
import Backdrop from '@/layout/Backdrop';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded } = useSidebar();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <AppSidebar />
      
      {/* Mobile Backdrop */}
      <Backdrop />
      
      {/* Main Content Area - Adapts to sidebar state */}
      <div 
        className={`
          flex flex-1 flex-col overflow-y-auto overflow-x-hidden 
          transition-all duration-300 ease-in-out
          ${isExpanded ? 'lg:ml-0' : 'lg:ml-0'}
        `}
      >
        {/* Header - Scoped to content area */}
        <AppHeader />
        
        {/* Main Scrollable Content */}
        <main 
          className="
            flex-1 
            overflow-y-auto 
            overflow-x-hidden
            scroll-smooth
            p-3 sm:p-4 md:p-6 2xl:p-10
            min-h-0
          "
          role="main"
          aria-label="Main content"
        >
          <div className="mx-auto max-w-screen-2xl min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

