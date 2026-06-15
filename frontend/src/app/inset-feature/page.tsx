"use client";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLoadMore } from "@/hooks/useLoadMore";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bug,
  Eye,
  FileText,
  Hash,
  Info,
  Loader2,
  Minus,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  ServerCrash,
  TrendingDown,
  TrendingUp,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface InsetFeatureItem {
  guid: string;
  clean_title: string;
  inset_pos: number;
  inset_neg: number;
  inset_pos_norm: number;
  inset_neg_norm: number;
}

interface InsetStats {
  max_pos: number;
  min_pos: number;
  max_neg: number;
  min_neg: number;
  avg_pos: string;
  avg_neg: string;
  total: number;
  has_both: number;
}

interface WordDetail {
  word: string;
  score: number;
  type: "single" | "phrase" | "negation_word" | "negation_phrase";
}

interface InsetWordDetails {
  guid: string;
  clean_title: string;
  positive_words: WordDetail[];
  negative_words: WordDetail[];
  total_positive: number;
  total_negative: number;
  net_score: number;
}

type SortField = "pos" | "neg";
type SortOrder = "asc" | "desc";

// Error detail interface
interface ErrorDetail {
  type: "network" | "server" | "data" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
  endpoint?: string;
  timestamp: Date;
  rawError?: string;
}

// Kategori berdasarkan nilai normalisasi
function getCategory(norm: number, raw: number) {
  if (raw === 0)
    return {
      label: "Netral",
      color: "text-gray-500",
      bg: "bg-gray-100 dark:bg-gray-800",
    };
  if (norm >= 0.8)
    return {
      label: "Sangat Tinggi",
      color: "text-emerald-600",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
    };
  if (norm >= 0.5)
    return {
      label: "Tinggi",
      color: "text-green-600",
      bg: "bg-green-100 dark:bg-green-900/30",
    };
  if (norm >= 0.2)
    return {
      label: "Sedang",
      color: "text-yellow-600",
      bg: "bg-yellow-100 dark:bg-yellow-900/30",
    };
  return {
    label: "Rendah",
    color: "text-orange-600",
    bg: "bg-orange-100 dark:bg-orange-900/30",
  };
}

