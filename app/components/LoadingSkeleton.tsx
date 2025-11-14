'use client';

interface LoadingSkeletonProps {
  message?: string;
}

export default function LoadingSkeleton({ message }: LoadingSkeletonProps) {
  return (
    <div className="animate-pulse">
      {message && (
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium">{message}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded"></div>
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-7 gap-2">
            {[...Array(7)].map((_, colIdx) => (
              <div
                key={colIdx}
                className="h-[120px] bg-gray-100 rounded-lg"
              ></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

