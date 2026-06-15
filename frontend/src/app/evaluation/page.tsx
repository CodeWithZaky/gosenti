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
  ArrowRight,
  BarChart3,
  Calculator,
  Calendar,
  Cpu,
  Database,
  FileText,
  Layers,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
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
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  matrix: number[][];
}

interface ConfusionMatrixDetail {
  class_names: string[];
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
    precision: number;
    recall: number;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cmRes, ttestRes] = await Promise.all([
        fetch("http://localhost:8000/api/evaluation/confusion-matrix"),
        fetch("http://localhost:8000/api/evaluation/ttest"),
      ]);
      const cmData = await cmRes.json();
      const ttestData = await ttestRes.json();

      if (cmData.status === "success") setCmDetail(cmData.data);
      else setError(cmData.detail || "Gagal mengambil data");

      if (ttestData.status === "success") setTtest(ttestData.data);
    } catch (err) {
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (error || !cmDetail) {
    return (
      <div className="flex justify-center items-center p-12 min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <AlertCircle className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <CardTitle>Belum Ada Data</CardTitle>
            <CardDescription>
              {error || "Jalankan training terlebih dahulu"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchData} variant="outline">
              <RefreshCw className="mr-2 w-4 h-4" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const classLabels = cmDetail.class_names;
  const totalSamples = cmDetail.proposed.overall.matrix
    .flat()
    .reduce((a, b) => a + b, 0);
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
                  // variant={i === j ? "default" : "outline"}
                  variant={"outline"}
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
        <Button variant="ghost" onClick={fetchData}>
          <RefreshCw className="mr-2 w-4 h-4" />
          Refresh
        </Button>
      </div>

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
                    Total: {baseMatrix.flat().reduce((a, b) => a + b, 0)} sampel
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
                    Total: {propMatrix.flat().reduce((a, b) => a + b, 0)} sampel
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <h3 className="mt-8 font-bold text-foreground text-lg">
            Perbandingan Overall
          </h3>
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">BASELINE</Badge>
                  <CardTitle className="text-sm">Overall</CardTitle>
                </div>
                <CardDescription>
                  Accuracy: {pct(cmDetail.baseline.overall.accuracy)}% | F1:{" "}
                  {pct(cmDetail.baseline.overall.f1_score)}%
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CMTable matrix={baseMatrix} labels={classLabels} />
              </CardContent>
            </Card>
            <Card className="border-violet-300">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-violet-100 text-violet-700">
                    PROPOSED
                  </Badge>
                  <CardTitle className="text-sm">Overall</CardTitle>
                </div>
                <CardDescription>
                  Accuracy: {pct(cmDetail.proposed.overall.accuracy)}% | F1:{" "}
                  {pct(cmDetail.proposed.overall.f1_score)}% | Δ: +
                  {cmDetail.improvement.accuracy}%
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CMTable matrix={propMatrix} labels={classLabels} />
              </CardContent>
            </Card>
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
                , Non-diagonal = Prediksi Salah ❌.
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
                  improvement={
                    cmDetail.improvement.accuracy ||
                    (cmDetail.proposed.average.accuracy -
                      cmDetail.baseline.average.accuracy) *
                      100
                  }
                />
                <MetricRow
                  label="Precision (Macro)"
                  baseVal={cmDetail.baseline.average.precision}
                  baseStd={cmDetail.baseline.average.precision_std}
                  propVal={cmDetail.proposed.average.precision}
                  propStd={cmDetail.proposed.average.precision_std}
                  improvement={
                    cmDetail.improvement.precision ||
                    (cmDetail.proposed.average.precision -
                      cmDetail.baseline.average.precision) *
                      100
                  }
                />
                <MetricRow
                  label="Recall (Macro)"
                  baseVal={cmDetail.baseline.average.recall}
                  baseStd={cmDetail.baseline.average.recall_std}
                  propVal={cmDetail.proposed.average.recall}
                  propStd={cmDetail.proposed.average.recall_std}
                  improvement={
                    cmDetail.improvement.recall ||
                    (cmDetail.proposed.average.recall -
                      cmDetail.baseline.average.recall) *
                      100
                  }
                />
                <MetricRow
                  label="F1-Score (Macro)"
                  baseVal={cmDetail.baseline.average.f1_score}
                  baseStd={cmDetail.baseline.average.f1_score_std}
                  propVal={cmDetail.proposed.average.f1_score}
                  propStd={cmDetail.proposed.average.f1_score_std}
                  improvement={
                    cmDetail.improvement.f1_score ||
                    (cmDetail.proposed.average.f1_score -
                      cmDetail.baseline.average.f1_score) *
                      100
                  }
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
                    {cmDetail.improvement.accuracy.toFixed(2)}%). Peningkatan
                    ini menunjukkan bahwa fitur InSet Lexicon memberikan
                    kontribusi positif pada kemampuan klasifikasi model
                    Complement Naive Bayes.
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

        {/* CV FOLDS DETAIL TAB */}
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
                    ±
                    <span className="font-semibold">
                      {pct(data.average.accuracy_std)}%
                    </span>{" "}
                    (rentang:{" "}
                    {pct(data.average.accuracy - data.average.accuracy_std)}% —{" "}
                    {pct(data.average.accuracy + data.average.accuracy_std)}%)
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
                              {pct(data.average.accuracy)}%
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                ±{pct(data.average.accuracy_std)}%
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-right">
                              {pct(data.average.precision)}%
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                ±{pct(data.average.precision_std)}%
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-right">
                              {pct(data.average.recall)}%
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                ±{pct(data.average.recall_std)}%
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-right">
                              {pct(data.average.f1_score)}%
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                ±{pct(data.average.f1_score_std)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  <div className="flex items-center gap-2 mt-2 text-muted-foreground text-xs">
                    <span className="bg-muted px-2 py-0.5 rounded-full">
                      Min: {pct(Math.min(...data.folds.map((f) => f.accuracy)))}
                      %
                    </span>
                    <span>—</span>
                    <span className="bg-muted px-2 py-0.5 rounded-full">
                      Max: {pct(Math.max(...data.folds.map((f) => f.accuracy)))}
                      %
                    </span>
                    <span className="ml-2">
                      Std Dev: ±{pct(data.average.accuracy_std)}% (
                      {(
                        (data.average.accuracy_std / data.average.accuracy) *
                        100
                      ).toFixed(1)}
                      % dari rata-rata)
                    </span>
                  </div>
                </div>
              );
            })}

            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle className="text-base">
                  Ringkasan Stabilitas Model
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="gap-4 grid grid-cols-2">
                  {(["baseline", "proposed"] as const).map((variant) => {
                    const data = cmDetail[variant];
                    const cv =
                      (data.average.accuracy_std / data.average.accuracy) * 100;
                    return (
                      <div
                        key={variant}
                        className={`bg-white dark:bg-gray-900 p-3 border rounded-lg text-center ${variant === "proposed" ? "border-violet-200" : ""}`}
                      >
                        <p className="mb-1 text-muted-foreground text-xs capitalize">
                          {variant}
                        </p>
                        <p
                          className={`font-bold text-lg ${variant === "proposed" ? "text-violet-600" : ""}`}
                        >
                          {pct(data.average.accuracy)}%
                          <span className="font-normal text-muted-foreground text-sm">
                            {" "}
                            ±{pct(data.average.accuracy_std)}%
                          </span>
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          CV = {cv.toFixed(1)}%
                          {cv < 5 ? " ✅ Stabil" : " ⚠️ Kurang Stabil"}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-muted-foreground text-xs">
                  <strong>CV (Coefficient of Variation)</strong> = Std Dev /
                  Mean. Nilai CV yang rendah (&lt; 5%) mengindikasikan performa
                  model yang konsisten antar fold.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* UJI STATISTIK TAB */}
        <TabsContent value="ttest">
          {ttest ? (
            <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
              {(
                [
                  { key: "accuracy", label: "Accuracy", color: "violet" },
                  { key: "precision", label: "Precision", color: "sky" },
                  { key: "recall", label: "Recall", color: "amber" },
                  { key: "f1_score", label: "F1-Score", color: "emerald" },
                ] as const
              ).map(({ key, label, color }) => {
                const metric = ttest[key as keyof typeof ttest] as TTestMetric;
                if (!metric || typeof metric === "string") return null;
                const colorMap: Record<string, string> = {
                  violet:
                    "border-violet-300 bg-violet-50 dark:bg-violet-950/30",
                  sky: "border-sky-300 bg-sky-50 dark:bg-sky-950/30",
                  amber: "border-amber-300 bg-amber-50 dark:bg-amber-950/30",
                  emerald:
                    "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30",
                };
                const textColor: Record<string, string> = {
                  violet: "text-violet-600",
                  sky: "text-sky-600",
                  amber: "text-amber-600",
                  emerald: "text-emerald-600",
                };

                return (
                  <Card
                    key={key}
                    className={
                      metric.significant ? colorMap[color] : "border-gray-300"
                    }
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{label}</CardTitle>
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
                        <div className={`p-3 rounded-lg ${colorMap[color]}`}>
                          <p className="text-muted-foreground text-xs">
                            Proposed
                          </p>
                          <p
                            className={`font-bold text-lg ${textColor[color]}`}
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
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-muted-foreground text-center">
                Data tidak tersedia.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Info Cards */}
      <div className="gap-3 grid grid-cols-2 md:grid-cols-4">
        <InfoCard
          icon={<Database className="w-4 h-4" />}
          label="Total Samples"
          value={totalSamples.toLocaleString()}
        />
        <InfoCard
          icon={<Layers className="w-4 h-4 text-violet-600" />}
          label="Features"
          value="2,540"
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
