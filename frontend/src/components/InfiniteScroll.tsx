// components/InfiniteScroll.tsx
"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

interface InfiniteScrollProps {
  onLoadMore: () => void;
  loading: boolean;
  hasMore: boolean;
  children: React.ReactNode;
}

export function InfiniteScroll({
  onLoadMore,
  loading,
  hasMore,
  children,
}: InfiniteScrollProps) {
  const observerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    const currentRef = observerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [onLoadMore, hasMore, loading]);

  return (
    <>
      {children}

      <div ref={observerRef} className="py-8">
        {loading && (
          <div className="flex justify-center items-center gap-2">
            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
            <span className="text-gray-500">Memuat data...</span>
          </div>
        )}

        {!hasMore && !loading && (
          <div className="text-gray-400 text-sm text-center">
            Semua data telah dimuat
          </div>
        )}
      </div>
    </>
  );
}
