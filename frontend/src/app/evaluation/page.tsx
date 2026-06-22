// FILE: app/evaluation/page.tsx (atau sesuai path frontend Anda)

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bug,
  Calculator,
  Calendar,
  Cpu,
  Database,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  ServerCrash,
  TrendingUp,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ============================================================
// INTERFACES
// ============================================================
interface FoldDetail {
  fold: number;
  train_size?: number;
  test_size?: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  matrix: number[][];
}

interface ConfusionMatrixDetail {
  class_names: string[];
  total_samples?: number; // ✅ Tambahkan ini
  config: {
    alpha_baseline: number;
    alpha_proposed: number;
    random_state: number;
    cv_folds: number;
    grid_search_scoring?: string;
  };
  baseline: {
    folds: FoldDetail[];
    best: FoldDetail | null;
    worst: FoldDetail | null;
    average: {
      accuracy: number;
      accuracy_std: number;
      precision: number;
      precision_std: number;
      recall: number;
      recall_std: number;
      f1_score: number;
      f1_score_std: number;
    };
    overall: {
      accuracy: number;
      precision: number;
      recall: number;
      f1_score: number;
      matrix: number[][];
    };
  };
  proposed: {
    folds: FoldDetail[];
    best: FoldDetail | null;
    worst: FoldDetail | null;
    average: {
      accuracy: number;
      accuracy_std: number;
      precision: number;
      precision_std: number;
      recall: number;
      recall_std: number;
      f1_score: number;
      f1_score_std: number;
    };
    overall: {
      accuracy: number;
      precision: number;
      recall: number;
      f1_score: number;
      matrix: number[][];
    };
  };
  improvement: {
    accuracy: number;
    f1_score: number;
    precision?: number;
    recall?: number;
  };
}

interface TTestMetric {
  baseline_mean: number;
  proposed_mean: number;
  mean_diff: number;
  t_statistic: number;
  p_value: number;
  significant: boolean;
  cohens_d: number;
  interpretation: string;
}

interface TTestResult {
  accuracy: TTestMetric;
  precision: TTestMetric;
  recall: TTestMetric;
  f1_score: TTestMetric;
  alpha: number;
  description: string;
}

interface ErrorDetail {
  type: "network" | "server" | "data" | "timeout" | "unknown";
  message: string;
  statusCode?: number;
  endpoint?: string;
  timestamp: Date;
  rawError?: string;
}

// ============================================================
// HELPERS
// ============================================================
const pct = (val: number | undefined) => ((val || 0) * 100).toFixed(2);

const getClassMetrics = (matrix: number[][], idx: number) => {
  const tp = matrix[idx][idx];
  const fp = matrix.reduce(
    (sum, row, i) => sum + (i !== idx ? row[idx] : 0),
    0,
  );
  const fn = matrix[idx].reduce(
    (sum, cell, j) => sum + (j !== idx ? cell : 0),
    0,
  );
  const support = matrix[idx].reduce((a, b) => a + b, 0);
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = (2 * precision * recall) / (precision + recall) || 0;
  return { tp, fp, fn, support, precision, recall, f1 };
};

const getBestWorstClass = (matrix: number[][], classNames: string[]) => {
  const f1s = classNames.map((_, idx) => getClassMetrics(matrix, idx).f1);
  const bestIdx = f1s.indexOf(Math.max(...f1s));
  const worstIdx = f1s.indexOf(Math.min(...f1s));
  return { bestIdx, worstIdx, bestF1: f1s[bestIdx], worstF1: f1s[worstIdx] };
};

