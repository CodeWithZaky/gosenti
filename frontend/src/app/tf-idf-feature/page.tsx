"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Bug,
  Cloud,
  Copy,
  Download,
  FileText,
  Hash,
  HelpCircle,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ServerCrash,
  TrendingUp,
  WifiOff,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface TopFeature {
  rank: number;
  word: string;
  tf: number;
  idf: number;
  tfidf: number;
  type: "unigram" | "bigram";
}

interface TfidfSummary {
  total_features: number;
  top_features: TopFeature[];
  stats: {
    mean_tf: number;
    mean_idf: number;
    mean_tfidf: number;
    max_tfidf: number;
    min_tfidf: number;
  };
}

interface WordCloudItem {
  word: string;
  score: number;
}

type SortField = "rank" | "word" | "type" | "tf" | "idf" | "tfidf";
type SortOrder = "asc" | "desc";
type FilterType = "all" | "unigram" | "bigram";

interface ErrorDetail {
  type: "network" | "server" | "data" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
  endpoint?: string;
  timestamp: Date;
  rawError?: string;
}

const wordcloudConfig = {
  positive: {
    title: "Positif",
    colors: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800",
  },
  neutral: {
    title: "Neutral",
    colors: "text-muted-foreground",
    bg: "bg-muted/30 border",
  },
  negative: {
    title: "Negatif",
    colors: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-800",
  },
};

