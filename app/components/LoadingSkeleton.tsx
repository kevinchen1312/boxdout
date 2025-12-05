'use client';

interface LoadingSkeletonProps {
  message?: string;
}

export default function LoadingSkeleton({ message }: LoadingSkeletonProps) {
  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      {/* Premium Loading Message */}
      {message && (
        <div className="mb-6 flex justify-center animate-fade-in">
          <div className="relative overflow-hidden">
            {/* Gradient border effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-400 rounded-2xl opacity-75 blur-sm animate-pulse"></div>
            
            <div className="relative bg-white border border-orange-200 rounded-2xl px-8 py-5 shadow-xl">
              <div className="flex items-center gap-4">
                {/* Animated Basketball with Bounce */}
                <div className="relative">
                  <div className="w-12 h-12 flex items-center justify-center animate-bounce">
                    <span className="text-3xl">🏀</span>
                  </div>
                  {/* Spinning ring */}
                  <div className="absolute inset-0 border-3 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                </div>
                
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-gray-900">{message}</span>
                  <span className="text-sm text-gray-600">Getting the latest updates...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Beautiful Game Cards Skeleton */}
      <div className="space-y-4">
        {[...Array(3)].map((_, cardIdx) => (
          <div 
            key={cardIdx}
            className="relative bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden"
            style={{ 
              animationDelay: `${cardIdx * 150}ms`,
              animation: 'fadeInUp 0.6s ease-out forwards',
              opacity: 0
            }}
          >
            {/* Shimmer overlay */}
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
            
            <div className="p-6">
              {/* Time and Network Row */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col gap-2">
                  <div className="h-5 w-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg animate-pulse"></div>
                  <div className="h-3 w-16 bg-gradient-to-r from-gray-100 to-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="h-5 w-20 bg-gradient-to-r from-blue-100 to-blue-200 rounded-lg animate-pulse"></div>
              </div>

              {/* Team Matchup */}
              <div className="flex items-center justify-between gap-8 mb-6">
                {/* Away Team */}
                <div className="flex-1 flex flex-col items-center gap-3">
                  {/* Animated logo placeholder with glow */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-300 to-orange-400 rounded-full blur-md opacity-30 animate-pulse"></div>
                    <div className="relative w-20 h-20 bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 rounded-full animate-pulse"></div>
                  </div>
                  <div className="h-5 w-32 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg animate-pulse"></div>
                </div>

                {/* VS Badge */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center animate-pulse">
                    <span className="text-lg font-bold text-orange-400">VS</span>
                  </div>
                </div>

                {/* Home Team */}
                <div className="flex-1 flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-300 to-orange-400 rounded-full blur-md opacity-30 animate-pulse"></div>
                    <div className="relative w-20 h-20 bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 rounded-full animate-pulse"></div>
                  </div>
                  <div className="h-5 w-32 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg animate-pulse"></div>
                </div>
              </div>

              {/* Prospects Row */}
              <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-100">
                <div className="flex gap-2">
                  <div className="h-7 w-24 bg-gradient-to-r from-orange-100 via-orange-200 to-orange-100 rounded-full animate-pulse"></div>
                </div>
                <div className="flex gap-2">
                  <div className="h-7 w-24 bg-gradient-to-r from-orange-100 via-orange-200 to-orange-100 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}

