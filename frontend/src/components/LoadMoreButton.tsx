// components/LoadMoreButton.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";

interface LoadMoreButtonProps {
  onClick: () => void;
  loading: boolean;
  hasMore: boolean;
  currentCount: number;
  totalCount: number;
}

export function LoadMoreButton({
  onClick,
  loading,
  hasMore,
  currentCount,
  totalCount,
}: LoadMoreButtonProps) {
  const progressPercentage =
    totalCount > 0 ? (currentCount / totalCount) * 100 : 0;

  if (!hasMore && currentCount > 0) {
    return (
      <div className="py-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">Semua data telah dimuat</span>
          </div>
          <p className="text-gray-400 text-sm">
            {totalCount.toLocaleString()} total data ditampilkan
          </p>
          <div className="w-full max-w-md">
            <Progress value={100} className="bg-green-100 h-2" />
          </div>
        </div>
      </div>
    );
  }

  if (currentCount === 0 && !hasMore) {
    return null;
  }

  return (
    <div className="py-6">
      <div className="flex flex-col items-center gap-4">
        {/* Progress Info */}
        <div className="space-y-2 w-full max-w-md">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">
              {currentCount.toLocaleString()} dari {totalCount.toLocaleString()}{" "}
              data
            </span>
            <span className="text-gray-400">
              {progressPercentage.toFixed(0)}%
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Load More Button */}
        <Button
          variant="outline"
          onClick={onClick}
          disabled={loading}
          className="hover:bg-indigo-50 border-2 hover:border-indigo-300 min-w-[200px] h-11 transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              Memuat Data...
            </>
          ) : (
            <>
              <ChevronDown className="mr-2 w-4 h-4" />
              Muat Lebih Banyak
            </>
          )}
        </Button>

        <p className="text-gray-400 text-xs">
          Menampilkan {currentCount.toLocaleString()} dari{" "}
          {totalCount.toLocaleString()} data
        </p>
      </div>
    </div>
  );
}
