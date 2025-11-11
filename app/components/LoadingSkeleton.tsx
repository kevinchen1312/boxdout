'use client';

export default function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
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

