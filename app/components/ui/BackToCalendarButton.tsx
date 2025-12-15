'use client';

import { useRouter } from 'next/navigation';

type BackToCalendarButtonProps = {
  onClick?: () => void;
};

export function BackToCalendarButton({ onClick }: BackToCalendarButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      router.push('/');
    }
  };

  return (
    <button className="back-to-calendar-button" onClick={handleClick}>
      <span className="back-to-calendar-icon" aria-hidden="true">
        ←
      </span>
      <span>Back to Calendar</span>
    </button>
  );
}