// ============================================================
// COMPONENT
// ============================================================
export default function EvaluationPage() {
  const [loading, setLoading] = useState(true);
  const [cmDetail, setCmDetail] = useState<ConfusionMatrixDetail | null>(null);
  const [ttest, setTtest] = useState<TTestResult | null>(null);

  // Error states
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [partialError, setPartialError] = useState(false);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const mountedRef = useRef(true);

  // ✅ Gunakan state untuk tracking initial load
  const [needInitialLoad, setNeedInitialLoad] = useState(true);

  const addError = useCallback((error: ErrorDetail) => {
    setErrors((prev) => [...prev, error]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
    setPartialError(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = async () => {
    console.log("[Evaluation] Fetching data...");
    setLoading(true);
    clearErrors();

    const cmEndpoint = "http://localhost:8000/api/evaluation/confusion-matrix";
    const ttestEndpoint = "http://localhost:8000/api/evaluation/ttest";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const [cmRes, ttestRes] = await Promise.all([
        fetch(cmEndpoint, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        }),
        fetch(ttestEndpoint, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        }),
      ]);

      clearTimeout(timeoutId);

      console.log(
        `[Evaluation] CM response: ${cmRes.status}, TTest response: ${ttestRes.status}`,
      );

      // Handle CM response
      if (!cmRes.ok) {
        const statusCode = cmRes.status;
        let serverMessage = "";
        try {
          const errorData = await cmRes.json();
          serverMessage =
            errorData.message || errorData.detail || JSON.stringify(errorData);
        } catch {
          serverMessage = `HTTP ${statusCode} - ${cmRes.statusText}`;
        }
        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `Gagal mengambil confusion matrix (${statusCode})`,
          statusCode,
          endpoint: cmEndpoint,
          timestamp: new Date(),
          rawError: serverMessage,
        });
      } else {
        const cmData = await cmRes.json();
        console.log(
          `[Evaluation] CM data received: ${cmData.data?.class_names?.length || 0} classes`,
        );
        if (cmData.status === "success") {
          setCmDetail(cmData.data);
        } else {
          addError({
            type: "data",
            message: "Format data confusion matrix tidak sesuai",
            endpoint: cmEndpoint,
            timestamp: new Date(),
            rawError: JSON.stringify(cmData),
          });
        }
      }

      // Handle TTest response
      if (!ttestRes.ok) {
        const statusCode = ttestRes.status;
        let serverMessage = "";
        try {
          const errorData = await ttestRes.json();
          serverMessage =
            errorData.message || errorData.detail || JSON.stringify(errorData);
        } catch {
          serverMessage = `HTTP ${statusCode} - ${ttestRes.statusText}`;
        }
        addError({
          type: statusCode >= 500 ? "server" : "data",
          message: `Gagal mengambil uji statistik (${statusCode})`,
          statusCode,
          endpoint: ttestEndpoint,
          timestamp: new Date(),
          rawError: serverMessage,
        });
        setPartialError(true);
      } else {
        const ttestData = await ttestRes.json();
        console.log(
          `[Evaluation] TTest data received: ${ttestData.data ? "yes" : "no"}`,
        );
        if (ttestData.status === "success") {
          setTtest(ttestData.data);
        } else {
          setPartialError(true);
        }
      }

      retryCountRef.current = 0;
      console.log("[Evaluation] Data fetch completed");
    } catch (err: unknown) {
      console.error("[Evaluation] Fetch error:", err);
      if (err instanceof DOMException && err.name === "AbortError") {
        addError({
          type: "timeout",
          message: "Request timeout (20 detik) - Server tidak merespons",
          endpoint: cmEndpoint,
          timestamp: new Date(),
          rawError: err.message,
        });
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        addError({
          type: "network",
          message: "Gagal terhubung ke server - Server mungkin tidak berjalan",
          endpoint: cmEndpoint,
          timestamp: new Date(),
          rawError: `${err.message}. Pastikan server berjalan di http://localhost:8000`,
        });
      } else {
        addError({
          type: "unknown",
          message:
            err instanceof Error ? err.message : "Kesalahan tidak diketahui",
          endpoint: cmEndpoint,
          timestamp: new Date(),
          rawError: err instanceof Error ? err.stack : String(err),
        });
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        console.log("[Evaluation] Loading set to false");
      }
    }
  };

  // ✅ Initial load dengan needInitialLoad state
  useEffect(() => {
    if (needInitialLoad) {
      console.log("[EvaluationPage] Triggering initial load via useEffect");
      const init = async () => {
        await fetchData();
        setNeedInitialLoad(false);
        console.log("[EvaluationPage] Initial load completed");
      };
      init();
    }
  }, [needInitialLoad]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = async () => {
    if (retryCountRef.current >= MAX_RETRIES) return;
    setIsRetrying(true);
    retryCountRef.current++;
    console.log("[Evaluation Retry] Reloading data...");
    await fetchData();
    if (mountedRef.current) {
      setIsRetrying(false);
      console.log("[Evaluation Retry] Completed");
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

  // Debug render state
  console.log("[EvaluationPage] Render:", {
    loading,
    hasData: !!cmDetail,
    hasTTest: !!ttest,
    needInitialLoad,
    errorsCount: errors.length,
  });

  // ============================================================
  // RENDER: LOADING STATE
  // ============================================================
  if (loading) {
    console.log("[EvaluationPage] Rendering LoadingSkeleton");
    return <LoadingSkeleton />;
  }

  // ============================================================
  // RENDER: FULL ERROR STATE
  // ============================================================
  if (!cmDetail && errors.length > 0) {
    console.log("[EvaluationPage] Rendering full error state");
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Evaluasi Model</h1>
          <p className="mt-2 text-muted-foreground">
            Analisis perbandingan performa model
          </p>
        </div>
        <ErrorDisplay />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-red-100 dark:bg-red-900/20 p-4 rounded-full">
              <AlertCircle className="w-12 h-12 text-red-400" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="font-semibold text-lg">Gagal Memuat Data</h3>
              <p className="max-w-md text-muted-foreground">
                Data evaluasi tidak dapat dimuat. Pastikan server berjalan dan
                training sudah dilakukan.
              </p>
            </div>
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              variant="default"
              className="gap-2"
            >
              {isRetrying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // RENDER: EMPTY STATE
  // ============================================================
  if (!cmDetail) {
    console.log("[EvaluationPage] Rendering empty state");
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Evaluasi Model</h1>
          <p className="mt-2 text-muted-foreground">
            Analisis perbandingan performa model
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-violet-100 dark:bg-violet-900/20 p-4 rounded-full">
              <BarChart3 className="w-12 h-12 text-violet-400" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="font-semibold text-lg">Belum Ada Data Evaluasi</h3>
              <p className="max-w-md text-muted-foreground">
                Jalankan training model terlebih dahulu untuk melihat hasil
                evaluasi.
              </p>
            </div>
            <Button onClick={handleRetry} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  console.log("[EvaluationPage] Rendering main content");

  const classLabels = cmDetail.class_names;

  // ✅ PERBAIKAN: Gunakan total_samples dari API, bukan hitung dari matrix
  const totalSamples = cmDetail.total_samples || 1107;

  const propMatrix = cmDetail.proposed.overall.matrix;
  const baseMatrix = cmDetail.baseline.overall.matrix;
  const { bestIdx: bestClassIdx, worstIdx: worstClassIdx } = getBestWorstClass(
    propMatrix,
    classLabels,
  );
  const minFoldAcc = Math.min(
    ...cmDetail.baseline.folds.map((f) => f.accuracy * 100),
    ...cmDetail.proposed.folds.map((f) => f.accuracy * 100),
  );

  // ✅ Hitung total sampel di overall matrix untuk verifikasi
  const propMatrixTotal = propMatrix.flat().reduce((a, b) => a + b, 0);
  const baseMatrixTotal = baseMatrix.flat().reduce((a, b) => a + b, 0);
  console.log(
    `[EvaluationPage] Matrix totals - Baseline: ${baseMatrixTotal}, Proposed: ${propMatrixTotal}`,
  );

  // ============================================================
  // SUB-COMPONENTS
  // ============================================================
  const CMTable = ({
    matrix,
    labels,
  }: {
    matrix: number[][];
    labels: string[];
  }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead></TableHead>
          {labels.map((l, i) => (
            <TableHead key={i} className="text-xs text-center">
              Pred {l}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {matrix.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="font-medium text-xs">
              Actual {labels[i]}
            </TableCell>
            {row.map((cell, j) => (
              <TableCell key={j} className="text-center">
                <Badge
                  variant="outline"
                  className={
                    i === j
                      ? "bg-emerald-100 dark:bg-emerald-900/50 min-w-10 font-mono text-black"
                      : "min-w-10 font-mono"
                  }
                >
                  {cell}
                </Badge>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const MetricRow = ({
    label,
    baseVal,
    baseStd,
    propVal,
    propStd,
    improvement,
  }: {
    label: string;
    baseVal: number;
    baseStd: number;
    propVal: number;
    propStd: number;
    improvement: number;
  }) => (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="font-medium text-muted-foreground text-sm">
          {label}
        </span>
        <Badge
          className={
            improvement > 0
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }
        >
          {improvement > 0 ? "+" : ""}
          {improvement.toFixed(2)}%
        </Badge>
      </div>
      <div className="gap-4 grid grid-cols-2">
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Baseline</span>
            <span className="font-mono text-gray-500">{pct(baseVal)}%</span>
          </div>
          <Progress
            value={baseVal * 100}
            className="bg-gray-200 [&>div]:bg-gray-400 h-1.5"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Proposed</span>
            <span className="font-mono font-semibold text-violet-600">
              {pct(propVal)}%
            </span>
          </div>
          <Progress
            value={propVal * 100}
            className="[&>div]:bg-violet-500 h-1.5"
          />
        </div>
      </div>
    </div>
  );

  const ClassMetricsTable = ({
    matrix,
    labels,
    variant,
  }: {
    matrix: number[][];
    labels: string[];
    variant: "baseline" | "proposed";
  }) => (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="font-bold">Kelas</TableHead>
          <TableHead className="font-bold text-right">Precision</TableHead>
          <TableHead className="font-bold text-right">Recall</TableHead>
          <TableHead className="font-bold text-right">F1-Score</TableHead>
          <TableHead className="font-bold text-right">Support</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {labels.map((className, idx) => {
          const m = getClassMetrics(matrix, idx);
          const colorClass =
            variant === "proposed"
              ? m.f1 >= 0.8
                ? "text-emerald-600 font-semibold"
                : m.f1 >= 0.6
                  ? "text-amber-600"
                  : "text-red-600"
              : "text-gray-500";
          return (
            <TableRow key={className}>
              <TableCell className="font-medium capitalize">
                {className}
              </TableCell>
              <TableCell
                className={`font-mono text-right ${variant === "baseline" ? "text-gray-500" : colorClass}`}
              >
                {(m.precision * 100).toFixed(2)}%
              </TableCell>
              <TableCell
                className={`font-mono text-right ${variant === "baseline" ? "text-gray-500" : colorClass}`}
              >
                {(m.recall * 100).toFixed(2)}%
              </TableCell>
              <TableCell
                className={`font-mono text-right ${variant === "baseline" ? "text-gray-500" : colorClass}`}
              >
                {(m.f1 * 100).toFixed(2)}%
              </TableCell>
              <TableCell className="font-mono text-right">
                {m.support}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Evaluasi Model</h1>
          <p className="mt-2 text-muted-foreground">
            Analisis perbandingan performa model Baseline (TF-IDF) dan Proposed
            (TF-IDF + InSet Lexicon)
          </p>
        </div>
        <Button variant="ghost" onClick={handleRetry} disabled={isRetrying}>
          {isRetrying ? (
            <Loader2 className="mr-2 w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 w-4 h-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* ERROR DISPLAY */}
      <ErrorDisplay />

      {/* Partial error warning */}
      {partialError && errors.length === 0 && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="flex-1 text-amber-800 dark:text-amber-200 text-sm">
            Beberapa data (uji statistik) gagal dimuat. Data confusion matrix
            tetap ditampilkan.
          </p>
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            variant="outline"
            size="sm"
            className="gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Muat Ulang
          </Button>
        </div>
      )}

      {/* BASELINE vs PROPOSED CARDS */}
      <div>
        <h2 className="mb-4 font-bold text-foreground text-xl">
          Perbandingan Baseline vs Proposed
        </h2>
        <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
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
                α = {cmDetail.config.alpha_baseline.toFixed(2)} • CNB
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="gap-3 grid grid-cols-2">
                <div className="bg-white dark:bg-gray-900 p-3 border rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">Accuracy</p>
                  <p className="font-bold text-gray-600 text-2xl">
                    {pct(cmDetail.baseline.average.accuracy)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ±{pct(cmDetail.baseline.average.accuracy_std)}%
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-3 border rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">F1-Score</p>
                  <p className="font-bold text-gray-600 text-2xl">
                    {pct(cmDetail.baseline.average.f1_score)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ±{pct(cmDetail.baseline.average.f1_score_std)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

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
                α = {cmDetail.config.alpha_proposed.toFixed(2)} • CNB
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="gap-3 grid grid-cols-2">
                <div className="bg-white dark:bg-gray-900 p-3 border border-violet-200 rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">Accuracy</p>
                  <p className="font-bold text-violet-600 text-2xl">
                    {pct(cmDetail.proposed.average.accuracy)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ±{pct(cmDetail.proposed.average.accuracy_std)}%
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-3 border border-violet-200 rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">F1-Score</p>
                  <p className="font-bold text-sky-600 text-2xl">
                    {pct(cmDetail.proposed.average.f1_score)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ±{pct(cmDetail.proposed.average.f1_score_std)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap justify-center items-center gap-6 mt-6">
          <span className="font-bold text-gray-500 text-xl">
            {pct(cmDetail.baseline.average.accuracy)}%
          </span>
          <ArrowRight className="w-6 h-6 text-muted-foreground" />
          <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-950/30 shadow-sm px-5 py-2.5 border-2 border-emerald-300 dark:border-emerald-700 rounded-full">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">
              +{cmDetail.improvement.accuracy.toFixed(2)}%
            </span>
          </div>
          <ArrowRight className="w-6 h-6 text-muted-foreground" />
          <span className="font-bold text-violet-600 text-xl">
            {pct(cmDetail.proposed.average.accuracy)}%
          </span>
        </div>
      </div>

      {/* TABS */}
      <Tabs defaultValue="confusion" className="space-y-4">
        <TabsList>
          <TabsTrigger value="confusion">
            <BarChart3 className="mr-2 w-4 h-4" />
            Confusion Matrix
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <Activity className="mr-2 w-4 h-4" />
            Metrik Lengkap
          </TabsTrigger>
          <TabsTrigger value="charts">
            <BarChart3 className="mr-2 w-4 h-4" />
            Charts
          </TabsTrigger>
          <TabsTrigger value="folds">
            <FileText className="mr-2 w-4 h-4" />
            CV Folds
          </TabsTrigger>
          <TabsTrigger value="ttest">
            <Calculator className="mr-2 w-4 h-4" />
            Uji Statistik
          </TabsTrigger>
        </TabsList>

        {/* CONFUSION MATRIX TAB */}
        <TabsContent value="confusion" className="space-y-6">
          <div className="bg-gray-50 dark:bg-gray-950/30 p-4 border-2 border-gray-300 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary">BASELINE</Badge>
              <h3 className="font-bold text-foreground text-lg">
                TF-IDF Only — α = {cmDetail.config.alpha_baseline.toFixed(2)}
              </h3>
            </div>
            <div className="gap-6 grid grid-cols-1 lg:grid-cols-3">
              {cmDetail.baseline.best && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      🏆 Best Fold (Fold {cmDetail.baseline.best.fold})
                    </CardTitle>
                    <CardDescription>
                      Accuracy: {pct(cmDetail.baseline.best.accuracy)}% | F1:{" "}
                      {pct(cmDetail.baseline.best.f1_score)}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CMTable
                      matrix={cmDetail.baseline.best.matrix}
                      labels={classLabels}
                    />
                  </CardContent>
                </Card>
              )}
              {cmDetail.baseline.worst && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      💩 Worst Fold (Fold {cmDetail.baseline.worst.fold})
                    </CardTitle>
                    <CardDescription>
                      Accuracy: {pct(cmDetail.baseline.worst.accuracy)}% | F1:{" "}
                      {pct(cmDetail.baseline.worst.f1_score)}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CMTable
                      matrix={cmDetail.baseline.worst.matrix}
                      labels={classLabels}
                    />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    📊 Average (10 Folds)
                  </CardTitle>
                  <CardDescription>
                    Accuracy: {pct(cmDetail.baseline.average.accuracy)}% ±
                    {pct(cmDetail.baseline.average.accuracy_std)}%
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CMTable
                    matrix={cmDetail.baseline.overall.matrix}
                    labels={classLabels}
                  />
                  <p className="mt-2 text-muted-foreground text-xs text-center">
                    Rata-rata per fold: {baseMatrixTotal} sampel
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="bg-violet-50 dark:bg-violet-950/20 p-4 border-2 border-violet-300 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <Badge className="bg-violet-100 text-violet-700">PROPOSED</Badge>
              <h3 className="font-bold text-foreground text-lg">
                TF-IDF + InSet — α = {cmDetail.config.alpha_proposed.toFixed(2)}
              </h3>
            </div>
            <div className="gap-6 grid grid-cols-1 lg:grid-cols-3">
              {cmDetail.proposed.best && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      🏆 Best Fold (Fold {cmDetail.proposed.best.fold})
                    </CardTitle>
                    <CardDescription>
                      Accuracy: {pct(cmDetail.proposed.best.accuracy)}% | F1:{" "}
                      {pct(cmDetail.proposed.best.f1_score)}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CMTable
                      matrix={cmDetail.proposed.best.matrix}
                      labels={classLabels}
                    />
                  </CardContent>
                </Card>
              )}
              {cmDetail.proposed.worst && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      💩 Worst Fold (Fold {cmDetail.proposed.worst.fold})
                    </CardTitle>
                    <CardDescription>
                      Accuracy: {pct(cmDetail.proposed.worst.accuracy)}% | F1:{" "}
                      {pct(cmDetail.proposed.worst.f1_score)}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CMTable
                      matrix={cmDetail.proposed.worst.matrix}
                      labels={classLabels}
                    />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    📊 Average (10 Folds)
                  </CardTitle>
                  <CardDescription>
                    Accuracy: {pct(cmDetail.proposed.average.accuracy)}% ±
                    {pct(cmDetail.proposed.average.accuracy_std)}%
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CMTable
                    matrix={cmDetail.proposed.overall.matrix}
                    labels={classLabels}
                  />
                  <p className="mt-2 text-muted-foreground text-xs text-center">
                    Rata-rata per fold: {propMatrixTotal} sampel
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs">
                <strong>📖 Keterangan:</strong> Baris = Kelas Aktual, Kolom =
                Kelas Prediksi.
                <span className="font-semibold text-emerald-600">
                  {" "}
                  Diagonal = Prediksi Benar ✅
                </span>
                , Non-diagonal = Prediksi Salah ❌. Matrix di atas menunjukkan
                rata-rata dari {cmDetail.config.cv_folds} fold cross-validation.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* METRIK LENGKAP TAB */}
        <TabsContent value="metrics">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-violet-100 text-violet-700">
                    PROPOSED
                  </Badge>
                  <CardTitle className="text-base">Metrik Per Kelas</CardTitle>
                </div>
                <CardDescription>
                  Precision, Recall, F1-Score (TF-IDF + InSet, α=
                  {cmDetail.config.alpha_proposed.toFixed(2)})
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ClassMetricsTable
                  matrix={propMatrix}
                  labels={classLabels}
                  variant="proposed"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">BASELINE</Badge>
                  <CardTitle className="text-base">Metrik Per Kelas</CardTitle>
                </div>
                <CardDescription>
                  Precision, Recall, F1-Score (TF-IDF Only, α=
                  {cmDetail.config.alpha_baseline.toFixed(2)})
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ClassMetricsTable
                  matrix={baseMatrix}
                  labels={classLabels}
                  variant="baseline"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Overall Metrics (Macro Average 10-Fold CV)
                </CardTitle>
                <CardDescription>
                  Baseline (α={cmDetail.config.alpha_baseline.toFixed(2)}) vs
                  Proposed (α={cmDetail.config.alpha_proposed.toFixed(2)})
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <MetricRow
                  label="Accuracy"
                  baseVal={cmDetail.baseline.average.accuracy}
                  baseStd={cmDetail.baseline.average.accuracy_std}
                  propVal={cmDetail.proposed.average.accuracy}
                  propStd={cmDetail.proposed.average.accuracy_std}
                  improvement={cmDetail.improvement.accuracy || 0}
                />
                <MetricRow
                  label="Precision (Macro)"
                  baseVal={cmDetail.baseline.average.precision}
                  baseStd={cmDetail.baseline.average.precision_std}
                  propVal={cmDetail.proposed.average.precision}
                  propStd={cmDetail.proposed.average.precision_std}
                  improvement={cmDetail.improvement.precision || 0}
                />
                <MetricRow
                  label="Recall (Macro)"
                  baseVal={cmDetail.baseline.average.recall}
                  baseStd={cmDetail.baseline.average.recall_std}
                  propVal={cmDetail.proposed.average.recall}
                  propStd={cmDetail.proposed.average.recall_std}
                  improvement={cmDetail.improvement.recall || 0}
                />
                <MetricRow
                  label="F1-Score (Macro)"
                  baseVal={cmDetail.baseline.average.f1_score}
                  baseStd={cmDetail.baseline.average.f1_score_std}
                  propVal={cmDetail.proposed.average.f1_score}
                  propStd={cmDetail.proposed.average.f1_score_std}
                  improvement={cmDetail.improvement.f1_score || 0}
                />
              </CardContent>
            </Card>

            <Card className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200">
              <CardHeader>
                <CardTitle className="text-base">
                  📊 Ringkasan Hasil Evaluasi
                </CardTitle>
                <CardDescription>
                  Perbandingan performa Baseline vs Proposed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="gap-4 grid grid-cols-2">
                  <div className="bg-white dark:bg-gray-900 p-4 border rounded-lg text-center">
                    <p className="mb-2 text-muted-foreground text-xs">
                      <Badge variant="secondary">BASELINE</Badge>
                    </p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Accuracy
                        </p>
                        <p className="font-bold text-gray-500 text-xl">
                          {pct(cmDetail.baseline.average.accuracy)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">
                          F1-Score
                        </p>
                        <p className="font-bold text-gray-500 text-xl">
                          {pct(cmDetail.baseline.average.f1_score)}%
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-4 border border-violet-200 rounded-lg text-center">
                    <p className="mb-2 text-muted-foreground text-xs">
                      <Badge className="bg-violet-100 text-violet-700">
                        PROPOSED
                      </Badge>
                    </p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Accuracy
                        </p>
                        <p className="font-bold text-violet-600 text-xl">
                          {pct(cmDetail.proposed.average.accuracy)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">
                          F1-Score
                        </p>
                        <p className="font-bold text-violet-600 text-xl">
                          {pct(cmDetail.proposed.average.f1_score)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 mt-4 p-3 border rounded-lg">
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    <strong>📊 Hasil:</strong>
                    <br />
                    Penambahan fitur InSet Lexicon meningkatkan akurasi dari{" "}
                    {pct(cmDetail.baseline.average.accuracy)}% menjadi{" "}
                    {pct(cmDetail.proposed.average.accuracy)}% (Δ +
                    {cmDetail.improvement.accuracy.toFixed(2)}%).
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CHARTS TAB */}
        <TabsContent value="charts">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  Perbandingan Metrik (Baseline vs Proposed)
                </CardTitle>
                <CardDescription>
                  Accuracy, Precision, Recall, F1-Score pada 10-Fold CV
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart
                    data={[
                      {
                        metric: "Accuracy",
                        baseline: cmDetail.baseline.average.accuracy * 100,
                        proposed: cmDetail.proposed.average.accuracy * 100,
                      },
                      {
                        metric: "Precision",
                        baseline: cmDetail.baseline.average.precision * 100,
                        proposed: cmDetail.proposed.average.precision * 100,
                      },
                      {
                        metric: "Recall",
                        baseline: cmDetail.baseline.average.recall * 100,
                        proposed: cmDetail.proposed.average.recall * 100,
                      },
                      {
                        metric: "F1-Score",
                        baseline: cmDetail.baseline.average.f1_score * 100,
                        proposed: cmDetail.proposed.average.f1_score * 100,
                      },
                    ]}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="metric"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 13 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip formatter={(v: any) => `${v.toFixed(2)}%`} />
                    <Legend />
                    <Bar
                      dataKey="baseline"
                      name="Baseline (TF-IDF)"
                      fill="#94a3b8"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="proposed"
                      name="Proposed (TF-IDF + InSet)"
                      fill="#8b5cf6"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>F1-Score Per Kelas - Proposed</CardTitle>
                <CardDescription>
                  Performa model pada setiap kelas sentimen (TF-IDF + InSet)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={classLabels.map((className, idx) => {
                      const m = getClassMetrics(propMatrix, idx);
                      return {
                        kelas:
                          className.charAt(0).toUpperCase() +
                          className.slice(1),
                        Precision: +(m.precision * 100).toFixed(1),
                        Recall: +(m.recall * 100).toFixed(1),
                        "F1-Score": +(m.f1 * 100).toFixed(1),
                      };
                    })}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="kelas"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 14 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip formatter={(v: any) => `${v.toFixed(1)}%`} />
                    <Legend />
                    <Bar
                      dataKey="Precision"
                      fill="#06b6d4"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Recall"
                      fill="#f59e0b"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="F1-Score"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="bg-muted/30 mt-3 p-3 rounded-lg">
                  <p className="text-muted-foreground text-xs">
                    <strong>📊 Observasi:</strong> Model menunjukkan performa
                    terbaik pada kelas{" "}
                    <span className="font-semibold text-emerald-600">
                      {classLabels[bestClassIdx]}
                    </span>{" "}
                    (F1:{" "}
                    {(
                      getClassMetrics(propMatrix, bestClassIdx).f1 * 100
                    ).toFixed(1)}
                    %) dan performa terendah pada kelas{" "}
                    <span className="font-semibold text-amber-600">
                      {classLabels[worstClassIdx]}
                    </span>{" "}
                    (F1:{" "}
                    {(
                      getClassMetrics(propMatrix, worstClassIdx).f1 * 100
                    ).toFixed(1)}
                    %).
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Perbandingan F1-Score Per Kelas</CardTitle>
                <CardDescription>
                  Baseline vs Proposed untuk setiap kelas sentimen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={classLabels.map((className, idx) => ({
                      kelas:
                        className.charAt(0).toUpperCase() + className.slice(1),
                      Baseline: +(
                        getClassMetrics(baseMatrix, idx).f1 * 100
                      ).toFixed(1),
                      Proposed: +(
                        getClassMetrics(propMatrix, idx).f1 * 100
                      ).toFixed(1),
                    }))}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="kelas"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 14 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip formatter={(v: any) => `${v.toFixed(1)}%`} />
                    <Legend />
                    <Bar
                      dataKey="Baseline"
                      name="Baseline (TF-IDF)"
                      fill="#94a3b8"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Proposed"
                      name="Proposed (TF-IDF + InSet)"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tren Akurasi Per Fold</CardTitle>
                <CardDescription>
                  Variasi akurasi di setiap fold cross-validation (10-Fold CV)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart
                    data={cmDetail.baseline.folds.map((f, i) => ({
                      fold: `F${f.fold}`,
                      Baseline: +(
                        cmDetail.baseline.folds[i]?.accuracy * 100
                      ).toFixed(1),
                      Proposed: +(
                        cmDetail.proposed.folds[i]?.accuracy * 100
                      ).toFixed(1),
                    }))}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="fold"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    />
                    <YAxis
                      domain={[Math.max(0, minFoldAcc - 5), 100]}
                      tick={{ fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip formatter={(v: any) => `${v.toFixed(1)}%`} />
                    <Legend />
                    <Bar
                      dataKey="Baseline"
                      name="Baseline"
                      fill="#94a3b8"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="Proposed"
                      name="Proposed"
                      fill="#8b5cf6"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-6 mt-3 text-muted-foreground text-xs">
                  <div className="flex items-center gap-2">
                    <div className="bg-gray-400 w-4 h-0.5"></div>Baseline Avg:{" "}
                    {pct(cmDetail.baseline.average.accuracy)}%
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-violet-500 w-4 h-0.5"></div>Proposed Avg:{" "}
                    {pct(cmDetail.proposed.average.accuracy)}%
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CV FOLDS TAB */}
        <TabsContent value="folds">
          <div className="space-y-6">
            {(["baseline", "proposed"] as const).map((variant) => {
              const data = cmDetail[variant];
              const isProposed = variant === "proposed";
              return (
                <div key={variant}>
                  <h3
                    className={`font-bold text-foreground text-lg ${isProposed ? "mt-6" : ""}`}
                  >
                    {isProposed ? "Proposed" : "Baseline"} — Detail per Fold
                  </h3>
                  <p className="mb-3 text-muted-foreground text-sm">
                    Rata-rata akurasi:{" "}
                    <span
                      className={`font-semibold ${isProposed ? "text-violet-600" : ""}`}
                    >
                      {pct(data.average.accuracy)}%
                    </span>{" "}
                    ±{pct(data.average.accuracy_std)}%
                  </p>
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="font-bold">Fold</TableHead>
                            <TableHead className="font-bold text-right">
                              Accuracy
                            </TableHead>
                            <TableHead className="font-bold text-right">
                              Precision
                            </TableHead>
                            <TableHead className="font-bold text-right">
                              Recall
                            </TableHead>
                            <TableHead className="font-bold text-right">
                              F1-Score
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.folds.map((f) => (
                            <TableRow key={f.fold}>
                              <TableCell className="font-medium">
                                Fold {f.fold}
                              </TableCell>
                              <TableCell className="font-mono text-right">
                                {pct(f.accuracy)}%
                              </TableCell>
                              <TableCell className="font-mono text-right">
                                {pct(f.precision)}%
                              </TableCell>
                              <TableCell className="font-mono text-right">
                                {pct(f.recall)}%
                              </TableCell>
                              <TableCell className="font-mono text-right">
                                {pct(f.f1_score)}%
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Rata-rata</TableCell>
                            <TableCell className="font-mono text-right">
                              {pct(data.average.accuracy)}%{" "}
                              <span className="font-normal text-muted-foreground">
                                ±{pct(data.average.accuracy_std)}%
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-right">
                              {pct(data.average.precision)}%{" "}
                              <span className="font-normal text-muted-foreground">
                                ±{pct(data.average.precision_std)}%
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-right">
                              {pct(data.average.recall)}%{" "}
                              <span className="font-normal text-muted-foreground">
                                ±{pct(data.average.recall_std)}%
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-right">
                              {pct(data.average.f1_score)}%{" "}
                              <span className="font-normal text-muted-foreground">
                                ±{pct(data.average.f1_score_std)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* TTEST TAB */}
        <TabsContent value="ttest">
          {ttest ? (
            <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
              {(["accuracy", "precision", "recall", "f1_score"] as const).map(
                (key) => {
                  const metric = ttest[key] as TTestMetric;
                  if (!metric) return null;
                  const colorMap: Record<string, string> = {
                    accuracy: "violet",
                    precision: "sky",
                    recall: "amber",
                    f1_score: "emerald",
                  };
                  const color = colorMap[key];
                  return (
                    <Card
                      key={key}
                      className={
                        metric.significant
                          ? `border-${color}-300 bg-${color}-50 dark:bg-${color}-950/30`
                          : "border-gray-300"
                      }
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm capitalize">
                          {key.replace("_", "-")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="gap-4 grid grid-cols-2 text-center">
                          <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                            <p className="text-muted-foreground text-xs">
                              Baseline
                            </p>
                            <p className="font-bold text-lg">
                              {(metric.baseline_mean * 100).toFixed(2)}%
                            </p>
                          </div>
                          <div
                            className={`p-3 rounded-lg bg-${color}-50 dark:bg-${color}-950/30`}
                          >
                            <p className="text-muted-foreground text-xs">
                              Proposed
                            </p>
                            <p
                              className={`font-bold text-lg text-${color}-600`}
                            >
                              {(metric.proposed_mean * 100).toFixed(2)}%
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Mean Diff</span>
                            <span className="font-mono">
                              {metric.mean_diff >= 0 ? "+" : ""}
                              {(metric.mean_diff * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>t-statistic</span>
                            <span className="font-mono">
                              {metric.t_statistic}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>p-value</span>
                            <span className="font-mono">{metric.p_value}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Cohen's d</span>
                            <span className="font-mono">{metric.cohens_d}</span>
                          </div>
                        </div>
                        <Badge
                          className={
                            metric.significant
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          }
                        >
                          {metric.interpretation}
                        </Badge>
                      </CardContent>
                    </Card>
                  );
                },
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-muted-foreground text-center">
                {partialError
                  ? "Gagal memuat data uji statistik."
                  : "Data tidak tersedia. Jalankan training terlebih dahulu."}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Info Cards */}
      <div className="gap-3 grid grid-cols-2 md:grid-cols-3">
        <InfoCard
          icon={<Database className="w-4 h-4" />}
          label="Total Samples"
          value={totalSamples.toLocaleString()}
        />
        <InfoCard
          icon={<Cpu className="w-4 h-4 text-sky-600" />}
          label="CV Folds"
          value={`${cmDetail.config.cv_folds}-Fold`}
        />
        <InfoCard
          icon={<Calendar className="w-4 h-4 text-amber-600" />}
          label="Model"
          value="ComplementNB"
        />
      </div>
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
    <div className="space-y-8">
      <Skeleton className="w-64 h-8" />
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-[400px]" />
    </div>
  );
}
