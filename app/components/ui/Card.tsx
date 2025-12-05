'use client';

import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  noInner?: boolean; // Skip card-inner wrapper
}

export default function Card({ children, className = '', innerClassName = '', noInner = false }: CardProps) {
  if (noInner) {
    return (
      <div className={`card ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <div className={`card ${className}`}>
      <div className={`card-inner ${innerClassName}`}>
        {children}
      </div>
    </div>
  );
}

