'use client';

interface LoadingSkeletonProps {
  message?: string;
}

export default function LoadingSkeleton({ message }: LoadingSkeletonProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center py-16">
      {/* Animated dots loader */}
      <div className="flex items-center gap-1.5 mb-4">
        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
      
      {message && (
        <p className="text-sm text-gray-400 font-medium">{message}</p>
      )}
    </div>
  );
}

