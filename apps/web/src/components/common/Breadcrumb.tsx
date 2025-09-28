"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDownIcon } from '@/icons';

interface BreadcrumbItem {
  label: string;
  path?: string;
  icon?: React.ReactNode;
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  showHome?: boolean;
  className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ 
  items, 
  showHome = true,
  className = ""
}) => {
  const pathname = usePathname();
  
  // Generate breadcrumbs from pathname if no items provided
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    if (items) return items;
    
    const pathSegments = pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];
    
    // Add home if requested
    if (showHome) {
      breadcrumbs.push({ label: 'Dashboard', path: '/dashboard' });
    }
    
    // Generate breadcrumbs from path segments
    pathSegments.forEach((segment, index) => {
      const path = `/${pathSegments.slice(0, index + 1).join('/')}`;
      const label = segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      breadcrumbs.push({ 
        label, 
        path: index === pathSegments.length - 1 ? undefined : path 
      });
    });
    
    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  if (breadcrumbs.length <= 1) return null;

  return (
    <nav 
      className={`flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 ${className}`}
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center space-x-1">
        {breadcrumbs.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center">
            {index > 0 && (
              <ChevronDownIcon 
                className="h-4 w-4 rotate-[-90deg] text-gray-400 dark:text-gray-600 mx-1" 
                aria-hidden="true"
              />
            )}
            
            {item.path ? (
              <Link
                href={item.path}
                className="
                  flex items-center gap-1.5 
                  hover:text-gray-900 dark:hover:text-gray-100 
                  transition-colors duration-200
                  focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:rounded
                "
                aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
              >
                {item.icon && (
                  <span className="h-4 w-4" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span 
                className="
                  flex items-center gap-1.5 
                  text-gray-900 dark:text-gray-100 font-medium
                "
                aria-current="page"
              >
                {item.icon && (
                  <span className="h-4 w-4" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span>{item.label}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
