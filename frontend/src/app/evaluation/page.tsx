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
  Calendar,
  Cpu,
  Database,
  FileText,
  Info,
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
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ExperimentData {
  status: string;
  message?: string;
  data?: {
    model_name?: string;
    model_type?: string;
    total_samples?: number;
    cv_folds?: number;
    feature_count?: number;
    additional_features?: string;
    created_at?: string;
    baseline?: {
      accuracy?: number;
      f1_score?: number;
      accuracy_std?: number;
      f1_std?: number;
      precision?: number;
      precision_std?: number;
      recall?: number;
      recall_std?: number;
    };
    proposed?: {
      accuracy?: number;
      accuracy_std?: number;
      precision?: number;
      precision_std?: number;
      recall?: number;
      recall_std?: number;
      f1_score?: number;
      f1_std?: number;
    };
    improvement?: { accuracy?: number; f1?: number };
    classification_report?: string;
    confusion_matrix?: string;
  };
}
interface CvFoldData {
  fold_number: number;
  accuracy: number;
  f1_score: number;
}

const pct = (val: number | undefined) => ((val || 0) * 100).toFixed(2);
const pctStd = (val: number | undefined) => ((val || 0) * 100).toFixed(2);

export default function EvaluationPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ExperimentData | null>(null);
  const [cvFolds, setCvFolds] = useState<CvFoldData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const comparisonRes = await fetch(
        "http://localhost:8000/api/modeling/evaluation-comparison",
      );
      const comparisonData = await comparisonRes.json();
      if (comparisonData.status === "success") setData(comparisonData);
      else setError(comparisonData.message || "Gagal mengambil data");

      const detailRes = await fetch(
        "http://localhost:8000/api/experiments/latest",
      );
      const detailData = await detailRes.json();
      if (detailData.status === "success" && detailData.data?.cv_folds)
        setCvFolds(detailData.data.cv_folds);
    } catch (err) {
      setError("Gagal mengambil data evaluasi.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (error || !data || !data.data) {
    return (
      <div className="flex justify-center items-center p-12 min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <CardTitle>Informasi</CardTitle>
            </div>
            <CardDescription>
              {error || data?.message || "Belum ada data eksperimen"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchData}>
              <RefreshCw className="mr-2 w-4 h-4" />
              Refresh Data
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const expData = data.data!;

  const comparisonData = [
    {
      metric: "Accuracy",
      baseline: (expData.baseline?.accuracy || 0) * 100,
      proposed: (expData.proposed?.accuracy || 0) * 100,
    },
    {
      metric: "F1-Score",
      baseline: (expData.baseline?.f1_score || 0) * 100,
      proposed: (expData.proposed?.f1_score || 0) * 100,
    },
    {
      metric: "Precision",
      baseline: (expData.baseline?.precision || 0) * 100,
      proposed: (expData.proposed?.precision || 0) * 100,
    },
    {
      metric: "Recall",
      baseline: (expData.baseline?.recall || 0) * 100,
      proposed: (expData.proposed?.recall || 0) * 100,
    },
  ];

  const cvFoldData = cvFolds.map((fold) => ({
    fold: `Fold ${fold.fold_number}`,
    accuracy: (fold.accuracy || 0) * 100,
    f1_score: (fold.f1_score || 0) * 100,
  }));
  let confusionMatrix: number[][] = [];
  try {
    if (expData.confusion_matrix)
      confusionMatrix = JSON.parse(expData.confusion_matrix);
  } catch (e) {}
  const avgAccuracy =
    cvFoldData.length > 0
      ? cvFoldData.reduce((sum, f) => sum + f.accuracy, 0) / cvFoldData.length
      : 0;
  const avgF1 =
    cvFoldData.length > 0
      ? cvFoldData.reduce((sum, f) => sum + f.f1_score, 0) / cvFoldData.length
      : 0;
  const reportData = expData.classification_report
    ? expData.classification_report
        .split("\n")
        .filter(
          (l: string) =>
            l.includes("negative") ||
            l.includes("neutral") ||
            l.includes("positive"),
        )
        .map((l: string) => {
          const p = l.trim().split(/\s+/);
          return {
            class: p[0],
            precision: p[1],
            recall: p[2],
            f1: p[3],
            support: p[4],
          };
        })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Evaluasi Model</h1>
          <p className="mt-2 text-muted-foreground">
            Perbandingan Baseline vs Proposed • {expData.model_type} •{" "}
            {expData.additional_features}
          </p>
        </div>
        <Button variant="ghost" onClick={fetchData}>
          <RefreshCw className="mr-2 w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* BASELINE vs PROPOSED */}
      <div>
        <h2 className="mb-4 font-bold text-foreground text-xl">
          Perbandingan Baseline vs Proposed
        </h2>
        <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
          {/* BASELINE */}
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
                TF-IDF (5000 fitur) • CNB default (alpha=1.0)
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="gap-3 grid grid-cols-2">
                <div className="bg-white dark:bg-gray-900 p-3 border rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">Accuracy</p>
                  <p className="font-bold text-gray-600 dark:text-gray-400 text-2xl">
                    {pct(expData.baseline?.accuracy)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ±{pctStd(expData.baseline?.accuracy_std)}%
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-3 border rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">F1-Score</p>
                  <p className="font-bold text-gray-600 dark:text-gray-400 text-2xl">
                    {pct(expData.baseline?.f1_score)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ±{pctStd(expData.baseline?.f1_std)}%
                  </p>
                </div>
              </div>
              <div className="gap-3 grid grid-cols-2">
                <div className="bg-white dark:bg-gray-900 p-2 border rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">
                    Precision
                  </p>
                  <p className="font-semibold text-gray-600 dark:text-gray-400">
                    {pct(expData.baseline?.precision)}%
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2 border rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">Recall</p>
                  <p className="font-semibold text-gray-600 dark:text-gray-400">
                    {pct(expData.baseline?.recall)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PROPOSED */}
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
                TF-IDF (5000) + InSet (9 fitur) • CNB optimal (alpha=0.70)
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="gap-3 grid grid-cols-2">
                <div className="bg-white dark:bg-gray-900 p-3 border border-violet-200 dark:border-violet-800 rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">Accuracy</p>
                  <p className="font-bold text-violet-600 text-2xl">
                    {pct(expData.proposed?.accuracy)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ±{pctStd(expData.proposed?.accuracy_std)}%
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-3 border border-violet-200 dark:border-violet-800 rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">F1-Score</p>
                  <p className="font-bold text-sky-600 text-2xl">
                    {pct(expData.proposed?.f1_score)}%
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ±{pctStd(expData.proposed?.f1_std)}%
                  </p>
                </div>
              </div>
              <div className="gap-3 grid grid-cols-2">
                <div className="bg-white dark:bg-gray-900 p-2 border border-violet-200 dark:border-violet-800 rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">
                    Precision
                  </p>
                  <p className="font-semibold text-violet-600">
                    {pct(expData.proposed?.precision)}%
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2 border border-violet-200 dark:border-violet-800 rounded-lg text-center">
                  <p className="mb-1 text-muted-foreground text-xs">Recall</p>
                  <p className="font-semibold text-sky-600">
                    {pct(expData.proposed?.recall)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Arrow + Improvement */}
        <div className="flex flex-wrap justify-center items-center gap-6 mt-6">
          <span className="font-bold text-gray-500 text-xl">
            {pct(expData.baseline?.accuracy)}%
          </span>
          <ArrowRight className="w-6 h-6 text-muted-foreground" />
          <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-950/30 shadow-sm px-5 py-2.5 border-2 border-emerald-300 dark:border-emerald-700 rounded-full">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">
              +{expData.improvement?.accuracy?.toFixed(2)}%
            </span>
          </div>
          <ArrowRight className="w-6 h-6 text-muted-foreground" />
          <span className="font-bold text-violet-600 text-xl">
            {pct(expData.proposed?.accuracy)}%
          </span>
        </div>
      </div>

      {/* Info */}
      <Card className="bg-muted/30 border">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 w-5 h-5 text-primary shrink-0" />
          <div className="text-muted-foreground text-sm">
            <p>
              <strong>Baseline:</strong> Hanya TF-IDF (5000 fitur) dengan CNB
              default (alpha=1.0).
            </p>
            <p className="mt-1">
              <strong>Proposed:</strong> TF-IDF + InSet Lexicon (9 fitur) dengan
              CNB optimal (alpha=0.70, norm=False).
            </p>
            <p className="mt-1">
              <strong>Improvement:</strong> Selisih akurasi proposed dikurangi
              baseline. Menunjukkan kontribusi InSet Lexicon.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <Tabs defaultValue="comparison" className="space-y-4">
        <TabsList>
          <TabsTrigger value="comparison">
            <BarChart3 className="mr-2 w-4 h-4" />
            Chart Perbandingan
          </TabsTrigger>
          <TabsTrigger value="folds">
            <Activity className="mr-2 w-4 h-4" />
            CV Folds
          </TabsTrigger>
          <TabsTrigger value="matrix">
            <FileText className="mr-2 w-4 h-4" />
            Confusion Matrix
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comparison">
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
            <Card className="border">
              <CardHeader>
                <CardTitle>Perbandingan Performa</CardTitle>
                <CardDescription>
                  Baseline (TF-IDF) vs Proposed (TF-IDF + InSet)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={comparisonData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="metric"
                      tick={{ fill: "var(--muted-foreground)" }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      formatter={(v: any) => `${v.toFixed(2)}%`}
                      contentStyle={{
                        borderRadius: "var(--radius-lg)",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--card)",
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="baseline"
                      name="Baseline"
                      fill="#94a3b8"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="proposed"
                      name="Proposed"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border">
              <CardHeader>
                <CardTitle>Detail Metrik</CardTitle>
                <CardDescription>
                  Hasil evaluasi dengan standard deviation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {[
                    [
                      "Accuracy",
                      expData.proposed?.accuracy,
                      expData.proposed?.accuracy_std,
                    ],
                    [
                      "Precision",
                      expData.proposed?.precision,
                      expData.proposed?.precision_std,
                    ],
                    [
                      "Recall",
                      expData.proposed?.recall,
                      expData.proposed?.recall_std,
                    ],
                    [
                      "F1-Score",
                      expData.proposed?.f1_score,
                      expData.proposed?.f1_std,
                    ],
                  ].map(([label, val, std]) => (
                    <div key={label as string}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-muted-foreground text-sm">
                          {label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {pct(val as number)}%
                          </span>
                          <span className="text-muted-foreground text-xs">
                            ±{pctStd(std as number)}%
                          </span>
                        </div>
                      </div>
                      <Progress value={((val as number) || 0) * 100} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="folds">
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
            <Card className="border">
              <CardHeader>
                <CardTitle>Cross-Validation Folds</CardTitle>
                <CardDescription>
                  Avg Acc: {avgAccuracy.toFixed(2)}%, Avg F1: {avgF1.toFixed(2)}
                  %
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart
                    data={cvFoldData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="fold"
                      tick={{ fill: "var(--muted-foreground)" }}
                    />
                    <YAxis
                      domain={[60, 90]}
                      tick={{ fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      formatter={(v: any) => `${v.toFixed(2)}%`}
                      contentStyle={{
                        borderRadius: "var(--radius-lg)",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--card)",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      name="Accuracy"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={{ fill: "var(--primary)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="f1_score"
                      name="F1-Score"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: "#10b981" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border">
              <CardHeader>
                <CardTitle>Detail per Fold</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">Fold</TableHead>
                      <TableHead className="font-bold text-right">
                        Accuracy
                      </TableHead>
                      <TableHead className="font-bold text-right">
                        F1-Score
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cvFoldData.map((f) => (
                      <TableRow key={f.fold} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{f.fold}</TableCell>
                        <TableCell className="font-mono text-right">
                          {f.accuracy.toFixed(2)}%
                        </TableCell>
                        <TableCell className="font-mono text-right">
                          {f.f1_score.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>Average</TableCell>
                      <TableCell className="font-mono text-right">
                        {avgAccuracy.toFixed(2)}%
                      </TableCell>
                      <TableCell className="font-mono text-right">
                        {avgF1.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="matrix">
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
            <Card className="border">
              <CardHeader>
                <CardTitle>Classification Report</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">Class</TableHead>
                      <TableHead className="font-bold text-right">
                        Precision
                      </TableHead>
                      <TableHead className="font-bold text-right">
                        Recall
                      </TableHead>
                      <TableHead className="font-bold text-right">
                        F1-Score
                      </TableHead>
                      <TableHead className="font-bold text-right">
                        Support
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((r, i) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell>
                          <Badge
                            variant={
                              r.class === "negative"
                                ? "destructive"
                                : r.class === "neutral"
                                  ? "secondary"
                                  : "default"
                            }
                            className="capitalize"
                          >
                            {r.class}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-right">
                          {r.precision}
                        </TableCell>
                        <TableCell className="font-mono text-right">
                          {r.recall}
                        </TableCell>
                        <TableCell className="font-mono text-right">
                          {r.f1}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground text-right">
                          {r.support}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            {confusionMatrix.length > 0 && (
              <Card className="border">
                <CardHeader>
                  <CardTitle>Confusion Matrix</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead className="font-bold text-center">
                          Pred Neg
                        </TableHead>
                        <TableHead className="font-bold text-center">
                          Pred Neu
                        </TableHead>
                        <TableHead className="font-bold text-center">
                          Pred Pos
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {confusionMatrix.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {i === 0
                              ? "Actual Neg"
                              : i === 1
                                ? "Actual Neu"
                                : "Actual Pos"}
                          </TableCell>
                          {row.map((cell, j) => (
                            <TableCell key={j} className="text-center">
                              <Badge
                                variant={i === j ? "default" : "outline"}
                                className={
                                  i === j
                                    ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 min-w-10"
                                    : "min-w-10"
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
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Model Info */}
      <div className="gap-3 grid grid-cols-2 md:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs">
                Total Samples
              </p>
              <p className="font-semibold text-foreground">
                {expData.total_samples}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="bg-violet-500/10 p-2 rounded-lg">
              <Layers className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs">
                Features
              </p>
              <p className="font-semibold text-foreground">
                {expData.feature_count}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="bg-sky-500/10 p-2 rounded-lg">
              <Cpu className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs">
                CV Folds
              </p>
              <p className="font-semibold text-foreground">
                {expData.cv_folds}-Fold
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="bg-amber-500/10 p-2 rounded-lg">
              <Calendar className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs">Date</p>
              <p className="font-semibold text-foreground text-sm">
                {expData.created_at
                  ? new Date(expData.created_at).toLocaleDateString("id-ID")
                  : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="w-64 h-8" />
        <Skeleton className="w-96 h-4" />
      </div>
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="w-full h-48" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="w-full h-48" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-6">
          <Skeleton className="w-full h-[400px]" />
        </CardContent>
      </Card>
    </div>
  );
}
