'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'default' | 'primary';
}

export default function Button({ children, variant = 'default', className = '', ...props }: ButtonProps) {
  const baseClass = variant === 'primary' ? 'app-button-primary' : 'app-button';
  return (
    <button className={`${baseClass} ${className}`} {...props}>
      {children}
    </button>
  );
}