export default function InsetFeaturePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InsetFeatureItem | null>(
    null,
  );
  const [sortField, setSortField] = useState<SortField>("pos");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Error states - menyimpan array error detail
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const POLL_INTERVAL = 2000;
  const MAX_POLL_ATTEMPTS = 30;
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);

  const [stats, setStats] = useState<InsetStats>({
    max_pos: 0,
    min_pos: 0,
    max_neg: 0,
    min_neg: 0,
    avg_pos: "0",
    avg_neg: "0",
    total: 0,
    has_both: 0,
  });

  const [wordDetails, setWordDetails] = useState<InsetWordDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Helper untuk menambah error
  const addError = useCallback((error: ErrorDetail) => {
    setErrors((prev) => [...prev, error]);
  }, []);

  // Helper untuk clear errors
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  // Fungsi fetch data dengan error handling yang TIDAK melempar error
  const fetchInsetFeatureData = useCallback(
    async (page: number, pageSize: number) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const endpoint = `http://localhost:8000/api/data/features?page=${page}&page_size=${pageSize}`;

      try {
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const statusCode = res.status;
          let serverMessage = "";

          try {
            const errorData = await res.json();
            serverMessage =
              errorData.message ||
              errorData.detail ||
              JSON.stringify(errorData);
          } catch {
            serverMessage = `HTTP ${statusCode} - ${res.statusText}`;
          }

          addError({
            type: statusCode >= 500 ? "server" : "data",
            message: `Server error (${statusCode})`,
            statusCode,
            endpoint,
            timestamp: new Date(),
            rawError: serverMessage,
          });

          return {
            items: [],
            pagination: {
              page: 1,
              page_size: pageSize,
              total: 0,
              total_pages: 0,
            },
          };
        }

        const result = await res.json();

        // Validasi struktur data
        if (!result || typeof result !== "object") {
          addError({
            type: "data",
            message: "Respons server tidak valid (bukan object JSON)",
            endpoint,
            timestamp: new Date(),
            rawError: typeof result,
          });
          return {
            items: [],
            pagination: {
              page: 1,
              page_size: pageSize,
              total: 0,
              total_pages: 0,
            },
          };
        }

        if (!result.items || !Array.isArray(result.items)) {
          addError({
            type: "data",
            message:
              "Format data tidak sesuai: field 'items' tidak ditemukan atau bukan array",
            endpoint,
            timestamp: new Date(),
            rawError: JSON.stringify(Object.keys(result)),
          });
          return {
            items: [],
            pagination: {
              page: 1,
              page_size: pageSize,
              total: 0,
              total_pages: 0,
            },
          };
        }

        // Update stats jika tersedia
        if (result.stats) {
          setStats(result.stats);
        }

        // Clear errors on success
        if (page === 1) {
          clearErrors();
        }
        retryCountRef.current = 0;

        return { items: result.items, pagination: result.pagination };
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        let errorDetail: ErrorDetail;

        if (err instanceof DOMException && err.name === "AbortError") {
          errorDetail = {
            type: "timeout",
            message:
              "Request timeout (15 detik) - Server tidak merespons tepat waktu",
            endpoint,
            timestamp: new Date(),
            rawError: err.message,
          };
        } else if (
          err instanceof TypeError &&
          err.message === "Failed to fetch"
        ) {
          errorDetail = {
            type: "network",
            message:
              "Gagal terhubung ke server - Server mungkin tidak berjalan atau CORS bermasalah",
            endpoint,
            timestamp: new Date(),
            rawError: `${err.message}. Pastikan server berjalan di http://localhost:8000`,
          };
        } else {
          errorDetail = {
            type: "unknown",
            message:
              err instanceof Error ? err.message : "Kesalahan tidak diketahui",
            endpoint,
            timestamp: new Date(),
            rawError: err instanceof Error ? err.stack : String(err),
          };
        }

        addError(errorDetail);

        return {
          items: [],
          pagination: {
            page: 1,
            page_size: pageSize,
            total: 0,
            total_pages: 0,
          },
        };
      }
    },
    [addError, clearErrors],
  );

  const {
    items: data,
    loading,
    initialLoading,
    hasMore,
    total,
    pagination,
    loadMore,
    reset,
  } = useLoadMore<InsetFeatureItem>(fetchInsetFeatureData);

  // Polling untuk mengecek status InSet Feature
  const pollInsetStatus = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch("http://localhost:8000/api/pipeline/status", {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const result = await res.json();
        if (
          result.status === "completed" ||
          result.inset_feature_done === true
        ) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    const init = async () => {
      try {
        await loadMore();
      } catch {
        // Error sudah di-handle
      }
    };

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runInsetFeature = async () => {
    setIsRunning(true);
    const endpoint = "http://localhost:8000/api/pipeline/inset_feature";

    const toastId = toast.loading("Menjalankan InSet Feature...", {
      description: "Proses ini mungkin memakan waktu beberapa saat",
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const statusCode = res.status;
        let serverMessage = "";

        try {
          const errorData = await res.json();
          serverMessage =
            errorData.message || errorData.detail || JSON.stringify(errorData);
        } catch {
          serverMessage = `HTTP ${statusCode} - ${res.statusText}`;
        }

        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `Pipeline gagal (${statusCode})`,
          statusCode,
          endpoint,
          timestamp: new Date(),
          rawError: serverMessage,
        });

        if (statusCode === 404) {
          toast.error("Endpoint InSet Feature tidak ditemukan", {
            id: toastId,
            description: "Pastikan API pipeline tersedia",
          });
        } else if (statusCode === 409) {
          toast.warning("InSet Feature sudah berjalan", {
            id: toastId,
            description: "Tunggu proses sebelumnya selesai",
          });
        } else if (statusCode === 422) {
          toast.error("Data SentiStrength belum tersedia", {
            id: toastId,
            description:
              serverMessage || "Jalankan SentiStrength terlebih dahulu",
          });
        } else {
          toast.error("InSet Feature gagal!", {
            id: toastId,
            description: serverMessage,
          });
        }
        setIsRunning(false);
        return;
      }

      const result = await res.json();

      if (result.status === "success") {
        toast.success("InSet Feature berhasil!", {
          id: toastId,
          description: result.message || "Data telah diproses",
        });

        clearErrors();
        reset();
        pollAttemptRef.current = 0;

        const pollForData = async () => {
          if (!mountedRef.current) return;

          pollAttemptRef.current++;

          if (pollAttemptRef.current > MAX_POLL_ATTEMPTS) {
            toast.info("Masih memproses data...", {
              description: "Data mungkin belum sepenuhnya tersedia",
            });
            try {
              await loadMore();
            } catch {
              // Silent
            }
            setIsRunning(false);
            return;
          }

          const isReady = await pollInsetStatus();

          if (isReady) {
            try {
              await loadMore();
              setIsRunning(false);
            } catch {
              if (mountedRef.current) {
                toast.error("Gagal memuat data setelah InSet Feature", {
                  description: "Silakan muat ulang halaman",
                });
              }
              setIsRunning(false);
            }
          } else {
            pollTimeoutRef.current = setTimeout(pollForData, POLL_INTERVAL);
          }
        };

        pollTimeoutRef.current = setTimeout(pollForData, 1500);
      } else if (result.status === "running") {
        toast.info("InSet Feature sedang berjalan", {
          id: toastId,
          description: "Proses sedang berlangsung di background",
        });

        pollAttemptRef.current = 0;
        const pollRunning = async () => {
          if (!mountedRef.current) return;

          pollAttemptRef.current++;

          if (pollAttemptRef.current > MAX_POLL_ATTEMPTS) {
            toast.warning("InSet Feature mungkin masih berjalan", {
              description: "Refresh halaman untuk melihat status terbaru",
            });
            setIsRunning(false);
            return;
          }

          const isReady = await pollInsetStatus();

          if (isReady) {
            toast.success("InSet Feature selesai!", {
              description: "Memuat data terbaru...",
            });
            clearErrors();
            reset();
            try {
              await loadMore();
            } catch {
              // Silent
            }
            setIsRunning(false);
          } else {
            pollTimeoutRef.current = setTimeout(pollRunning, POLL_INTERVAL);
          }
        };

        pollTimeoutRef.current = setTimeout(pollRunning, POLL_INTERVAL);
      } else {
        addError({
          type: "unknown",
          message: `Status respons tidak dikenal: ${result.status}`,
          endpoint,
          timestamp: new Date(),
          rawError: JSON.stringify(result),
        });
        toast.error("InSet Feature gagal!", {
          id: toastId,
          description: result.message || "Status respons tidak dikenal",
        });
        setIsRunning(false);
      }
    } catch (err: unknown) {
      let errorDetail: ErrorDetail;

      if (err instanceof DOMException && err.name === "AbortError") {
        errorDetail = {
          type: "timeout",
          message: "Pipeline timeout (5 menit) - Proses terlalu lama",
          endpoint,
          timestamp: new Date(),
          rawError: err.message,
        };
        toast.warning("InSet Feature timeout", {
          id: toastId,
          description:
            "Proses terlalu lama. Mungkin masih berjalan di background.",
        });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        errorDetail = {
          type: "network",
          message: "Gagal terhubung ke server saat menjalankan pipeline",
          endpoint,
          timestamp: new Date(),
          rawError: err.message,
        };
        toast.error("Gagal terhubung ke server", {
          id: toastId,
          description: "Pastikan server backend berjalan",
        });
      } else {
        errorDetail = {
          type: "unknown",
          message:
            err instanceof Error ? err.message : "Kesalahan tidak diketahui",
          endpoint,
          timestamp: new Date(),
          rawError: err instanceof Error ? err.stack : String(err),
        };
        toast.error("Gagal menjalankan InSet Feature", {
          id: toastId,
          description: errorDetail.message,
        });
      }

      addError(errorDetail);
      setIsRunning(false);
    }
  };

  const handleRetry = async () => {
    if (retryCountRef.current >= MAX_RETRIES) {
      toast.error("Batas percobaan tercapai", {
        description: `Gagal setelah ${MAX_RETRIES}x percobaan.`,
      });
      return;
    }

    setIsRetrying(true);
    retryCountRef.current++;
    clearErrors();

    try {
      reset();
      await loadMore();
    } catch {
      // Error sudah di-handle
    } finally {
      if (mountedRef.current) {
        setIsRetrying(false);
      }
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleOpenDetail = async (item: InsetFeatureItem) => {
    setSelectedItem(item);
    setWordDetails(null);
    setLoadingDetails(true);

    const endpoint = `http://localhost:8000/api/data/features/${item.guid}/words`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(endpoint, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const result = await res.json();
        if (result.status === "success") {
          setWordDetails(result.data);
        } else {
          toast.error("Format data detail kata tidak valid");
          addError({
            type: "data",
            message: "Format data detail kata tidak valid",
            endpoint,
            timestamp: new Date(),
            rawError: JSON.stringify(result),
          });
        }
      } else {
        if (res.status === 404) {
          toast.info("Detail kata tidak tersedia untuk item ini");
        } else {
          toast.error(`Gagal mengambil detail kata (HTTP ${res.status})`);
          addError({
            type: "server",
            message: `Gagal mengambil detail kata (HTTP ${res.status})`,
            statusCode: res.status,
            endpoint,
            timestamp: new Date(),
          });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Timeout mengambil detail kata");
        addError({
          type: "timeout",
          message: "Timeout mengambil detail kata (10 detik)",
          endpoint,
          timestamp: new Date(),
        });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        toast.error("Gagal terhubung ke server");
        addError({
          type: "network",
          message: "Gagal terhubung ke server saat mengambil detail kata",
          endpoint,
          timestamp: new Date(),
          rawError: err.message,
        });
      }
    } finally {
      if (mountedRef.current) {
        setLoadingDetails(false);
      }
    }
  };

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      let valA = sortField === "pos" ? a.inset_pos : a.inset_neg;
      let valB = sortField === "pos" ? b.inset_pos : b.inset_neg;
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortOrder]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="opacity-40 ml-1 w-3.5 h-3.5" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 w-3.5 h-3.5" />
    ) : (
      <ArrowDown className="ml-1 w-3.5 h-3.5" />
    );
  };

  // Komponen Error Display
  const ErrorDisplay = () => {
    if (errors.length === 0) return null;

    const latestError = errors[errors.length - 1];
    const hasNetworkError = errors.some((e) => e.type === "network");
    const hasServerError = errors.some((e) => e.type === "server");
    const hasTimeout = errors.some((e) => e.type === "timeout");

    const getErrorIcon = () => {
      if (hasNetworkError) return <WifiOff className="w-5 h-5" />;
      if (hasTimeout) return <AlertTriangle className="w-5 h-5" />;
      if (hasServerError) return <ServerCrash className="w-5 h-5" />;
      return <Bug className="w-5 h-5" />;
    };

    const getErrorColor = () => {
      if (hasNetworkError)
        return "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/30";
      if (hasTimeout)
        return "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30";
      if (hasServerError)
        return "border-orange-400 dark:border-orange-600 bg-orange-50 dark:bg-orange-950/30";
      return "border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-950/30";
    };

    return (
      <Card className={`border-2 ${getErrorColor()} shadow-lg`}>
        <CardContent className="space-y-3 p-4">
          {/* Header Error */}
          <div className="flex justify-between items-start gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-gray-800 p-1.5 rounded-full">
                {getErrorIcon()}
              </div>
              <div>
                <h3 className="font-semibold text-sm">
                  {hasNetworkError && "Koneksi Gagal"}
                  {hasTimeout && !hasNetworkError && "Request Timeout"}
                  {hasServerError &&
                    !hasNetworkError &&
                    !hasTimeout &&
                    "Server Error"}
                  {!hasNetworkError &&
                    !hasTimeout &&
                    !hasServerError &&
                    "Error"}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {errors.length} error terjadi • Terakhir:{" "}
                  {latestError.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowErrorDetails(!showErrorDetails)}
                className="h-7 text-xs"
              >
                {showErrorDetails ? "Sembunyikan" : "Detail"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearErrors}
                className="h-7 text-xs"
              >
                <XCircle className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Pesan Error Utama */}
          <div className="bg-white dark:bg-gray-900 p-3 border rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium text-sm">{latestError.message}</p>
                {latestError.endpoint && (
                  <p className="mt-1 font-mono text-muted-foreground text-xs">
                    Endpoint: {latestError.endpoint}
                  </p>
                )}
                {latestError.statusCode && (
                  <p className="text-muted-foreground text-xs">
                    Status: {latestError.statusCode}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Detail Error (Collapsible) */}
          {showErrorDetails && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <p className="font-medium text-muted-foreground text-xs">
                Semua Error ({errors.length}):
              </p>
              {errors.map((err, i) => (
                <div
                  key={i}
                  className="space-y-1 bg-white dark:bg-gray-900 p-2.5 border rounded-lg text-xs"
                >
                  <div className="flex justify-between items-center">
                    <Badge
                      variant="outline"
                      className={
                        err.type === "network"
                          ? "border-red-300 text-red-600"
                          : err.type === "timeout"
                            ? "border-amber-300 text-amber-600"
                            : err.type === "server"
                              ? "border-orange-300 text-orange-600"
                              : "border-yellow-300 text-yellow-600"
                      }
                    >
                      {err.type.toUpperCase()}
                    </Badge>
                    <span className="text-muted-foreground">
                      {err.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="font-medium">{err.message}</p>
                  {err.endpoint && (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {err.endpoint}
                    </p>
                  )}
                  {err.rawError && (
                    <div className="bg-muted/50 p-2 rounded font-mono text-[10px] break-all whitespace-pre-wrap">
                      {err.rawError}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="flex justify-between items-center pt-1">
            <p className="text-muted-foreground text-xs">
              Retry: {retryCountRef.current}/{MAX_RETRIES}
            </p>
            <Button
              onClick={handleRetry}
              disabled={isRetrying || retryCountRef.current >= MAX_RETRIES}
              size="sm"
              variant="default"
              className="gap-1"
            >
              {isRetrying ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {retryCountRef.current >= MAX_RETRIES
                ? "Batas Tercapai"
                : "Coba Lagi"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================================
  // RENDER: LOADING STATE
  // ============================================================
  if (initialLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">InSet Feature</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Ekstraksi fitur leksikon InSet untuk sentimen positif dan negatif
          </p>
        </div>
        <Button
          onClick={runInsetFeature}
          disabled={isRunning}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <Play className="mr-2 w-4 h-4" />
              Jalankan InSet Feature
            </>
          )}
        </Button>
      </div>

      {/* ERROR DISPLAY - Ditampilkan di konten */}
      <ErrorDisplay />

      {/* Stats Cards */}
      <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Total Data
                </p>
                <p className="font-bold tabular-nums text-foreground text-xl">
                  {(stats.total ?? 0).toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">dokumen</p>
              </div>
              <div className="bg-amber-500/10 ml-2 p-2 rounded-lg shrink-0">
                <FileText className="w-4 h-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Max Positif
                </p>
                <p className="font-bold tabular-nums text-emerald-600 text-xl">
                  +{stats.max_pos ?? 0}
                </p>
                <p className="text-muted-foreground text-xs">skor tertinggi</p>
              </div>
              <div className="bg-emerald-500/10 ml-2 p-2 rounded-lg shrink-0">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Min Negatif
                </p>
                <p className="font-bold tabular-nums text-red-600 text-xl">
                  {stats.min_neg ?? 0}
                </p>
                <p className="text-muted-foreground text-xs">skor terendah</p>
              </div>
              <div className="bg-red-500/10 ml-2 p-2 rounded-lg shrink-0">
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Campuran
                </p>
                <p className="font-bold tabular-nums text-violet-600 text-xl">
                  {(stats.has_both ?? 0).toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">
                  {stats.total > 0
                    ? `(${((stats.has_both / stats.total) * 100).toFixed(1)}%)`
                    : "positif + negatif"}
                </p>
              </div>
              <div className="bg-violet-500/10 ml-2 p-2 rounded-lg shrink-0">
                <Hash className="w-4 h-4 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Avg Score
                </p>
                <p className="font-bold text-foreground text-lg">
                  <span className="text-emerald-600">
                    +{stats.avg_pos ?? "0"}
                  </span>
                  <span className="mx-0.5 text-muted-foreground">/</span>
                  <span className="text-red-600">{stats.avg_neg ?? "0"}</span>
                </p>
                <p className="text-muted-foreground text-xs">rata-rata</p>
              </div>
              <div className="bg-sky-500/10 ml-2 p-2 rounded-lg shrink-0">
                <Hash className="w-4 h-4 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table atau Empty State */}
      {sortedData.length === 0 && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-amber-100 dark:bg-amber-900/20 p-4 rounded-full">
              <Puzzle className="w-12 h-12 text-amber-400" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="font-semibold text-lg">Belum Ada Data</h3>
              <p className="max-w-md text-muted-foreground">
                Belum ada data fitur InSet yang tersedia. Klik tombol di bawah
                untuk memulai proses ekstraksi fitur.
              </p>
            </div>
            <Button
              onClick={runInsetFeature}
              disabled={isRunning}
              className="gap-2 bg-amber-600 hover:bg-amber-700"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Jalankan InSet Feature
                </>
              )}
            </Button>
            <p className="text-muted-foreground text-xs">
              Pastikan data SentiStrength sudah tersedia sebelum menjalankan
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-muted/50">
                    <TableHead className="w-[60px] font-bold text-center">
                      No
                    </TableHead>
                    <TableHead className="font-bold">Teks Bersih</TableHead>
                    <TableHead
                      className="w-[240px] font-bold cursor-pointer select-none"
                      onClick={() => handleSort("pos")}
                    >
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        Skor Positif <SortIcon field="pos" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="w-[240px] font-bold cursor-pointer select-none"
                      onClick={() => handleSort("neg")}
                    >
                      <span className="flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                        Skor Negatif <SortIcon field="neg" />
                      </span>
                    </TableHead>
                    <TableHead className="w-[60px] font-bold text-center">
                      Detail
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((item, index) => {
                    const posCat = getCategory(
                      item.inset_pos_norm,
                      item.inset_pos,
                    );
                    const negCat = getCategory(
                      item.inset_neg !== 0
                        ? Math.abs(item.inset_neg) /
                            Math.abs(stats.min_neg || 1)
                        : 0,
                      item.inset_neg,
                    );

                    return (
                      <TableRow
                        key={`${item.guid}-${index}`}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="font-medium text-muted-foreground text-center">
                          {(pagination.page - 1) * pagination.page_size +
                            index +
                            1}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[400px] text-foreground text-sm line-clamp-2">
                            {item.clean_title}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-bold text-emerald-600 text-lg">
                                +{item.inset_pos}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${posCat.color} ${posCat.bg} border-0`}
                              >
                                {posCat.label}
                              </Badge>
                            </div>
                            <Progress
                              value={
                                item.inset_pos_norm
                                  ? item.inset_pos_norm * 100
                                  : 0
                              }
                              className="h-1.5"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              Norm: {(item.inset_pos_norm ?? 0).toFixed(3)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-bold text-red-600 text-lg">
                                {item.inset_neg}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${negCat.color} ${negCat.bg} border-0`}
                              >
                                {negCat.label}
                              </Badge>
                            </div>
                            <Progress
                              value={
                                item.inset_neg !== 0 && stats.min_neg !== 0
                                  ? (Math.abs(item.inset_neg) /
                                      Math.abs(stats.min_neg)) *
                                    100
                                  : 0
                              }
                              className="[&>div]:bg-red-500 h-1.5"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              Norm: {(item.inset_neg_norm ?? 0).toFixed(3)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetail(item)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {sortedData.length > 0 && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loading}
          hasMore={hasMore}
          currentCount={sortedData.length}
          totalCount={total}
        />
      )}

      {/* Dialog Detail */}
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
            setWordDetails(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detail InSet Feature
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 mt-4">
              <div className="bg-muted/50 p-4 border rounded-lg">
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Teks Bersih
                </p>
                <p className="text-foreground text-sm">
                  {selectedItem.clean_title}
                </p>
              </div>

              <div className="gap-4 grid grid-cols-2">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 border border-emerald-100 dark:border-emerald-800 rounded-lg">
                  <TrendingUp className="mb-2 w-5 h-5 text-emerald-600" />
                  <p className="font-bold text-emerald-600 text-3xl">
                    +{selectedItem.inset_pos}
                  </p>
                  <p className="mt-1 text-emerald-700 dark:text-emerald-400 text-sm">
                    Skor Positif
                  </p>
                  <Progress
                    value={(selectedItem.inset_pos_norm ?? 0) * 100}
                    className="mt-3 h-2"
                  />
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 p-4 border border-red-100 dark:border-red-800 rounded-lg">
                  <TrendingDown className="mb-2 w-5 h-5 text-red-600" />
                  <p className="font-bold text-red-600 text-3xl">
                    {selectedItem.inset_neg}
                  </p>
                  <p className="mt-1 text-red-700 dark:text-red-400 text-sm">
                    Skor Negatif
                  </p>
                  <Progress
                    value={
                      selectedItem.inset_neg !== 0
                        ? (Math.abs(selectedItem.inset_neg) /
                            Math.abs(stats.min_neg || 1)) *
                          100
                        : 0
                    }
                    className="[&>div]:bg-red-500 mt-3 h-2"
                  />
                </div>
              </div>

              <div className="bg-muted/50 p-4 border rounded-lg text-center">
                <p className="mb-1 text-muted-foreground text-xs">
                  Net Score (Positif + Negatif)
                </p>
                <p
                  className={`font-bold text-2xl ${
                    selectedItem.inset_pos + selectedItem.inset_neg > 0
                      ? "text-emerald-600"
                      : selectedItem.inset_pos + selectedItem.inset_neg < 0
                        ? "text-red-600"
                        : "text-foreground"
                  }`}
                >
                  {selectedItem.inset_pos + selectedItem.inset_neg > 0
                    ? "+"
                    : ""}
                  {selectedItem.inset_pos + selectedItem.inset_neg}
                </p>
              </div>

              {loadingDetails ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                  <span className="ml-2 text-muted-foreground">
                    Memuat detail kata...
                  </span>
                </div>
              ) : wordDetails ? (
                <div className="space-y-4">
                  {wordDetails.positive_words.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 border-emerald-100 dark:border-emerald-800 border-b">
                        <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400 text-sm">
                          <Plus className="w-4 h-4" />
                          Kata/Frasa Positif (
                          {wordDetails.positive_words.length})
                        </p>
                      </div>
                      <div className="divide-y">
                        {wordDetails.positive_words.map((w, i) => (
                          <div
                            key={i}
                            className="flex justify-between items-center hover:bg-muted/30 px-4 py-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {w.word}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {w.type === "phrase"
                                  ? "Frasa"
                                  : w.type === "negation_word"
                                    ? "Negasi"
                                    : w.type === "negation_phrase"
                                      ? "Negasi Frasa"
                                      : "Kata"}
                              </Badge>
                            </div>
                            <span className="font-bold text-emerald-600">
                              +{w.score}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {wordDetails.negative_words.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-red-50 dark:bg-red-950/30 px-4 py-2 border-red-100 dark:border-red-800 border-b">
                        <p className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400 text-sm">
                          <Minus className="w-4 h-4" />
                          Kata/Frasa Negatif (
                          {wordDetails.negative_words.length})
                        </p>
                      </div>
                      <div className="divide-y">
                        {wordDetails.negative_words.map((w, i) => (
                          <div
                            key={i}
                            className="flex justify-between items-center hover:bg-muted/30 px-4 py-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {w.word}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {w.type === "phrase"
                                  ? "Frasa"
                                  : w.type === "negation_word"
                                    ? "Negasi"
                                    : w.type === "negation_phrase"
                                      ? "Negasi Frasa"
                                      : "Kata"}
                              </Badge>
                            </div>
                            <span className="font-bold text-red-600">
                              {w.score}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {wordDetails.positive_words.length === 0 &&
                    wordDetails.negative_words.length === 0 && (
                      <div className="py-6 text-muted-foreground text-center">
                        Tidak ada kata yang cocok dengan leksikon InSet
                      </div>
                    )}
                </div>
              ) : (
                <div className="py-6 text-muted-foreground text-sm text-center">
                  Gagal memuat detail kata.{" "}
                  <button
                    onClick={() =>
                      selectedItem && handleOpenDetail(selectedItem)
                    }
                    className="text-amber-600 hover:underline"
                  >
                    Coba lagi
                  </button>
                </div>
              )}

              <div className="text-center">
                <Badge variant="secondary" className="text-xs">
                  GUID: {selectedItem.guid}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="w-64 h-8" />
        <Skeleton className="w-48 h-4" />
      </div>
      <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="w-full h-18" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="space-y-3 p-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-8 h-4" />
                <Skeleton className="flex-1 h-10" />
                <Skeleton className="w-[240px] h-10" />
                <Skeleton className="w-[240px] h-10" />
                <Skeleton className="w-8 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
