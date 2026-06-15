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
  Calendar,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  Newspaper,
  RefreshCw,
  ServerCrash,
  TrendingUp,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface NewsItem {
  guid: string;
  title: string;
  url: string;
  portal_name: string;
  published_at: string | null;
  scraped_at: string | null;
}

// Error detail interface
interface ErrorDetail {
  type: "network" | "server" | "data" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
  endpoint?: string;
  timestamp: Date;
  rawError?: string;
}

export default function NewsDataPage() {
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  // Error states
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);

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
    };
  }, []);

  // Fungsi fetch data dengan error handling
  const fetchNewsData = useCallback(
    async (page: number, pageSize: number) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const endpoint = `http://localhost:8000/api/news?page=${page}&page_size=${pageSize}`;

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

        // Clear errors on success (hanya untuk load pertama)
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
  } = useLoadMore<NewsItem>(fetchNewsData);

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

  // Hitung statistik
  const portals = useMemo(
    () => [...new Set(data.map((item) => item.portal_name))],
    [data],
  );

  const tanggalTerbaru = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((latest, item) => {
      if (!item.published_at) return latest;
      const d = new Date(item.published_at);
      return d > latest ? d : latest;
    }, new Date(0));
  }, [data]);

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

    const getErrorTitle = () => {
      if (hasNetworkError) return "Koneksi Gagal";
      if (hasTimeout) return "Request Timeout";
      if (hasServerError) return "Server Error";
      return "Error";
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
                <h3 className="font-semibold text-sm">{getErrorTitle()}</h3>
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
          <h1 className="font-bold text-foreground text-3xl">Data Berita</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Data mentah hasil scraping sebelum diproses
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="px-3 py-1.5 text-sm">
            <Newspaper className="mr-1.5 w-3.5 h-3.5" />
            {total.toLocaleString()} Berita
          </Badge>
        </div>
      </div>

      {/* ERROR DISPLAY - Ditampilkan di konten */}
      <ErrorDisplay />

      {/* Stats Cards - 4 Kolom */}
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        {/* Total Data */}
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
                <p className="text-muted-foreground text-xs">
                  berita terkumpul
                </p>
              </div>
              <div className="bg-primary/10 p-2.5 rounded-xl">
                <Newspaper className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portal */}
        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Portal
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {portals.length}
                </p>
                <p className="text-muted-foreground text-xs">sumber berita</p>
              </div>
              <div className="bg-sky-500/10 p-2.5 rounded-xl">
                <Globe className="w-5 h-5 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Terbaru */}
        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Data Terbaru
                </p>
                <p className="font-bold text-foreground text-lg leading-tight">
                  {tanggalTerbaru && tanggalTerbaru.getTime() > 0
                    ? tanggalTerbaru.toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "-"}
                </p>
                <p className="text-muted-foreground text-xs">
                  publikasi terakhir
                </p>
              </div>
              <div className="bg-emerald-500/10 p-2.5 rounded-xl">
                <Calendar className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ditampilkan */}
        <Card className="hover:shadow-md border transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Ditampilkan
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {data.length.toLocaleString()}
                </p>
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Clock className="w-3 h-3" />
                  <span>dari {total.toLocaleString()} total</span>
                </div>
              </div>
              <div className="bg-amber-500/10 p-2.5 rounded-xl">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/50">
                  <TableHead className="w-[80px] font-bold">No</TableHead>
                  <TableHead className="min-w-[350px] font-bold">
                    Judul Berita
                  </TableHead>
                  <TableHead className="w-[140px] font-bold">Portal</TableHead>
                  <TableHead className="w-[160px] font-bold">
                    Tanggal Publikasi
                  </TableHead>
                  <TableHead className="w-[140px] font-bold text-center">
                    Aksi
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Newspaper className="w-12 h-12 text-muted-foreground/30" />
                        <p className="text-muted-foreground">
                          Belum ada data berita
                        </p>
                        {errors.length === 0 && (
                          <p className="text-muted-foreground text-xs">
                            Jalankan scraping untuk mengumpulkan data berita
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item, index) => (
                    <TableRow
                      key={item.guid}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium text-muted-foreground">
                        {(pagination.page - 1) * pagination.page_size +
                          index +
                          1}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5 max-w-[350px]">
                          <p className="font-medium text-foreground line-clamp-2 leading-snug">
                            {item.title}
                          </p>
                          <Badge
                            variant="secondary"
                            className="font-normal text-xs"
                          >
                            {item.guid.substring(0, 8)}...
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-medium">
                          <Globe className="mr-1 w-3 h-3" />
                          {item.portal_name}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-sm whitespace-nowrap">
                            {item.published_at
                              ? new Date(item.published_at).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center items-center gap-1">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="mr-1.5 w-4 h-4" />
                              Buka
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedItem(item)}
                          >
                            <Info className="mr-1.5 w-4 h-4" />
                            Detail
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-xl">
              Detail Berita
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6 py-4">
              {/* Judul */}
              <div className="space-y-2">
                <label className="font-medium text-muted-foreground text-sm uppercase tracking-wider">
                  Judul Berita
                </label>
                <p className="font-semibold text-foreground text-lg">
                  {selectedItem.title}
                </p>
              </div>

              {/* Grid Info */}
              <div className="gap-4 grid grid-cols-1 md:grid-cols-2">
                {/* GUID */}
                <div className="space-y-1">
                  <label className="font-medium text-muted-foreground text-sm">
                    GUID
                  </label>
                  <p className="bg-muted p-2 rounded-md font-mono text-sm break-all">
                    {selectedItem.guid}
                  </p>
                </div>

                {/* Portal */}
                <div className="space-y-1">
                  <label className="font-medium text-muted-foreground text-sm">
                    Portal
                  </label>
                  <div>
                    <Badge variant="outline" className="font-medium">
                      <Globe className="mr-1 w-3 h-3" />
                      {selectedItem.portal_name}
                    </Badge>
                  </div>
                </div>

                {/* URL */}
                <div className="space-y-1 md:col-span-2">
                  <label className="font-medium text-muted-foreground text-sm">
                    URL Berita
                  </label>
                  <a
                    href={selectedItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary text-sm hover:underline break-all"
                  >
                    {selectedItem.url}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>

                {/* Tanggal Publikasi */}
                <div className="space-y-1">
                  <label className="font-medium text-muted-foreground text-sm">
                    Tanggal Publikasi
                  </label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      {selectedItem.published_at
                        ? new Date(
                            selectedItem.published_at,
                          ).toLocaleDateString("id-ID", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Tidak tersedia"}
                    </p>
                  </div>
                </div>

                {/* Tanggal Scraping */}
                <div className="space-y-1">
                  <label className="font-medium text-muted-foreground text-sm">
                    Tanggal Scraping
                  </label>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      {selectedItem.scraped_at
                        ? new Date(selectedItem.scraped_at).toLocaleDateString(
                            "id-ID",
                            {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            },
                          )
                        : "Tidak tersedia"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedItem(null)}>
                  Tutup
                </Button>
                <a
                  href={selectedItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button>
                    <ExternalLink className="mr-2 w-4 h-4" />
                    Buka Berita
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {data.length > 0 && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loading}
          hasMore={hasMore}
          currentCount={data.length}
          totalCount={total}
        />
      )}
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
          <div className="space-y-4 p-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-8 h-8" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-3/4 h-4" />
                  <Skeleton className="w-1/2 h-3" />
                </div>
                <Skeleton className="w-20 h-6" />
                <Skeleton className="w-24 h-4" />
                <Skeleton className="w-32 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
