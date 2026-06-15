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
  Eye,
  FileText,
  Loader2,
  Minus,
  Play,
  Scale,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
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
            },
          };
        }

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
    try {
      const res = await fetch(
        "http://localhost:8000/api/data/sentistrength/stats",
      );
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
      setStatsError(true);
    }
  }, []);

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
  }, []); // eslint-disable-line

  // ✅ RUN SENTISTRENGTH — tanpa polling
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
      if (result.status === "success") {
        toast.success("SentiStrength berhasil!", {
          id: toastId,
          description: result.message || "Data telah dilabeli",
        });
        reset();
        setTimeout(async () => {
          try {
            await loadMore();
            if (mountedRef.current) fetchStats();
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
      reset();
      await loadMore();
      if (mountedRef.current) fetchStats();
    } catch {
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

  if (initialLoading) return <LoadingSkeleton />;

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