export default function TfIdfPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<TfidfSummary>({
    total_features: 0,
    top_features: [],
    stats: {
      mean_tf: 0,
      mean_idf: 0,
      mean_tfidf: 0,
      max_tfidf: 0,
      min_tfidf: 0,
    },
  });
  const [wordcloud, setWordcloud] = useState<Record<string, WordCloudItem[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [wordcloudLoading, setWordcloudLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("tfidf");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  // Error states
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [wordcloudError, setWordcloudError] = useState(false);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);

  const addError = useCallback((error: ErrorDetail) => {
    setErrors((prev) => [...prev, error]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
    setSummaryError(false);
    setWordcloudError(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSummary = async () => {
    const endpoint = "http://localhost:8000/api/tfidf/summary";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
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
            errorData.message || errorData.detail || JSON.stringify(errorData);
        } catch {
          serverMessage = `HTTP ${statusCode}`;
        }
        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `Gagal mengambil summary (${statusCode})`,
          statusCode,
          endpoint,
          timestamp: new Date(),
          rawError: serverMessage,
        });
        setSummaryError(true);
        return;
      }
      const data = await res.json();
      if (!data.error && data.top_features) {
        setSummary({
          total_features: data.total_features || 0,
          top_features: data.top_features || [],
          stats: {
            mean_tf: data.stats?.mean_tf || 0,
            mean_idf: data.stats?.mean_idf || 0,
            mean_tfidf: data.stats?.mean_tfidf || 0,
            max_tfidf: data.stats?.max_tfidf || 0,
            min_tfidf: data.stats?.min_tfidf || 0,
          },
        });
        setSummaryError(false);
      } else {
        addError({
          type: "data",
          message: "Format data summary tidak sesuai",
          endpoint,
          timestamp: new Date(),
          rawError: JSON.stringify(data),
        });
        setSummaryError(true);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        addError({
          type: "timeout",
          message: "Timeout mengambil summary (15 detik)",
          endpoint,
          timestamp: new Date(),
        });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        addError({
          type: "network",
          message: "Gagal terhubung ke server saat mengambil summary",
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
      setSummaryError(true);
    }
  };

  const fetchWordcloud = async () => {
    setWordcloudLoading(true);
    const endpoint = "http://localhost:8000/api/tfidf/wordcloud";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const statusCode = res.status;
        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `Gagal mengambil wordcloud (${statusCode})`,
          statusCode,
          endpoint,
          timestamp: new Date(),
        });
        setWordcloudError(true);
        return;
      }
      const data = await res.json();
      if (data.status === "success") {
        setWordcloud(data.data || {});
        setWordcloudError(false);
      } else {
        addError({
          type: "data",
          message: "Format data wordcloud tidak sesuai",
          endpoint,
          timestamp: new Date(),
        });
        setWordcloudError(true);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        addError({
          type: "timeout",
          message: "Timeout mengambil wordcloud (15 detik)",
          endpoint,
          timestamp: new Date(),
        });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        addError({
          type: "network",
          message: "Gagal terhubung ke server saat mengambil wordcloud",
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
      setWordcloudError(true);
    } finally {
      if (mountedRef.current) setWordcloudLoading(false);
    }
  };

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    const init = async () => {
      clearErrors();
      await fetchSummary();
      await fetchWordcloud();
      if (mountedRef.current) setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRunTfidf = async () => {
    setIsProcessing(true);
    clearErrors();
    const endpoint = "http://localhost:8000/api/pipeline/tfidf_vectorizer";
    const toastId = toast.loading("Menjalankan TF-IDF...", {
      description: "Proses ini mungkin memakan waktu beberapa saat",
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const statusCode = response.status;
        let serverMessage = "";
        try {
          const errorData = await response.json();
          serverMessage =
            errorData.message || errorData.detail || JSON.stringify(errorData);
        } catch {
          serverMessage = `HTTP ${statusCode}`;
        }
        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `TF-IDF gagal (${statusCode})`,
          statusCode,
          endpoint,
          timestamp: new Date(),
          rawError: serverMessage,
        });
        toast.error("TF-IDF gagal!", {
          id: toastId,
          description: serverMessage,
        });
        setIsProcessing(false);
        return;
      }

      const result = await response.json();
      if (result.status === "success") {
        toast.success("TF-IDF berhasil!", {
          id: toastId,
          description: result.message || "Fitur diekstrak",
        });
        retryCountRef.current = 0;
        setTimeout(async () => {
          if (mountedRef.current) {
            await fetchSummary();
            fetchWordcloud();
            setIsProcessing(false);
          }
        }, 2000);
      } else {
        addError({
          type: "data",
          message: `Status respons tidak dikenal: ${result.status}`,
          endpoint,
          timestamp: new Date(),
          rawError: JSON.stringify(result),
        });
        toast.error("TF-IDF gagal!", {
          id: toastId,
          description: result.message || "Status tidak dikenal",
        });
        setIsProcessing(false);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        addError({
          type: "timeout",
          message: "TF-IDF timeout (5 menit)",
          endpoint,
          timestamp: new Date(),
        });
        toast.warning("TF-IDF timeout", {
          id: toastId,
          description: "Mungkin masih berjalan di background",
        });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        addError({
          type: "network",
          message: "Gagal terhubung ke server saat menjalankan TF-IDF",
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
        toast.error("Gagal menjalankan TF-IDF", { id: toastId });
      }
      setIsProcessing(false);
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
    setLoading(true);
    await fetchSummary();
    await fetchWordcloud();
    if (mountedRef.current) {
      setLoading(false);
      setIsRetrying(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleCopyWord = (word: string) => {
    navigator.clipboard.writeText(word);
    toast.success(`"${word}" disalin!`, { duration: 1500 });
  };

  const handleExportCSV = () => {
    const csv = [
      ["Rank", "Kata", "Tipe", "TF", "IDF", "TF-IDF"],
      ...filteredAndSortedFeatures.map((f) => [
        f.rank,
        `"${f.word}"`,
        f.type,
        f.tf,
        f.idf,
        f.tfidf,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tfidf-features-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data berhasil di-export!");
  };

  const filteredAndSortedFeatures = useMemo(() => {
    let features = [...summary.top_features];
    if (searchQuery)
      features = features.filter((f) =>
        f.word.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    if (filterType !== "all")
      features = features.filter((f) => f.type === filterType);
    features.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case "rank":
          valA = a.rank;
          valB = b.rank;
          break;
        case "word":
          valA = a.word.toLowerCase();
          valB = b.word.toLowerCase();
          break;
        case "type":
          valA = a.type;
          valB = b.type;
          break;
        case "tf":
          valA = a.tf;
          valB = b.tf;
          break;
        case "idf":
          valA = a.idf;
          valB = b.idf;
          break;
        case "tfidf":
          valA = a.tfidf;
          valB = b.tfidf;
          break;
        default:
          return 0;
      }
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return features;
  }, [summary.top_features, searchQuery, filterType, sortField, sortOrder]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="inline opacity-40 ml-1 w-3.5 h-3.5" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="inline ml-1 w-3.5 h-3.5 text-primary" />
    ) : (
      <ArrowDown className="inline ml-1 w-3.5 h-3.5 text-primary" />
    );
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(
      new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
    );
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark
          key={i}
          className="bg-yellow-300 dark:bg-yellow-700 px-0.5 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
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

  if (loading) return <LoadingSkeleton />;

  const unigramCount = summary.top_features.filter(
    (f) => f.type === "unigram",
  ).length;
  const bigramCount = summary.top_features.filter(
    (f) => f.type === "bigram",
  ).length;
  const maxTfidf = summary.stats?.max_tfidf || 1;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="font-bold text-foreground text-3xl">
              Analisis TF-IDF
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Term Frequency - Inverse Document Frequency
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={summary.top_features.length === 0}
            >
              <Download className="mr-2 w-4 h-4" />
              Export CSV
            </Button>
            <Button onClick={handleRunTfidf} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Play className="mr-2 w-4 h-4" />
                  Jalankan TF-IDF
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ERROR DISPLAY */}
        <ErrorDisplay />

        {/* Partial error warnings */}
        {summaryError && !errors.length && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="flex-1 text-amber-800 dark:text-amber-200 text-sm">
              Gagal memuat summary TF-IDF.
            </p>
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              variant="outline"
              size="sm"
              className="gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Muat Ulang
            </Button>
          </div>
        )}
        {wordcloudError && !errors.length && !summaryError && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="flex-1 text-amber-800 dark:text-amber-200 text-sm">
              Gagal memuat wordcloud. Data tabel tetap tersedia.
            </p>
            <Button
              onClick={() => {
                setWordcloudError(false);
                fetchWordcloud();
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

        {/* Stat Cards */}
        <div className="gap-3 grid grid-cols-2 lg:grid-cols-5">
          <Card className="hover:shadow-md border transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5 min-w-0">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Total Fitur
                  </p>
                  <p className="font-bold tabular-nums text-foreground text-xl">
                    {summary.total_features.toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {unigramCount} uni + {bigramCount} bi
                  </p>
                </div>
                <div className="bg-primary/10 ml-2 p-2 rounded-lg shrink-0">
                  <Hash className="w-4 h-4 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md border transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Mean TF
                    </p>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Rata-rata Term Frequency</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="font-bold tabular-nums text-blue-600 text-xl">
                    {(summary.stats?.mean_tf ?? 0).toFixed(6)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    rata-rata frekuensi
                  </p>
                </div>
                <div className="bg-blue-500/10 ml-2 p-2 rounded-lg shrink-0">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md border transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Mean IDF
                    </p>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          Rata-rata Inverse Document Frequency
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="font-bold tabular-nums text-amber-600 text-xl">
                    {(summary.stats?.mean_idf ?? 0).toFixed(4)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    rata-rata kelangkaan
                  </p>
                </div>
                <div className="bg-amber-500/10 ml-2 p-2 rounded-lg shrink-0">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md border transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5 min-w-0">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Max TF-IDF
                  </p>
                  <p className="font-bold tabular-nums text-violet-600 text-xl">
                    {(summary.stats?.max_tfidf ?? 0).toFixed(4)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    bobot tertinggi
                  </p>
                </div>
                <div className="bg-violet-500/10 ml-2 p-2 rounded-lg shrink-0">
                  <Zap className="w-4 h-4 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md border transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Mean TF-IDF
                    </p>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Rata-rata bobot TF-IDF</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="font-bold tabular-nums text-emerald-600 text-xl">
                    {(summary.stats?.mean_tfidf ?? 0).toFixed(6)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    bobot rata-rata
                  </p>
                </div>
                <div className="bg-emerald-500/10 ml-2 p-2 rounded-lg shrink-0">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="table" className="space-y-4">
          <TabsList>
            <TabsTrigger value="table">
              <BarChart3 className="mr-2 w-4 h-4" />
              TF-IDF Table
            </TabsTrigger>
            <TabsTrigger value="wordcloud">
              <Cloud className="mr-2 w-4 h-4" />
              Word Cloud per Kelas
            </TabsTrigger>
          </TabsList>

          {/* Table Tab */}
          <TabsContent value="table">
            <Card className="border">
              <CardHeader>
                <div className="space-y-4">
                  <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4">
                    <div>
                      <CardTitle className="text-lg">Top Features</CardTitle>
                      <p className="mt-1 text-muted-foreground text-sm">
                        Klik header kolom untuk mengurutkan • TF × IDF = TF-IDF
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <FileText className="mr-1 w-3 h-3" />
                        Unigram: {unigramCount}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <FileText className="mr-1 w-3 h-3" />
                        Bigram: {bigramCount}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex sm:flex-row flex-col gap-3">
                    <div className="relative flex-1">
                      <Search className="top-1/2 left-3 absolute w-4 h-4 text-muted-foreground -translate-y-1/2 transform" />
                      <Input
                        placeholder="Cari kata atau bigram..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="top-1/2 right-3 absolute -translate-y-1/2 transform"
                        >
                          <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Badge
                        variant={filterType === "all" ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setFilterType("all")}
                      >
                        Semua
                      </Badge>
                      <Badge
                        variant={
                          filterType === "unigram" ? "default" : "outline"
                        }
                        className="cursor-pointer"
                        onClick={() => setFilterType("unigram")}
                      >
                        Unigram
                      </Badge>
                      <Badge
                        variant={
                          filterType === "bigram" ? "default" : "outline"
                        }
                        className="cursor-pointer"
                        onClick={() => setFilterType("bigram")}
                      >
                        Bigram
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {summary.top_features.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-16">
                    <div className="bg-violet-100 dark:bg-violet-900/20 p-4 rounded-full">
                      <BarChart3 className="w-12 h-12 text-violet-400" />
                    </div>
                    <div className="space-y-2 text-center">
                      <h3 className="font-semibold text-lg">Belum Ada Data</h3>
                      <p className="max-w-md text-muted-foreground">
                        Belum ada data fitur TF-IDF. Klik tombol di bawah untuk
                        memulai ekstraksi fitur.
                      </p>
                    </div>
                    <Button
                      onClick={handleRunTfidf}
                      disabled={isProcessing}
                      className="gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Memproses...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Jalankan TF-IDF
                        </>
                      )}
                    </Button>
                  </div>
                ) : filteredAndSortedFeatures.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-16">
                    <Search className="w-16 h-16 text-muted-foreground/20" />
                    <p className="text-muted-foreground text-lg">
                      Tidak ada hasil untuk "{searchQuery}"
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setSearchQuery("")}
                    >
                      Reset Pencarian
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead
                            className="w-[50px] font-bold text-center cursor-pointer select-none"
                            onClick={() => handleSort("rank")}
                          >
                            <span className="flex justify-center items-center">
                              # <SortIcon field="rank" />
                            </span>
                          </TableHead>
                          <TableHead
                            className="font-bold cursor-pointer select-none"
                            onClick={() => handleSort("word")}
                          >
                            <span className="flex items-center">
                              Kata <SortIcon field="word" />
                            </span>
                          </TableHead>
                          <TableHead
                            className="w-[80px] font-bold text-center cursor-pointer select-none"
                            onClick={() => handleSort("type")}
                          >
                            <span className="flex justify-center items-center">
                              Tipe <SortIcon field="type" />
                            </span>
                          </TableHead>
                          <TableHead
                            className="w-[110px] font-bold text-right cursor-pointer select-none"
                            onClick={() => handleSort("tf")}
                          >
                            <span className="flex justify-end items-center">
                              TF
                              <SortIcon field="tf" />
                            </span>
                          </TableHead>
                          <TableHead
                            className="w-[110px] font-bold text-right cursor-pointer select-none"
                            onClick={() => handleSort("idf")}
                          >
                            <span className="flex justify-end items-center">
                              IDF
                              <SortIcon field="idf" />
                            </span>
                          </TableHead>
                          <TableHead
                            className="w-[120px] font-bold text-right cursor-pointer select-none"
                            onClick={() => handleSort("tfidf")}
                          >
                            <span className="flex justify-end items-center">
                              TF-IDF
                              <SortIcon field="tfidf" />
                            </span>
                          </TableHead>
                          <TableHead className="w-[180px] font-bold">
                            Bobot Relatif
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAndSortedFeatures.map((item) => {
                          const isBigram = item.type === "bigram";
                          const tfidfPct = (item.tfidf / maxTfidf) * 100;
                          const tfContribution =
                            item.idf > 0
                              ? (item.tf / (item.tf + item.idf)) * 100
                              : 50;
                          const idfContribution = 100 - tfContribution;
                          const isSelected = selectedWord === item.word;
                          return (
                            <TableRow
                              key={`${item.word}-${item.rank}`}
                              className={`hover:bg-muted/30 transition-colors cursor-pointer ${isSelected ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                              onClick={() =>
                                setSelectedWord(isSelected ? null : item.word)
                              }
                            >
                              <TableCell className="text-muted-foreground text-sm text-center">
                                {item.rank}
                              </TableCell>
                              <TableCell>
                                <div className="group flex items-center gap-2">
                                  <span
                                    className={`font-medium text-foreground ${isBigram ? "italic" : ""}`}
                                  >
                                    {highlightText(item.word, searchQuery)}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyWord(item.word);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Salin kata"
                                  >
                                    <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                  </button>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant={isBigram ? "secondary" : "outline"}
                                  className="text-xs"
                                >
                                  {isBigram ? "Bigram" : "Unigram"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col items-end">
                                  <span className="font-mono font-medium text-blue-600 dark:text-blue-400">
                                    {item.tf.toFixed(6)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    frekuensi
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col items-end">
                                  <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
                                    {item.idf.toFixed(4)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {item.idf > 4
                                      ? "⭐ langka"
                                      : item.idf > 2
                                        ? "umum"
                                        : "sering"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col items-end">
                                  <span className="font-mono font-semibold text-violet-600 dark:text-violet-400">
                                    {item.tfidf.toFixed(6)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    TF × IDF
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <Progress
                                      value={tfidfPct}
                                      className="flex-1 h-2"
                                    />
                                    <span className="w-10 tabular-nums text-muted-foreground text-xs text-right">
                                      {tfidfPct.toFixed(0)}%
                                    </span>
                                  </div>
                                  <div className="flex gap-0.5 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className="bg-blue-400 dark:bg-blue-500 transition-all"
                                      style={{ width: `${tfContribution}%` }}
                                      title={`TF: ${tfContribution.toFixed(0)}%`}
                                    />
                                    <div
                                      className="bg-amber-400 dark:bg-amber-500 transition-all"
                                      style={{ width: `${idfContribution}%` }}
                                      title={`IDF: ${idfContribution.toFixed(0)}%`}
                                    />
                                  </div>
                                  <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span className="text-blue-600 dark:text-blue-400">
                                      TF {tfContribution.toFixed(0)}%
                                    </span>
                                    <span className="text-amber-600 dark:text-amber-400">
                                      IDF {idfContribution.toFixed(0)}%
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Word Cloud Tab */}
          <TabsContent value="wordcloud">
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-lg">Word Cloud per Kelas</CardTitle>
                <p className="mt-1 text-muted-foreground text-sm">
                  Visualisasi kata dominan berdasarkan sentimen
                </p>
              </CardHeader>
              <CardContent>
                {wordcloudLoading ? (
                  <div className="flex justify-center items-center py-16">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <span className="ml-3 text-muted-foreground">
                      Memuat word cloud...
                    </span>
                  </div>
                ) : Object.keys(wordcloud).length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-16">
                    <div className="bg-sky-100 dark:bg-sky-900/20 p-4 rounded-full">
                      <Cloud className="w-12 h-12 text-sky-400" />
                    </div>
                    <div className="space-y-2 text-center">
                      <h3 className="font-semibold text-lg">Belum Ada Data</h3>
                      <p className="max-w-md text-muted-foreground">
                        Jalankan TF-IDF terlebih dahulu untuk melihat word
                        cloud.
                      </p>
                    </div>
                    <Button
                      onClick={handleRunTfidf}
                      disabled={isProcessing}
                      className="gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Memproses...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Jalankan TF-IDF
                        </>
                      )}
                    </Button>
                    {wordcloudError && (
                      <p className="text-red-500 text-xs">
                        Gagal memuat wordcloud.{" "}
                        <button
                          onClick={() => {
                            setWordcloudError(false);
                            fetchWordcloud();
                          }}
                          className="underline"
                        >
                          Coba lagi
                        </button>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="gap-6 grid grid-cols-1 md:grid-cols-3">
                    {(["positive", "neutral", "negative"] as const).map(
                      (label) => {
                        const words = wordcloud[label] || [];
                        const config = wordcloudConfig[label];
                        return (
                          <div
                            key={label}
                            className={`${config.bg} p-4 rounded-xl border`}
                          >
                            <h3
                              className={`font-semibold mb-3 text-center ${config.colors}`}
                            >
                              {config.title}
                              <span className="opacity-70 ml-1 font-normal text-xs">
                                ({words.length} kata)
                              </span>
                            </h3>
                            <div className="flex flex-wrap justify-center content-start gap-1.5 min-h-[200px]">
                              {words.length === 0 ? (
                                <p className="mt-8 text-muted-foreground text-sm">
                                  Belum ada data
                                </p>
                              ) : (
                                words.map((item, i) => {
                                  const isBigram = item.word.includes(" ");
                                  return (
                                    <span
                                      key={i}
                                      className={`${config.colors} hover:scale-125 transition-all duration-200 cursor-pointer rounded px-1.5 py-0.5 hover:bg-white/50 dark:hover:bg-gray-800/50 ${isBigram ? "border-b-2 border-dashed border-current" : ""}`}
                                      style={{
                                        fontSize: `${Math.max(12, 26 - i * 0.25)}px`,
                                        opacity: Math.max(0.3, 1 - i * 0.012),
                                        fontWeight: i < 10 ? "bold" : "normal",
                                      }}
                                      title={`Score: ${item.score.toFixed(4)}${isBigram ? " (bigram)" : ""}`}
                                      onClick={() => handleCopyWord(item.word)}
                                    >
                                      {item.word}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="w-64 h-8" />
        <Skeleton className="w-48 h-4" />
      </div>
      <div className="gap-3 grid grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="w-full h-18" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="w-48 h-6" />
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-64" />
        </CardContent>
      </Card>
    </div>
  );
}
