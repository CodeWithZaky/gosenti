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

  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [hasBlockingError, setHasBlockingError] = useState(false);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const mountedRef = useRef(true);

  // ✅ Ganti ref dengan state
  const [needInitialLoad, setNeedInitialLoad] = useState(true);

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSentiStrengthData = useCallback(
    async (page: number, pageSize: number) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const endpoint = `http://localhost:8000/api/data/sentistrength?page=${page}&page_size=${pageSize}`;

      console.log(`[SentiStrength FetchData] Requesting: ${endpoint}`);

      try {
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        clearTimeout(timeoutId);

        console.log(`[SentiStrength FetchData] Response status: ${res.status}`);

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
              has_more: false,
            },
          };
        }

        const result = await res.json();
        console.log(
          `[SentiStrength FetchData] Data received: ${result.items?.length} items`,
        );

        if (!result || !result.items || !Array.isArray(result.items)) {
          addError({
            type: "data",
            message: "Format data tidak sesuai",
            endpoint,
            timestamp: new Date(),
          });
          setHasBlockingError(true);
          return {
            items: [],
            pagination: {
              page: 1,
              page_size: pageSize,
              total: 0,
              total_pages: 0,
              has_more: false,
            },
          };
        }

        if (page === 1) clearErrors();
        retryCountRef.current = 0;
        return { items: result.items, pagination: result.pagination };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        console.error("[SentiStrength FetchData] Error:", err);

        if (err instanceof DOMException && err.name === "AbortError") {
          addError({
            type: "timeout",
            message: "Request timeout (15 detik)",
            endpoint,
            timestamp: new Date(),
          });
        } else if (
          err instanceof TypeError &&
          err.message === "Failed to fetch"
        ) {
          addError({
            type: "network",
            message: "Gagal terhubung ke server",
            endpoint,
            timestamp: new Date(),
            rawError: err.message,
          });
        } else {
          addError({
            type: "unknown",
            message:
              err instanceof Error ? err.message : "Kesalahan tidak diketahui",
            endpoint,
            timestamp: new Date(),
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
            has_more: false,
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
    forceReload, // ✅ Ambil forceReload
  } = useLoadMore<SentiStrengthItem>(fetchSentiStrengthData);

  const fetchStats = useCallback(async () => {
    console.log("[SentiStrength] Fetching stats...");
    try {
      const res = await fetch(
        "http://localhost:8000/api/data/sentistrength/stats",
      );
      if (!res.ok) {
        console.log(`[SentiStrength] Stats response status: ${res.status}`);
        setStatsError(true);
        return;
      }
      const result = await res.json();
      console.log("[SentiStrength] Stats received:", result.data);
      if (result.status === "success" && result.data) {
        setStats(result.data);
        setStatsError(false);
      } else {
        setStatsError(true);
      }
    } catch (error) {
      console.error("[SentiStrength] Stats fetch error:", error);
      setStatsError(true);
    }
  }, []);

  // ✅ Initial load dengan needInitialLoad state
  useEffect(() => {
    if (needInitialLoad) {
      console.log("[SentiStrengthPage] Triggering initial load via useEffect");
      const init = async () => {
        try {
          await loadMore();
          console.log("[SentiStrengthPage] Initial data load completed");
          if (mountedRef.current) {
            fetchStats();
            console.log("[SentiStrengthPage] Stats fetch completed");
          }
        } catch (error) {
          console.error("[SentiStrengthPage] Initial load failed:", error);
        } finally {
          setNeedInitialLoad(false);
        }
      };
      init();
    }
  }, [needInitialLoad, loadMore, fetchStats]);

  // ✅ RUN SENTISTRENGTH — dengan forceReload
  const runSentistrength = async () => {
    setIsRunning(true);
    clearErrors();
    const endpoint = "http://localhost:8000/api/pipeline/sentistrength";
    const toastId = toast.loading("Menjalankan SentiStrength...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      });
      clearTimeout(timeoutId);

      console.log(`[SentiStrength Pipeline] Response status: ${res.status}`);

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
      console.log("[SentiStrength Pipeline] Result:", result);

      if (result.status === "success") {
        toast.success("SentiStrength berhasil!", {
          id: toastId,
          description: result.message || "Data telah dilabeli",
        });

        console.log(
          "[SentiStrength Pipeline] Success! Triggering force reload...",
        );

        // ✅ Set isRunning false dulu
        setIsRunning(false);

        // ✅ Force reload data dan stats
        setTimeout(async () => {
          if (mountedRef.current) {
            try {
              console.log("[SentiStrength Pipeline] Calling forceReload...");
              await forceReload();
              console.log(
                "[SentiStrength Pipeline] Force reload completed, fetching stats...",
              );
              fetchStats();
              console.log("[SentiStrength Pipeline] Stats fetched!");
            } catch (error) {
              console.error(
                "[SentiStrength Pipeline] Force reload failed:",
                error,
              );
              toast.error("Gagal memuat ulang data");
            }
          }
        }, 500);
      } else {
        addError({
          type: "data",
          message: `Status: ${result.status}`,
          endpoint,
          timestamp: new Date(),
        });
        toast.error("SentiStrength gagal!", { id: toastId });
        setIsRunning(false);
      }
    } catch (err: unknown) {
      console.error("[SentiStrength Pipeline] Error:", err);
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
          message: "Gagal terhubung ke server",
          endpoint,
          timestamp: new Date(),
        });
        toast.error("Gagal terhubung ke server", { id: toastId });
      } else {
        addError({
          type: "unknown",
          message: err instanceof Error ? err.message : "Kesalahan",
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
      console.log("[SentiStrength Retry] Force reloading...");
      await forceReload(); // ✅ Gunakan forceReload
      if (mountedRef.current) fetchStats();
      console.log("[SentiStrength Retry] Completed");
    } catch (error) {
      console.error("[SentiStrength Retry] Error:", error);
    } finally {
      if (mountedRef.current) setIsRetrying(false);
    }
  };

  const handleOpenDetail = async (item: SentiStrengthItem) => {
    setSelectedItem(item);
    setWordData(null);
    setIsLoadingDetail(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/data/sentistrength/${item.guid}/words`,
      );
      if (res.ok) {
        const result = await res.json();
        if (result.status === "success" && mountedRef.current)
          setWordData(result.data);
      }
    } catch {
    } finally {
      if (mountedRef.current) setIsLoadingDetail(false);
    }
  };

  // ── Error Display ──────────────────────────────────────────────────────

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
        return <Badge variant="outline">{label || "?"}</Badge>;
    }
  };

  const getScoreColor = (score: number, type: "pos" | "neg") => {
    if (type === "pos") {
      if (score >= 3) return "text-emerald-600 font-bold";
      if (score >= 2) return "text-emerald-500";
      return "text-muted-foreground";
    } else {
      if (score <= -3) return "text-red-600 font-bold";
      if (score <= -2) return "text-red-500";
      return "text-muted-foreground";
    }
  };

  // Debug render state
  console.log("[SentiStrengthPage] Render:", {
    initialLoading,
    loading,
    dataLength: data.length,
    needInitialLoad,
    isRunning,
    total,
  });

  if (initialLoading) {
    console.log("[SentiStrengthPage] Rendering LoadingSkeleton");
    return <LoadingSkeleton />;
  }

  console.log("[SentiStrengthPage] Rendering main content");

  const positivePct =
    stats.total > 0 ? ((stats.positive / stats.total) * 100).toFixed(1) : "0";
  const neutralPct =
    stats.total > 0 ? ((stats.neutral / stats.total) * 100).toFixed(1) : "0";
  const negativePct =
    stats.total > 0 ? ((stats.negative / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
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

      {/* Stats Cards */}
      <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Total
                </p>
                <p className="font-bold text-xl">
                  {stats.total.toLocaleString()}
                </p>
              </div>
              <div className="bg-sky-500/10 p-2 rounded-lg">
                <FileText className="w-4 h-4 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Positif
                </p>
                <p className="font-bold text-emerald-600 text-xl">
                  {stats.positive.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{positivePct}%</p>
              </div>
              <div className="bg-emerald-500/10 p-2 rounded-lg">
                <ThumbsUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Neutral
                </p>
                <p className="font-bold text-xl">
                  {stats.neutral.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{neutralPct}%</p>
              </div>
              <div className="bg-muted p-2 rounded-lg">
                <Minus className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Negatif
                </p>
                <p className="font-bold text-red-600 text-xl">
                  {stats.negative.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{negativePct}%</p>
              </div>
              <div className="bg-red-500/10 p-2 rounded-lg">
                <ThumbsDown className="w-4 h-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Avg Score
                </p>
                <p className="font-bold text-lg">
                  <span className="text-emerald-600">
                    +{stats.avg_positive}
                  </span>
                  <span className="mx-0.5 text-muted-foreground">/</span>
                  <span className="text-red-600">
                    -{Math.abs(stats.avg_negative)}
                  </span>
                </p>
              </div>
              <div className="bg-violet-500/10 p-2 rounded-lg">
                <TrendingUp className="w-4 h-4 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <Scale className="w-12 h-12 text-sky-400" />
            <h3 className="font-semibold text-lg">Belum Ada Data</h3>
            <p className="max-w-md text-muted-foreground text-center">
              Belum ada data SentiStrength. Klik tombol untuk memulai.
            </p>
            <Button
              onClick={runSentistrength}
              disabled={isRunning}
              className="bg-sky-600"
            >
              <Play className="mr-2 w-4 h-4" />
              Jalankan SentiStrength
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
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
                    <TableRow key={item.guid} className="hover:bg-muted/30">
                      <TableCell className="text-muted-foreground text-center">
                        {(pagination.page - 1) * pagination.page_size +
                          index +
                          1}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[500px] line-clamp-2">
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

      {/* Dialog */}
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
            setWordData(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detail SentiStrength{" "}
              {selectedItem && getLabelBadge(selectedItem.label)}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 mt-4">
              <div className="bg-muted/50 p-4 border rounded-lg">
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
                  Teks Bersih
                </p>
                <p className="text-foreground text-sm">
                  {selectedItem.clean_title}
                </p>
              </div>
              <div className="gap-4 grid grid-cols-3">
                <div className="bg-emerald-50 p-4 border rounded-lg text-center">
                  <p className="mb-1 text-emerald-600 text-xs">Positif</p>
                  <p className="font-bold text-emerald-600 text-2xl">
                    +{selectedItem.pos}
                  </p>
                </div>
                <div className="flex flex-col justify-center items-center bg-muted/50 p-4 border rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">Label</p>
                  {getLabelBadge(selectedItem.label)}
                </div>
                <div className="bg-red-50 p-4 border rounded-lg text-center">
                  <p className="mb-1 text-red-600 text-xs">Negatif</p>
                  <p className="font-bold text-red-600 text-2xl">
                    {selectedItem.neg}
                  </p>
                </div>
              </div>

              {isLoadingDetail ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="ml-2 text-muted-foreground text-sm">
                    Memuat detail kata...
                  </span>
                </div>
              ) : wordData ? (
                <>
                  {wordData.positive_words.length > 0 && (
                    <div>
                      <p className="mb-2 font-medium text-emerald-700 text-sm">
                        🟢 Kata Positif ({wordData.positive_words.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {wordData.positive_words.map((w, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="bg-emerald-50 border-emerald-200 text-emerald-700"
                          >
                            {w.word}
                            <span className="opacity-75 ml-1.5 font-mono text-xs">
                              +{w.score}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {wordData.negative_words.length > 0 && (
                    <div>
                      <p className="mb-2 font-medium text-red-700 text-sm">
                        🔴 Kata Negatif ({wordData.negative_words.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {wordData.negative_words.map((w, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="bg-red-50 border-red-200 text-red-700"
                          >
                            {w.word}
                            <span className="opacity-75 ml-1.5 font-mono text-xs">
                              {w.score}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {wordData.positive_words.length === 0 &&
                    wordData.negative_words.length === 0 && (
                      <p className="py-4 text-muted-foreground text-sm text-center">
                        Tidak ada kata sentimen yang terdeteksi
                      </p>
                    )}
                </>
              ) : (
                <p className="py-4 text-muted-foreground text-sm text-center">
                  Gagal memuat detail kata.
                </p>
              )}
              <div className="text-center">
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
      <Skeleton className="w-64 h-8" />
      <div className="gap-3 grid grid-cols-5">
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
              <div key={i} className="flex gap-4">
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
