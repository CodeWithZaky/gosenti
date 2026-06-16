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

// ── Types ───────────────────────────────────────────────────────────────────

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

interface ErrorDetail {
  type: "network" | "server" | "data" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
  endpoint?: string;
  timestamp: Date;
  rawError?: string;
}

type SortField = "pos" | "neg";
type SortOrder = "asc" | "desc";

// ── Helper ──────────────────────────────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────────────

export default function InsetFeaturePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InsetFeatureItem | null>(
    null,
  );
  const [sortField, setSortField] = useState<SortField>("pos");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
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

  const addError = useCallback((error: ErrorDetail) => {
    setErrors((prev) => [...prev, error]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Fetch Data ──────────────────────────────────────────────────────────

  const fetchInsetFeatureData = useCallback(
    async (page: number, pageSize: number) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const endpoint = `http://localhost:8000/api/data/features?page=${page}&page_size=${pageSize}`;

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
        if (!result || !result.items || !Array.isArray(result.items)) {
          addError({
            type: "data",
            message: "Format data tidak sesuai",
            endpoint,
            timestamp: new Date(),
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

        if (result.stats) setStats(result.stats);
        if (page === 1) clearErrors();
        retryCountRef.current = 0;
        return { items: result.items, pagination: result.pagination };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
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
            message: err instanceof Error ? err.message : "Kesalahan",
            endpoint,
            timestamp: new Date(),
          });
        }
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

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    const init = async () => {
      try {
        await loadMore();
      } catch {}
    };
    init();
  }, []); // eslint-disable-line

  // ── Run Pipeline ────────────────────────────────────────────────────────

  const runInsetFeature = async () => {
    setIsRunning(true);
    const endpoint = "http://localhost:8000/api/pipeline/inset_feature";
    const toastId = toast.loading("Menjalankan InSet Feature...");

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
        else if (statusCode === 422)
          toast.error("Data belum tersedia", {
            id: toastId,
            description: serverMessage,
          });
        else
          toast.error("InSet Feature gagal!", {
            id: toastId,
            description: serverMessage,
          });
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
        setTimeout(async () => {
          try {
            await loadMore();
          } catch {}
          if (mountedRef.current) setIsRunning(false);
        }, 1000);
      } else {
        addError({
          type: "data",
          message: `Status: ${result.status}`,
          endpoint,
          timestamp: new Date(),
        });
        toast.error("InSet Feature gagal!", { id: toastId });
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
        toast.warning("InSet Feature timeout", { id: toastId });
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
        toast.error("Gagal menjalankan InSet Feature", { id: toastId });
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

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleOpenDetail = async (item: InsetFeatureItem) => {
    setSelectedItem(item);
    setWordDetails(null);
    setLoadingDetails(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/data/features/${item.guid}/words`,
      );
      if (res.ok) {
        const result = await res.json();
        if (result.status === "success") setWordDetails(result.data);
      }
    } catch {
    } finally {
      if (mountedRef.current) setLoadingDetails(false);
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
      if (hasNetworkError) return "border-red-400 bg-red-50 dark:bg-red-950/30";
      if (hasTimeout)
        return "border-amber-400 bg-amber-50 dark:bg-amber-950/30";
      if (hasServerError)
        return "border-orange-400 bg-orange-50 dark:bg-orange-950/30";
      return "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30";
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
                    <div className="bg-muted/50 p-2 rounded font-mono text-[10px] break-all">
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

  return (
    <div className="space-y-6">
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

      <ErrorDisplay />

      <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Total
                </p>
                <p className="font-bold text-xl">
                  {(stats.total ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-amber-500/10 p-2 rounded-lg">
                <FileText className="w-4 h-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Max Positif
                </p>
                <p className="font-bold text-emerald-600 text-xl">
                  +{stats.max_pos ?? 0}
                </p>
              </div>
              <div className="bg-emerald-500/10 p-2 rounded-lg">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Min Negatif
                </p>
                <p className="font-bold text-red-600 text-xl">
                  {stats.min_neg ?? 0}
                </p>
              </div>
              <div className="bg-red-500/10 p-2 rounded-lg">
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="font-medium text-muted-foreground text-xs uppercase">
                  Campuran
                </p>
                <p className="font-bold text-violet-600 text-xl">
                  {(stats.has_both ?? 0).toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">
                  {stats.total > 0
                    ? `(${((stats.has_both / stats.total) * 100).toFixed(1)}%)`
                    : ""}
                </p>
              </div>
              <div className="bg-violet-500/10 p-2 rounded-lg">
                <Hash className="w-4 h-4 text-violet-600" />
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
                    +{stats.avg_pos ?? "0"}
                  </span>
                  <span className="mx-0.5 text-muted-foreground">/</span>
                  <span className="text-red-600">{stats.avg_neg ?? "0"}</span>
                </p>
              </div>
              <div className="bg-sky-500/10 p-2 rounded-lg">
                <Hash className="w-4 h-4 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {sortedData.length === 0 && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <Puzzle className="w-12 h-12 text-amber-400" />
            <h3 className="font-semibold text-lg">Belum Ada Data</h3>
            <p className="max-w-md text-muted-foreground text-center">
              Belum ada data fitur InSet. Klik tombol untuk memulai.
            </p>
            <Button
              onClick={runInsetFeature}
              disabled={isRunning}
              className="bg-amber-600"
            >
              <Play className="mr-2 w-4 h-4" />
              Jalankan InSet Feature
            </Button>
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
                        className="hover:bg-muted/30"
                      >
                        <TableCell className="text-muted-foreground text-center">
                          {(pagination.page - 1) * pagination.page_size +
                            index +
                            1}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[400px] text-sm line-clamp-2">
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
            <DialogTitle>Detail InSet Feature</DialogTitle>
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
              <div className="gap-4 grid grid-cols-2">
                <div className="bg-emerald-50 p-4 border rounded-lg">
                  <TrendingUp className="mb-2 w-5 h-5 text-emerald-600" />
                  <p className="font-bold text-emerald-600 text-3xl">
                    +{selectedItem.inset_pos}
                  </p>
                  <Progress
                    value={(selectedItem.inset_pos_norm ?? 0) * 100}
                    className="mt-3 h-2"
                  />
                </div>
                <div className="bg-red-50 p-4 border rounded-lg">
                  <TrendingDown className="mb-2 w-5 h-5 text-red-600" />
                  <p className="font-bold text-red-600 text-3xl">
                    {selectedItem.inset_neg}
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
                <p className="mb-1 text-muted-foreground text-xs">Net Score</p>
                <p
                  className={`font-bold text-2xl ${selectedItem.inset_pos + selectedItem.inset_neg > 0 ? "text-emerald-600" : selectedItem.inset_pos + selectedItem.inset_neg < 0 ? "text-red-600" : "text-foreground"}`}
                >
                  {selectedItem.inset_pos + selectedItem.inset_neg > 0
                    ? "+"
                    : ""}
                  {selectedItem.inset_pos + selectedItem.inset_neg}
                </p>
              </div>
              {loadingDetails ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="ml-2 text-muted-foreground text-sm">
                    Memuat detail kata...
                  </span>
                </div>
              ) : wordDetails ? (
                <div className="space-y-4">
                  {wordDetails.positive_words.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-emerald-50 px-4 py-2 border-b">
                        <p className="flex items-center gap-2 font-semibold text-emerald-700 text-sm">
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
                      <div className="bg-red-50 px-4 py-2 border-b">
                        <p className="flex items-center gap-2 font-semibold text-red-700 text-sm">
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
                      <p className="py-4 text-muted-foreground text-center">
                        Tidak ada kata yang cocok dengan leksikon InSet
                      </p>
                    )}
                </div>
              ) : (
                <p className="py-4 text-muted-foreground text-sm text-center">
                  Gagal memuat detail kata.
                </p>
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
      <Skeleton className="w-64 h-8" />
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
