'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';

type BackToCalendarButtonProps = {
  onClick?: () => void;
};

export function BackToCalendarButton({ onClick }: BackToCalendarButtonProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  // Prefetch the home page on mount for faster navigation
  useEffect(() => {
    router.prefetch('/');
  }, [router]);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    } else {
      setIsNavigating(true);
      // Navigation happens via Link href
    }
  };

  return (
    <Link 
      href="/"
      className="back-to-calendar-button"
      onClick={handleClick}
      style={{ 
        opacity: isNavigating ? 0.6 : 1,
        pointerEvents: isNavigating ? 'none' : 'auto',
      }}
    >
      <span className="back-to-calendar-icon" aria-hidden="true">
        {isNavigating ? '...' : '←'}
      </span>
      <span>{isNavigating ? 'Loading...' : 'Back to Calendar'}</span>
    </Link>
  );
}
