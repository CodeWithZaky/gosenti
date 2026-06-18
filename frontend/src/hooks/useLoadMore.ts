// hooks/useLoadMore.ts
import { useCallback, useState } from "react";

interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_more: boolean;
}

interface UseLoadMoreOptions {
  initialPage?: number;
  pageSize?: number;
}

export function useLoadMore<T>(
  fetchFn: (
    page: number,
    pageSize: number,
  ) => Promise<{
    items: T[];
    pagination: PaginationInfo;
  }>,
  options: UseLoadMoreOptions = {},
) {
  const { initialPage = 1, pageSize = 20 } = options;

  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: initialPage,
    page_size: pageSize,
    total: 0,
    total_pages: 0,
    has_more: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadMore = useCallback(async () => {
    // ✅ Cegah double loading
    if (loading) {
      console.log("[useLoadMore] loadMore blocked: already loading");
      return;
    }

    // ✅ Hanya cegat kalau bukan initial loading dan tidak ada data lagi
    if (!initialLoading && !pagination.has_more) {
      console.log("[useLoadMore] loadMore blocked: no more data");
      return;
    }

    console.log(
      `[useLoadMore] Starting loadMore. initialLoading: ${initialLoading}, currentPage: ${pagination.page}`,
    );

    setLoading(true);
    setError(null);

    try {
      const nextPage = initialLoading ? initialPage : pagination.page + 1;
      console.log(
        `[useLoadMore] Fetching page ${nextPage}, pageSize: ${pageSize}`,
      );

      const result = await fetchFn(nextPage, pageSize);
      console.log(
        `[useLoadMore] Received ${result.items.length} items, pagination:`,
        result.pagination,
      );

      setItems((prev) =>
        initialLoading ? result.items : [...prev, ...result.items],
      );
      setPagination(result.pagination);
      setInitialLoading(false);
      console.log("[useLoadMore] loadMore completed successfully");
    } catch (err) {
      setError("Gagal memuat data");
      console.error("[useLoadMore] Error:", err);
      // ✅ Tetap set initialLoading false meskipun error
      setInitialLoading(false);
    } finally {
      setLoading(false);
      console.log("[useLoadMore] Loading state set to false");
    }
  }, [
    loading,
    pagination.has_more,
    pagination.page,
    initialLoading,
    initialPage,
    pageSize,
    fetchFn,
  ]);

  const reset = useCallback(() => {
    console.log(
      "[useLoadMore] Reset called - clearing all data and setting initialLoading to true",
    );
    setItems([]);
    setPagination({
      page: initialPage,
      page_size: pageSize,
      total: 0,
      total_pages: 0,
      has_more: false,
    });
    setInitialLoading(true); // ✅ Kembalikan ke initial loading state
    setError(null);
    setLoading(false); // ✅ Pastikan loading di-reset
  }, [initialPage, pageSize]);

  // ✅ Fungsi untuk force reload (bypass semua kondisi)
  const forceReload = useCallback(async () => {
    console.log("[useLoadMore] Force reload triggered");
    setLoading(true);
    setError(null);
    setInitialLoading(true);

    try {
      console.log(`[useLoadMore] Force reload fetching page ${initialPage}`);
      const result = await fetchFn(initialPage, pageSize);
      console.log(
        `[useLoadMore] Force reload received ${result.items.length} items`,
      );

      setItems(result.items);
      setPagination(result.pagination);
      setInitialLoading(false);
      console.log("[useLoadMore] Force reload completed successfully");
    } catch (err) {
      setError("Gagal memuat data");
      console.error("[useLoadMore] Force reload error:", err);
      setInitialLoading(false);
    } finally {
      setLoading(false);
    }
  }, [initialPage, pageSize, fetchFn]);

  return {
    items,
    pagination,
    loading,
    error,
    initialLoading,
    loadMore,
    reset,
    forceReload, // ✅ Export fungsi baru
    hasMore: pagination.has_more,
    total: pagination.total,
  };
}
