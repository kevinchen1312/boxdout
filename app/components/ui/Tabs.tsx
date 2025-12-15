'use client';

import { ReactNode } from 'react';

interface TabsProps {
  children: ReactNode;
  className?: string;
}

export function Tabs({ children, className = '' }: TabsProps) {
  return (
    <div className={`tabs ${className}`}>
      {children}
    </div>
  );
}

interface TabProps {
  children: ReactNode;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

export function Tab({ children, isActive, onClick, className = '' }: TabProps) {
  return (
    <button
      className={`tab ${isActive ? 'is-active' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}






