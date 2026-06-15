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
  ArrowRight,
  Bug,
  CheckCircle2,
  Eye,
  FileText,
  Filter,
  Hash,
  Info,
  Loader2,
  Play,
  RefreshCw,
  ServerCrash,
  Settings,
  TrendingDown,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface PreprocessItem {
  guid: string;
  original_title: string;
  clean_title: string;
}

interface ErrorDetail {
  type: "network" | "server" | "data" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
  endpoint?: string;
  timestamp: Date;
  rawError?: string;
}

export default function PreprocessPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PreprocessItem | null>(null);

  // Error states
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasBlockingError, setHasBlockingError] = useState(false);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const POLL_INTERVAL = 2000;
  const MAX_POLL_ATTEMPTS = 30;
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);

  const addError = useCallback((error: ErrorDetail) => {
    setErrors((prev) => [...prev, error]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
    setHasBlockingError(false);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  // Fungsi fetch data - TIDAK throw error
  const fetchPreprocessData = useCallback(
    async (page: number, pageSize: number) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const endpoint = `http://localhost:8000/api/data/preprocessing?page=${page}&page_size=${pageSize}`;

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
        if (page === 1) clearErrors();
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
  } = useLoadMore<PreprocessItem>(fetchPreprocessData);

  // Polling status
  const pollPreprocessingStatus = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("http://localhost:8000/api/pipeline/status", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const result = await res.json();
        if (result.status === "completed" || result.preprocessing_done === true)
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
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runPreprocessing = async () => {
    setIsRunning(true);
    clearErrors();
    const endpoint = "http://localhost:8000/api/pipeline/preprocessing";
    const toastId = toast.loading("Menjalankan preprocessing...", {
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
          toast.warning("Preprocessing sudah berjalan", { id: toastId });
        else
          toast.error("Preprocessing gagal!", {
            id: toastId,
            description: serverMessage,
          });
        setIsRunning(false);
        return;
      }

      const result = await res.json();
      if (result.status === "success") {
        toast.success("Preprocessing berhasil!", {
          id: toastId,
          description: result.message || "Data telah diproses",
        });
        reset();
        pollAttemptRef.current = 0;
        const pollForData = async () => {
          if (!mountedRef.current) return;
          pollAttemptRef.current++;
          if (pollAttemptRef.current > MAX_POLL_ATTEMPTS) {
            toast.info("Masih memproses data...");
            try {
              await loadMore();
            } catch {}
            setIsRunning(false);
            return;
          }
          const isReady = await pollPreprocessingStatus();
          if (isReady) {
            try {
              await loadMore();
              setIsRunning(false);
            } catch {
              if (mountedRef.current) toast.error("Gagal memuat data");
              setIsRunning(false);
            }
          } else {
            pollTimeoutRef.current = setTimeout(pollForData, POLL_INTERVAL);
          }
        };
        pollTimeoutRef.current = setTimeout(pollForData, 1500);
      } else if (result.status === "running") {
        toast.info("Preprocessing sedang berjalan", { id: toastId });
        pollAttemptRef.current = 0;
        const pollRunning = async () => {
          if (!mountedRef.current) return;
          pollAttemptRef.current++;
          if (pollAttemptRef.current > MAX_POLL_ATTEMPTS) {
            toast.warning("Mungkin masih berjalan");
            setIsRunning(false);
            return;
          }
          const isReady = await pollPreprocessingStatus();
          if (isReady) {
            toast.success("Preprocessing selesai!");
            reset();
            try {
              await loadMore();
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
        toast.error("Preprocessing gagal!", { id: toastId });
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
        toast.warning("Preprocessing timeout", { id: toastId });
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
        toast.error("Gagal menjalankan preprocessing", { id: toastId });
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
    } catch {
    } finally {
      if (mountedRef.current) setIsRetrying(false);
    }
  };

  // Hitung statistik
  const avgOriginalLength =
    data.length > 0
      ? Math.round(
          data.reduce((sum, item) => sum + item.original_title.length, 0) /
            data.length,
        )
      : 0;
  const avgCleanLength =
    data.length > 0
      ? Math.round(
          data.reduce((sum, item) => sum + item.clean_title.length, 0) /
            data.length,
        )
      : 0;
  const avgReduction =
    avgOriginalLength > 0
      ? (
          ((avgOriginalLength - avgCleanLength) / avgOriginalLength) *
          100
        ).toFixed(1)
      : "0";

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

  // ============================================================
  // RENDER: LOADING STATE
  // ============================================================
  if (initialLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Preprocessing</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Pembersihan teks berita sebelum analisis sentimen
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={runPreprocessing}
            disabled={isRunning}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Play className="mr-2 w-4 h-4" />
                Jalankan Preprocessing
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ERROR DISPLAY */}
      <ErrorDisplay />

      {/* Stats Cards */}
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Total Data
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {total.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">data diproses</p>
              </div>
              <div className="bg-purple-500/10 p-2.5 rounded-xl">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Rata-rata Awal
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {avgOriginalLength}
                  <span className="ml-1 font-normal text-muted-foreground text-sm">
                    char
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  sebelum cleaning
                </p>
              </div>
              <div className="bg-sky-500/10 p-2.5 rounded-xl">
                <Hash className="w-5 h-5 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Rata-rata Bersih
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {avgCleanLength}
                  <span className="ml-1 font-normal text-muted-foreground text-sm">
                    char
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  setelah cleaning
                </p>
              </div>
              <div className="bg-emerald-500/10 p-2.5 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Reduksi
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {avgReduction}%
                </p>
                <div className="flex items-center gap-1 text-emerald-600 text-xs">
                  <TrendingDown className="w-3 h-3" />
                  <span>pengurangan teks</span>
                </div>
              </div>
              <div className="bg-amber-500/10 p-2.5 rounded-xl">
                <Filter className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table atau Empty State */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-full">
              <Settings className="w-12 h-12 text-purple-400" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="font-semibold text-lg">Belum Ada Data</h3>
              <p className="max-w-md text-muted-foreground">
                Belum ada data preprocessing yang tersedia. Klik tombol di bawah
                untuk memulai proses pembersihan teks berita.
              </p>
            </div>
            <Button
              onClick={runPreprocessing}
              disabled={isRunning}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Jalankan Preprocessing
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
                    <TableHead className="w-[45%] font-bold">
                      <Badge
                        variant="outline"
                        className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs"
                      >
                        Original
                      </Badge>
                    </TableHead>
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead className="w-[45%] font-bold">
                      <Badge className="bg-green-100 hover:bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs">
                        Cleaned
                      </Badge>
                    </TableHead>
                    <TableHead className="w-[80px] font-bold text-center">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow
                      key={item.guid}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium text-muted-foreground text-center">
                        {(pagination.page - 1) * pagination.page_size +
                          index +
                          1}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[400px] text-muted-foreground line-clamp-2">
                          {item.original_title}
                        </p>
                        <p className="mt-1 text-muted-foreground/60 text-xs">
                          {item.original_title.length} char
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[400px] font-medium text-foreground line-clamp-2">
                          {item.clean_title}
                        </p>
                        <p className="mt-1 text-emerald-600 dark:text-emerald-400 text-xs">
                          {item.clean_title.length} char (-
                          {item.original_title.length - item.clean_title.length}
                          )
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedItem(item)}
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

      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Preprocessing</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 mt-4">
              <div className="bg-red-50 dark:bg-red-950/30 p-4 border border-red-100 dark:border-red-800 rounded-lg">
                <Badge
                  variant="outline"
                  className="mb-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
                >
                  Original
                </Badge>
                <p className="mt-2 text-foreground">
                  {selectedItem.original_title}
                </p>
                <p className="mt-2 text-muted-foreground text-xs">
                  {selectedItem.original_title.length} karakter
                </p>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="w-6 h-6 text-purple-400" />
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 p-4 border border-green-100 dark:border-green-800 rounded-lg">
                <Badge className="bg-green-100 dark:bg-green-900/50 mb-2 text-green-700 dark:text-green-400">
                  Cleaned
                </Badge>
                <p className="mt-2 font-medium text-foreground">
                  {selectedItem.clean_title}
                </p>
                <p className="mt-2 text-emerald-600 dark:text-emerald-400 text-xs">
                  {selectedItem.clean_title.length} karakter (-
                  {selectedItem.original_title.length -
                    selectedItem.clean_title.length}
                  )
                </p>
              </div>
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
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="w-full h-20" />
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
                <Skeleton className="flex-1 h-12" />
                <Skeleton className="w-4 h-4" />
                <Skeleton className="flex-1 h-12" />
                <Skeleton className="w-8 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
