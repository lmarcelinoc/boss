'use client';

import AppSidebar from '@/layout/AppSidebar';
import AppHeader from '@/layout/AppHeader';
import Backdrop from '@/layout/Backdrop';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <AppSidebar />
      
      {/* Backdrop for mobile */}
      <Backdrop />
      
      {/* Main Content Area */}
      <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <AppHeader />
        
        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 2xl:p-10">
          <div className="mx-auto max-w-screen-2xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}