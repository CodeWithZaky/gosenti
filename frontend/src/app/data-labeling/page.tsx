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
  Bug,
  Eye,
  FileText,
  Info,
  Loader2,
  Minus,
  Play,
  RefreshCw,
  Scale,
  ServerCrash,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface WordDetail {
  word: string;
  score: number;
  type: string;
}

interface WordDetailData {
  guid: string;
  clean_title: string;
  positive_words: WordDetail[];
  negative_words: WordDetail[];
}

interface SentiStrengthItem {
  guid: string;
  clean_title: string;
  label: string;
  pos: number;
  neg: number;
  word_summary?: {
    positive_count: number;
    negative_count: number;
    has_details: boolean;
  };
}

interface SentiStrengthStats {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  avg_positive: number;
  avg_negative: number;
}

interface ErrorDetail {
  type: "network" | "server" | "data" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
  endpoint?: string;
  timestamp: Date;
  rawError?: string;
}

export default function SentiStrengthPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SentiStrengthItem | null>(
    null,
  );
  const [wordData, setWordData] = useState<WordDetailData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Error states
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [hasBlockingError, setHasBlockingError] = useState(false);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const POLL_INTERVAL = 2000;
  const MAX_POLL_ATTEMPTS = 30;
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);

  const [stats, setStats] = useState<SentiStrengthStats>({
    total: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    avg_positive: 0,
    avg_negative: 0,
  });

  const addError = useCallback((error: ErrorDetail) => {
    setErrors((prev) => [...prev, error]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
    setHasBlockingError(false);
    setStatsError(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const fetchSentiStrengthData = useCallback(
    async (page: number, pageSize: number) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const endpoint = `http://localhost:8000/api/data/sentistrength?page=${page}&page_size=${pageSize}`;

      try {
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
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
            serverMessage = `HTTP ${statusCode}`;
          }
          addError({
            type: statusCode >= 500 ? "server" : "data",
            message: `Server error (${statusCode})`,
            statusCode,
            endpoint,
            timestamp: new Date(),
            rawError: serverMessage,
          });
          setHasBlockingError(true);
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
        if (!result || typeof result !== "object") {
          addError({
            type: "data",
            message: "Respons server tidak valid",
            endpoint,
            timestamp: new Date(),
            rawError: typeof result,
          });
          setHasBlockingError(true);
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
            message: "Format data tidak sesuai: field 'items' tidak ditemukan",
            endpoint,
            timestamp: new Date(),
            rawError: JSON.stringify(Object.keys(result)),
          });
          setHasBlockingError(true);
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

        // Clear errors on success (first page only)
        if (page === 1) {
          clearErrors();
        }
        retryCountRef.current = 0;
        return { items: result.items, pagination: result.pagination };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          addError({
            type: "timeout",
            message:
              "Request timeout (15 detik) - Server tidak merespons tepat waktu",
            endpoint,
            timestamp: new Date(),
            rawError: err.message,
          });
        } else if (
          err instanceof TypeError &&
          err.message === "Failed to fetch"
        ) {
          addError({
            type: "network",
            message:
              "Gagal terhubung ke server - Server mungkin tidak berjalan atau CORS bermasalah",
            endpoint,
            timestamp: new Date(),
            rawError: `${err.message}. Pastikan server berjalan di http://localhost:8000`,
          });
        } else {
          addError({
            type: "unknown",
            message:
              err instanceof Error ? err.message : "Kesalahan tidak diketahui",
            endpoint,
            timestamp: new Date(),
            rawError: err instanceof Error ? err.stack : String(err),
          });
        }
        setHasBlockingError(true);
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
  } = useLoadMore<SentiStrengthItem>(fetchSentiStrengthData);

  const fetchStats = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const endpoint = "http://localhost:8000/api/data/sentistrength/stats";

    try {
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        setStatsError(true);
        return;
      }
      const result = await res.json();
      if (result.status === "success" && result.data) {
        setStats(result.data);
        setStatsError(false);
      } else {
        setStatsError(true);
      }
    } catch {
      clearTimeout(timeoutId);
      setStatsError(true);
    }
  }, []);

  const pollSentiStrengthStatus = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("http://localhost:8000/api/pipeline/status", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const result = await res.json();
        if (result.status === "completed" || result.sentistrength_done === true)
          return true;
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
      } catch {}
      if (mountedRef.current) fetchStats();
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSentistrength = async () => {
    setIsRunning(true);
    clearErrors();
    const endpoint = "http://localhost:8000/api/pipeline/sentistrength";
    const toastId = toast.loading("Menjalankan SentiStrength...", {
      description: "Proses ini mungkin memakan waktu beberapa saat",
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
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
          serverMessage = `HTTP ${statusCode}`;
        }
        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `Pipeline gagal (${statusCode})`,
          statusCode,
          endpoint,
          timestamp: new Date(),
          rawError: serverMessage,
        });
        if (statusCode === 404)
          toast.error("Endpoint tidak ditemukan", { id: toastId });
        else if (statusCode === 409)
          toast.warning("SentiStrength sudah berjalan", { id: toastId });
        else if (statusCode === 422)
          toast.error("Data preprocessing belum tersedia", {
            id: toastId,
            description: serverMessage,
          });
        else
          toast.error("SentiStrength gagal!", {
            id: toastId,
            description: serverMessage,
          });
        setIsRunning(false);
        return;
      }

      const result = await res.json();
      if (result.status === "success") {
        toast.success("SentiStrength berhasil!", {
          id: toastId,
          description: result.message || "Data telah dilabeli",
        });
        reset();
        pollAttemptRef.current = 0;
        setStatsError(false);
        const pollForData = async () => {
          if (!mountedRef.current) return;
          pollAttemptRef.current++;
          if (pollAttemptRef.current > MAX_POLL_ATTEMPTS) {
            toast.info("Masih memproses data...", {
              description: "Data mungkin belum sepenuhnya tersedia",
            });
            try {
              await loadMore();
              fetchStats();
            } catch {}
            setIsRunning(false);
            return;
          }
          const isReady = await pollSentiStrengthStatus();
          if (isReady) {
            try {
              await loadMore();
              fetchStats();
              setIsRunning(false);
            } catch {
              if (mountedRef.current)
                toast.error("Gagal memuat data setelah SentiStrength");
              setIsRunning(false);
            }
          } else {
            pollTimeoutRef.current = setTimeout(pollForData, POLL_INTERVAL);
          }
        };
        pollTimeoutRef.current = setTimeout(pollForData, 1500);
      } else if (result.status === "running") {
        toast.info("SentiStrength sedang berjalan", { id: toastId });
        pollAttemptRef.current = 0;
        const pollRunning = async () => {
          if (!mountedRef.current) return;
          pollAttemptRef.current++;
          if (pollAttemptRef.current > MAX_POLL_ATTEMPTS) {
            toast.warning("Mungkin masih berjalan");
            setIsRunning(false);
            return;
          }
          const isReady = await pollSentiStrengthStatus();
          if (isReady) {
            toast.success("SentiStrength selesai!");
            reset();
            try {
              await loadMore();
              fetchStats();
            } catch {}
            setIsRunning(false);
          } else {
            pollTimeoutRef.current = setTimeout(pollRunning, POLL_INTERVAL);
          }
        };
        pollTimeoutRef.current = setTimeout(pollRunning, POLL_INTERVAL);
      } else {
        addError({
          type: "data",
          message: `Status tidak dikenal: ${result.status}`,
          endpoint,
          timestamp: new Date(),
          rawError: JSON.stringify(result),
        });
        toast.error("SentiStrength gagal!", { id: toastId });
        setIsRunning(false);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        addError({
          type: "timeout",
          message: "Pipeline timeout (5 menit)",
          endpoint,
          timestamp: new Date(),
        });
        toast.warning("SentiStrength timeout", { id: toastId });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        addError({
          type: "network",
          message: "Gagal terhubung ke server saat menjalankan pipeline",
          endpoint,
          timestamp: new Date(),
          rawError: err.message,
        });
        toast.error("Gagal terhubung ke server", { id: toastId });
      } else {
        addError({
          type: "unknown",
          message:
            err instanceof Error ? err.message : "Kesalahan tidak diketahui",
          endpoint,
          timestamp: new Date(),
        });
        toast.error("Gagal menjalankan SentiStrength", { id: toastId });
      }
      setIsRunning(false);
    }
  };

  const handleRetry = async () => {
    if (retryCountRef.current >= MAX_RETRIES) {
      toast.error("Batas percobaan tercapai");
      return;
    }
    setIsRetrying(true);
    retryCountRef.current++;
    clearErrors();
    try {
      reset();
      await loadMore();
      if (mountedRef.current) fetchStats();
    } catch {
    } finally {
      if (mountedRef.current) setIsRetrying(false);
    }
  };

  const handleOpenDetail = (item: SentiStrengthItem) => {
    setSelectedItem(item);
    setWordData(null);
    fetchWordDetails(item.guid);
  };

  const fetchWordDetails = async (guid: string) => {
    setIsLoadingDetail(true);
    setWordData(null);
    const endpoint = `http://localhost:8000/api/data/sentistrength/${guid}/words`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        if (res.status === 404) toast.info("Detail kata tidak tersedia");
        else {
          toast.error(`Gagal mengambil detail kata (HTTP ${res.status})`);
          addError({
            type: "server",
            message: `Gagal detail kata (${res.status})`,
            statusCode: res.status,
            endpoint,
            timestamp: new Date(),
          });
        }
        return;
      }
      const result = await res.json();
      if (result.status === "success") setWordData(result.data);
      else toast.error("Format data tidak valid");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError")
        toast.error("Timeout detail kata");
      else if (err instanceof TypeError && err.message === "Failed to fetch")
        toast.error("Gagal terhubung ke server");
      else toast.error("Gagal mengambil detail kata");
    } finally {
      if (mountedRef.current) setIsLoadingDetail(false);
    }
  };

  const getLabelBadge = (label: string) => {
    switch (label?.toLowerCase()) {
      case "positive":
        return (
          <Badge className="bg-green-100 dark:bg-green-900/50 font-medium text-green-700 dark:text-green-400">
            <ThumbsUp className="mr-1 w-3 h-3" />
            Positif
          </Badge>
        );
      case "negative":
        return (
          <Badge className="bg-red-100 dark:bg-red-900/50 font-medium text-red-700 dark:text-red-400">
            <ThumbsDown className="mr-1 w-3 h-3" />
            Negatif
          </Badge>
        );
      case "neutral":
        return (
          <Badge className="bg-muted font-medium text-muted-foreground">
            <Minus className="mr-1 w-3 h-3" />
            Neutral
          </Badge>
        );
      default:
        return <Badge variant="outline">{label || "Unknown"}</Badge>;
    }
  };

  const getScoreColor = (score: number, type: "pos" | "neg") => {
    if (type === "pos") {
      if (score >= 3) return "text-emerald-600 dark:text-emerald-400 font-bold";
      if (score >= 2) return "text-emerald-500 dark:text-emerald-300";
      return "text-muted-foreground";
    } else {
      if (score <= -3) return "text-red-600 dark:text-red-400 font-bold";
      if (score <= -2) return "text-red-500 dark:text-red-300";
      return "text-muted-foreground";
    }
  };

  // Error Display Component
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
          <div className="flex justify-between items-start gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-white dark:bg-gray-800 p-1.5 rounded-full">
                {getErrorIcon()}
              </div>
              <div>
                <h3 className="font-semibold text-sm">
                  {hasNetworkError
                    ? "Koneksi Gagal"
                    : hasTimeout
                      ? "Request Timeout"
                      : hasServerError
                        ? "Server Error"
                        : "Error"}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {errors.length} error •{" "}
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
          <div className="bg-white dark:bg-gray-900 p-3 border rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium text-sm">{latestError.message}</p>
                {latestError.endpoint && (
                  <p className="mt-1 font-mono text-muted-foreground text-xs">
                    {latestError.endpoint}
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
                  {err.rawError && (
                    <div className="bg-muted/50 p-2 rounded font-mono text-[10px] break-all whitespace-pre-wrap">
                      {err.rawError}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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

  if (initialLoading) return <LoadingSkeleton />;

  const positivePct =
    stats.total > 0 ? ((stats.positive / stats.total) * 100).toFixed(1) : "0";
  const neutralPct =
    stats.total > 0 ? ((stats.neutral / stats.total) * 100).toFixed(1) : "0";
  const negativePct =
    stats.total > 0 ? ((stats.negative / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">
            SentiStrength ID
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Pelabelan sentimen menggunakan SentiStrength lexicon
          </p>
        </div>
        <Button
          onClick={runSentistrength}
          disabled={isRunning}
          className="bg-sky-600 hover:bg-sky-700"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <Play className="mr-2 w-4 h-4" />
              Jalankan SentiStrength
            </>
          )}
        </Button>
      </div>

      {/* ERROR DISPLAY */}
      <ErrorDisplay />

      {/* Partial error warnings */}
      {statsError && !hasBlockingError && data.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="flex-1 text-amber-800 dark:text-amber-200 text-sm">
            Gagal memuat statistik. Data tabel mungkin masih tersedia.
          </p>
          <Button
            onClick={() => {
              setStatsError(false);
              fetchStats();
            }}
            variant="outline"
            size="sm"
            className="gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Muat Ulang
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Total
                </p>
                <p className="font-bold tabular-nums text-foreground text-xl">
                  {stats.total.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs truncate">data</p>
              </div>
              <div className="bg-sky-500/10 ml-2 p-2 rounded-lg shrink-0">
                <FileText className="w-4 h-4 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Positif
                </p>
                <p className="font-bold tabular-nums text-emerald-600 text-xl">
                  {stats.positive.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{positivePct}%</p>
              </div>
              <div className="bg-emerald-500/10 ml-2 p-2 rounded-lg shrink-0">
                <ThumbsUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Neutral
                </p>
                <p className="font-bold tabular-nums text-foreground text-xl">
                  {stats.neutral.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{neutralPct}%</p>
              </div>
              <div className="bg-muted ml-2 p-2 rounded-lg shrink-0">
                <Minus className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Negatif
                </p>
                <p className="font-bold tabular-nums text-red-600 text-xl">
                  {stats.negative.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{negativePct}%</p>
              </div>
              <div className="bg-red-500/10 ml-2 p-2 rounded-lg shrink-0">
                <ThumbsDown className="w-4 h-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Avg Score
                </p>
                <p className="font-bold text-foreground text-lg">
                  <span className="text-emerald-600">
                    +{stats.avg_positive}
                  </span>
                  <span className="mx-0.5 text-muted-foreground">/</span>
                  <span className="text-red-600">
                    -{Math.abs(stats.avg_negative)}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">rata-rata</p>
              </div>
              <div className="bg-violet-500/10 ml-2 p-2 rounded-lg shrink-0">
                <TrendingUp className="w-4 h-4 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table atau Empty State */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-sky-100 dark:bg-sky-900/20 p-4 rounded-full">
              <Scale className="w-12 h-12 text-sky-400" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="font-semibold text-lg">Belum Ada Data</h3>
              <p className="max-w-md text-muted-foreground">
                Belum ada data SentiStrength yang tersedia. Klik tombol di bawah
                untuk memulai proses pelabelan sentimen.
              </p>
            </div>
            <Button
              onClick={runSentistrength}
              disabled={isRunning}
              className="gap-2 bg-sky-600 hover:bg-sky-700"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Jalankan SentiStrength
                </>
              )}
            </Button>
            {hasBlockingError && (
              <p className="text-red-500 text-xs">
                Periksa error di atas untuk informasi lebih lanjut
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-muted/50">
                    <TableHead className="w-[60px] font-bold">No</TableHead>
                    <TableHead className="font-bold">Teks Bersih</TableHead>
                    <TableHead className="w-[120px] font-bold">Label</TableHead>
                    <TableHead className="w-[100px] font-bold text-center">
                      Positif
                    </TableHead>
                    <TableHead className="w-[100px] font-bold text-center">
                      Negatif
                    </TableHead>
                    <TableHead className="w-[60px] font-bold text-center">
                      Detail
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow
                      key={item.guid}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="text-muted-foreground text-center">
                        {(pagination.page - 1) * pagination.page_size +
                          index +
                          1}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[500px] text-foreground line-clamp-2">
                          {item.clean_title}
                        </p>
                      </TableCell>
                      <TableCell>{getLabelBadge(item.label)}</TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`font-mono text-sm ${getScoreColor(item.pos, "pos")}`}
                        >
                          +{item.pos}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`font-mono text-sm ${getScoreColor(item.neg, "neg")}`}
                        >
                          {item.neg}
                        </span>
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
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data.length > 0 && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loading}
          hasMore={hasMore}
          currentCount={data.length}
          totalCount={total}
        />
      )}

      {/* Dialog Detail */}
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
            setWordData(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detail SentiStrength{" "}
              {selectedItem && getLabelBadge(selectedItem.label)}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 mt-4">
              <div className="bg-muted/50 p-4 border rounded-lg">
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Teks Bersih
                </p>
                <p className="text-foreground">{selectedItem.clean_title}</p>
              </div>
              <div className="gap-4 grid grid-cols-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 border border-emerald-100 dark:border-emerald-800 rounded-lg text-center">
                  <p className="mb-1 font-medium text-emerald-600 dark:text-emerald-400 text-xs">
                    Skor Positif
                  </p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-2xl">
                    +{selectedItem.pos}
                  </p>
                </div>
                <div className="bg-muted/50 p-4 border rounded-lg text-center">
                  <p className="mb-1 font-medium text-muted-foreground text-xs">
                    Label
                  </p>
                  <div className="mt-1">
                    {getLabelBadge(selectedItem.label)}
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 p-4 border border-red-100 dark:border-red-800 rounded-lg text-center">
                  <p className="mb-1 font-medium text-red-600 dark:text-red-400 text-xs">
                    Skor Negatif
                  </p>
                  <p className="font-bold text-red-600 dark:text-red-400 text-2xl">
                    {selectedItem.neg}
                  </p>
                </div>
              </div>
              {isLoadingDetail ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                  <span className="ml-2 text-muted-foreground text-sm">
                    Memuat detail kata...
                  </span>
                </div>
              ) : !wordData ? (
                <div className="py-4 text-muted-foreground text-sm text-center">
                  Gagal memuat detail kata.{" "}
                  <button
                    onClick={() => fetchWordDetails(selectedItem.guid)}
                    className="text-sky-600 hover:underline"
                  >
                    Coba lagi
                  </button>
                </div>
              ) : (
                <>
                  {wordData.positive_words.length > 0 && (
                    <div>
                      <p className="mb-2 font-medium text-emerald-700 dark:text-emerald-400 text-sm">
                        Kata Positif ({wordData.positive_words.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {wordData.positive_words.map((word, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                          >
                            {word.word}
                            <span className="opacity-75 ml-1.5 font-mono text-xs">
                              +{word.score}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {wordData.negative_words.length > 0 && (
                    <div>
                      <p className="mb-2 font-medium text-red-700 dark:text-red-400 text-sm">
                        Kata Negatif ({wordData.negative_words.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {wordData.negative_words.map((word, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                          >
                            {word.word}
                            <span className="opacity-75 ml-1.5 font-mono text-xs">
                              {word.score}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {wordData.positive_words.length === 0 &&
                    wordData.negative_words.length === 0 && (
                      <div className="py-4 text-muted-foreground text-sm text-center">
                        Tidak ada kata sentimen yang terdeteksi
                      </div>
                    )}
                </>
              )}
              <div className="pt-2 text-center">
                <Badge variant="secondary" className="font-mono text-xs">
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
                <Skeleton className="w-20 h-6" />
                <Skeleton className="w-16 h-6" />
                <Skeleton className="w-16 h-6" />
                <Skeleton className="w-8 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
