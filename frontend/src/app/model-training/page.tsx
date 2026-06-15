"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  Bug,
  Calendar,
  Info,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ServerCrash,
  Target,
  TrendingUp,
  WifiOff,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface ExperimentData {
  created_at: string;
  baseline_accuracy: number;
  baseline_f1: number;
  proposed_accuracy: number;
  proposed_f1: number;
  improvement_accuracy: number;
  improvement_f1: number;
  total_samples: number;
  feature_count: number;
  model_type: string;
  cv_folds: number;
  [key: string]: unknown;
}

interface ErrorDetail {
  type: "network" | "server" | "data" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
  endpoint?: string;
  timestamp: Date;
  rawError?: string;
}

export default function ModelingPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [experiments, setExperiments] = useState<ExperimentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasGridSearch, setHasGridSearch] = useState(false);
  const [alphaInfo, setAlphaInfo] = useState({ baseline: 1.0, proposed: 1.0 });

  // Error states
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [alphaError, setAlphaError] = useState(false);

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
    setHistoryError(false);
    setAlphaError(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchHistory = async () => {
    const endpoint = "http://localhost:8000/api/modeling/history";

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
          serverMessage = `HTTP ${statusCode} - ${res.statusText}`;
        }

        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `Gagal mengambil histori modeling (${statusCode})`,
          statusCode,
          endpoint,
          timestamp: new Date(),
          rawError: serverMessage,
        });
        setHistoryError(true);
        return;
      }

      const result = await res.json();
      if (result.status === "success") {
        setExperiments(result.data || []);
        setHistoryError(false);
      } else {
        addError({
          type: "data",
          message: "Format data histori tidak sesuai",
          endpoint,
          timestamp: new Date(),
          rawError: JSON.stringify(result),
        });
        setHistoryError(true);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        addError({
          type: "timeout",
          message: "Timeout mengambil histori (15 detik)",
          endpoint,
          timestamp: new Date(),
        });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        addError({
          type: "network",
          message: "Gagal terhubung ke server saat mengambil histori",
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
      setHistoryError(true);
    }
  };

  const fetchAlphaInfo = async () => {
    const gridSearchEndpoint = "http://localhost:8000/api/modeling/grid-search";
    const paramsEndpoint =
      "http://localhost:8000/api/evaluation/confusion-matrix";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(gridSearchEndpoint, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        setHasGridSearch(false);
        return;
      }

      const result = await res.json();
      if (result.status === "success") {
        setHasGridSearch(true);

        // Ambil alpha dari best_params
        try {
          const paramsController = new AbortController();
          const paramsTimeoutId = setTimeout(
            () => paramsController.abort(),
            10000,
          );

          const paramsRes = await fetch(paramsEndpoint, {
            signal: paramsController.signal,
            headers: { Accept: "application/json" },
          });

          clearTimeout(paramsTimeoutId);

          if (paramsRes.ok) {
            const paramsData = await paramsRes.json();
            if (paramsData.status === "success" && paramsData.data?.config) {
              setAlphaInfo({
                baseline: paramsData.data.config.alpha_baseline || 1.0,
                proposed: paramsData.data.config.alpha_proposed || 1.0,
              });
            }
          } else {
            setAlphaError(true);
          }
        } catch {
          setAlphaError(true);
        }
      } else {
        setHasGridSearch(false);
      }
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setAlphaError(true);
      }
      setHasGridSearch(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    const init = async () => {
      setLoading(true);
      clearErrors();

      await fetchHistory();
      await fetchAlphaInfo();

      if (mountedRef.current) {
        setLoading(false);
      }
    };

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRunModeling = async () => {
    setIsProcessing(true);
    clearErrors();
    const endpoint = "http://localhost:8000/api/pipeline/cnb_classification";

    const toastId = toast.loading("Menjalankan training CNB...", {
      description: "Proses ini mungkin memakan waktu beberapa saat",
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 menit untuk training

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
          serverMessage = `HTTP ${statusCode} - ${res.statusText}`;
        }

        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `Training gagal (${statusCode})`,
          statusCode,
          endpoint,
          timestamp: new Date(),
          rawError: serverMessage,
        });

        if (statusCode === 404) {
          toast.error("Endpoint training tidak ditemukan", {
            id: toastId,
            description: "Pastikan API pipeline tersedia",
          });
        } else if (statusCode === 422) {
          toast.error("Data belum lengkap", {
            id: toastId,
            description:
              serverMessage ||
              "Pastikan semua pipeline sebelumnya sudah dijalankan",
          });
        } else if (statusCode === 409) {
          toast.warning("Training sudah berjalan", {
            id: toastId,
            description: "Tunggu proses sebelumnya selesai",
          });
        } else {
          toast.error("Training gagal!", {
            id: toastId,
            description: serverMessage,
          });
        }
        setIsProcessing(false);
        return;
      }

      const result = await res.json();

      if (result.status === "success") {
        toast.success("Training berhasil!", {
          id: toastId,
          description: "Model CNB telah dilatih dengan 10-Fold CV",
        });
        clearErrors();
        retryCountRef.current = 0;

        // Delay sebentar lalu fetch ulang
        setTimeout(async () => {
          if (mountedRef.current) {
            await fetchHistory();
            await fetchAlphaInfo();
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
        toast.error("Training gagal!", {
          id: toastId,
          description: result.message || "Status respons tidak dikenal",
        });
        setIsProcessing(false);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        addError({
          type: "timeout",
          message: "Training timeout (10 menit) - Proses terlalu lama",
          endpoint,
          timestamp: new Date(),
          rawError: err.message,
        });
        toast.warning("Training timeout", {
          id: toastId,
          description:
            "Proses terlalu lama. Mungkin masih berjalan di background.",
        });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        addError({
          type: "network",
          message: "Gagal terhubung ke server saat training",
          endpoint,
          timestamp: new Date(),
          rawError: err.message,
        });
        toast.error("Gagal terhubung ke server", {
          id: toastId,
          description: "Pastikan server backend berjalan",
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
        toast.error("Gagal menjalankan training", {
          id: toastId,
          description:
            err instanceof Error ? err.message : "Kesalahan tidak diketahui",
        });
      }
      setIsProcessing(false);
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
    setLoading(true);

    try {
      await fetchHistory();
      await fetchAlphaInfo();
    } catch {
      // Error sudah di-handle
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRetrying(false);
      }
    }
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

    const getErrorTitle = () => {
      if (hasNetworkError) return "Koneksi Gagal";
      if (hasTimeout) return "Request Timeout";
      if (hasServerError) return "Server Error";
      return "Error";
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
                <h3 className="font-semibold text-sm">{getErrorTitle()}</h3>
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
  if (loading) return <LoadingSkeleton />;

  const latestExp = experiments[0];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Modeling</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Training Complement Naive Bayes dengan Grid Search + 10-Fold CV
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleRunModeling}
            disabled={isProcessing}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Training...
              </>
            ) : (
              <>
                <Play className="mr-2 w-4 h-4" />
                Jalankan Training
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ERROR DISPLAY */}
      <ErrorDisplay />

      {/* Warning banner untuk partial error */}
      {!errors.length && (historyError || alphaError) && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="flex-1 text-amber-800 dark:text-amber-200 text-sm">
            {historyError && "Gagal memuat histori. "}
            {alphaError && "Gagal memuat informasi alpha. "}
            Beberapa data mungkin tidak ditampilkan.
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

      {latestExp ? (
        <div className="space-y-6">
          {/* SUB HEADER */}
          <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-foreground text-2xl">
                Hasil Training Terakhir
              </h2>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(latestExp.created_at).toLocaleString("id-ID")}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {hasGridSearch && (
                <Link href="/model-training/search-alpha">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-300 dark:border-amber-700"
                  >
                    <Search className="mr-2 w-4 h-4" />
                    Detail Alpha
                  </Button>
                </Link>
              )}
              <Link href="/evaluation">
                <Button variant="outline" size="sm">
                  Lihat Evaluasi →
                </Button>
              </Link>
            </div>
          </div>

          {/* BASELINE vs PROPOSED CARDS */}
          <div>
            <h3 className="mb-4 font-semibold text-foreground text-lg">
              Perbandingan Baseline vs Proposed
            </h3>
            <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
              {/* BASELINE CARD */}
              <Card className="bg-gray-50 dark:bg-gray-950/30 border-2 border-gray-300 dark:border-gray-600">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <Badge variant="secondary" className="px-3 py-1 text-sm">
                      BASELINE
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      TF-IDF Only
                    </span>
                  </div>
                  <CardTitle className="mt-2 text-lg">
                    Tanpa InSet Lexicon
                  </CardTitle>
                  <p className="text-muted-foreground text-xs">
                    α = {alphaInfo.baseline.toFixed(2)} • CNB
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="gap-3 grid grid-cols-2">
                    <div className="bg-white dark:bg-gray-900 p-3 border rounded-lg text-center">
                      <p className="mb-1 text-muted-foreground text-xs">
                        Accuracy
                      </p>
                      <p className="font-bold text-gray-600 dark:text-gray-400 text-2xl">
                        {((latestExp.baseline_accuracy || 0) * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 p-3 border rounded-lg text-center">
                      <p className="mb-1 text-muted-foreground text-xs">
                        F1-Score
                      </p>
                      <p className="font-bold text-gray-600 dark:text-gray-400 text-2xl">
                        {((latestExp.baseline_f1 || 0) * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* PROPOSED CARD */}
              <Card className="bg-violet-50 dark:bg-violet-950/20 border-2 border-violet-300 dark:border-violet-700">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <Badge className="bg-violet-100 dark:bg-violet-900/50 px-3 py-1 text-violet-700 dark:text-violet-400 text-sm">
                      PROPOSED
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      TF-IDF + InSet
                    </span>
                  </div>
                  <CardTitle className="mt-2 text-lg">
                    Dengan InSet Lexicon
                  </CardTitle>
                  <p className="text-muted-foreground text-xs">
                    α = {alphaInfo.proposed.toFixed(2)} • CNB
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="gap-3 grid grid-cols-2">
                    <div className="bg-white dark:bg-gray-900 p-3 border border-violet-200 dark:border-violet-800 rounded-lg text-center">
                      <p className="mb-1 text-muted-foreground text-xs">
                        Accuracy
                      </p>
                      <p className="font-bold text-violet-600 text-2xl">
                        {((latestExp.proposed_accuracy || 0) * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 p-3 border border-violet-200 dark:border-violet-800 rounded-lg text-center">
                      <p className="mb-1 text-muted-foreground text-xs">
                        F1-Score
                      </p>
                      <p className="font-bold text-sky-600 text-2xl">
                        {((latestExp.proposed_f1 || 0) * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* IMPROVEMENT BANNER */}
          <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-6">
              <div className="flex flex-wrap justify-center items-center gap-6">
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Baseline Acc</p>
                  <p className="font-bold text-gray-500 text-2xl">
                    {((latestExp.baseline_accuracy || 0) * 100).toFixed(2)}%
                  </p>
                </div>
                <ArrowRight className="w-8 h-8 text-muted-foreground" />
                <div className="bg-white dark:bg-gray-900 shadow-lg px-6 py-3 border-2 border-emerald-300 dark:border-emerald-700 rounded-full text-center">
                  <TrendingUp className="mx-auto mb-1 w-6 h-6 text-emerald-600" />
                  <p className="font-bold text-emerald-600 text-2xl">
                    +{(latestExp.improvement_accuracy || 0).toFixed(2)}%
                  </p>
                  <p className="text-muted-foreground text-xs">Improvement</p>
                </div>
                <ArrowRight className="w-8 h-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Proposed Acc</p>
                  <p className="font-bold text-violet-600 text-2xl">
                    {((latestExp.proposed_accuracy || 0) * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="gap-4 grid grid-cols-2 mt-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Accuracy Δ</span>
                    <span className="font-bold text-emerald-600">
                      +{(latestExp.improvement_accuracy || 0).toFixed(2)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, latestExp.improvement_accuracy || 0)}
                    className="[&>div]:bg-emerald-500 h-2"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">F1-Score Δ</span>
                    <span className="font-bold text-sky-600">
                      {(latestExp.improvement_f1 || 0).toFixed(2)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, latestExp.improvement_f1 || 0)}
                    className="[&>div]:bg-sky-500 h-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* INFO CARDS */}
          <div className="gap-3 grid grid-cols-2 lg:grid-cols-4">
            <InfoCard
              icon={<Target className="w-4 h-4 text-emerald-600" />}
              label="Samples"
              value={latestExp.total_samples}
            />
            <InfoCard
              icon={<Layers className="w-4 h-4 text-amber-600" />}
              label="Features"
              value={latestExp.feature_count}
            />
            <InfoCard
              icon={<Brain className="w-4 h-4 text-violet-600" />}
              label="Model"
              value={latestExp.model_type || "CNB"}
            />
            <InfoCard
              icon={<Activity className="w-4 h-4 text-sky-600" />}
              label="CV Folds"
              value={`${latestExp.cv_folds || 10}-Fold`}
            />
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-violet-100 dark:bg-violet-900/20 p-4 rounded-full">
              <Brain className="w-12 h-12 text-violet-400" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="font-semibold text-lg">Belum Ada Hasil</h3>
              <p className="max-w-md text-muted-foreground">
                Belum ada hasil eksperimen training. Klik tombol di bawah untuk
                memulai training model CNB.
              </p>
            </div>
            <Button
              onClick={handleRunModeling}
              disabled={isProcessing}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Training...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Jalankan Training
                </>
              )}
            </Button>
            {errors.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Periksa error di atas untuk informasi lebih lanjut
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | number;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="bg-muted/50 p-2 rounded-lg shrink-0">{icon}</div>
        <div>
          <p className="font-medium text-muted-foreground text-xs">{label}</p>
          <p className="font-semibold text-foreground">{value || "-"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="w-64 h-8" />
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-32" />
      <div className="gap-3 grid grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
