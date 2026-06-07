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
    if (loading || (!pagination.has_more && !initialLoading)) return;

    setLoading(true);
    setError(null);

    try {
      const nextPage = initialLoading ? initialPage : pagination.page + 1;
      const result = await fetchFn(nextPage, pageSize);

      setItems((prev) =>
        initialLoading ? result.items : [...prev, ...result.items],
      );
      setPagination(result.pagination);
      setInitialLoading(false);
    } catch (err) {
      setError("Gagal memuat data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [loading, pagination, initialLoading, initialPage, pageSize, fetchFn]);

  const reset = useCallback(() => {
    setItems([]);
    setPagination({
      page: initialPage,
      page_size: pageSize,
      total: 0,
      total_pages: 0,
      has_more: false,
    });
    setInitialLoading(true);
    setError(null);
  }, [initialPage, pageSize]);

  return {
    items,
    pagination,
    loading,
    error,
    initialLoading,
    loadMore,
    reset,
    hasMore: pagination.has_more,
    total: pagination.total,
  };
}
