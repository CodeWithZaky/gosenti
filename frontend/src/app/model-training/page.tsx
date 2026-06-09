"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  Brain,
  Calendar,
  FileText,
  History,
  Layers,
  Loader2,
  Play,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function ModelingPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/modeling/history");
      const result = await res.json();
      if (result.status === "success") setExperiments(result.data);
    } catch (err) {
      console.error("Gagal mengambil histori:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleRunModeling = async () => {
    setIsProcessing(true);
    const toastId = toast.loading("Menjalankan training CNB...");
    try {
      const res = await fetch(
        "http://localhost:8000/api/pipeline/cnb_classification",
        { method: "POST" },
      );
      const result = await res.json();
      if (result.status === "success") {
        toast.success("Training berhasil!", {
          id: toastId,
          description: "Model CNB telah dilatih dengan 10-Fold CV",
        });
        fetchHistory();
      } else {
        toast.error("Training gagal!", {
          id: toastId,
          description: result.message || "Terjadi kesalahan",
        });
      }
    } catch (err) {
      toast.error("Gagal terhubung ke server", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const latestExp = experiments[0];

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Modeling</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Training Complement Naive Bayes dengan TF-IDF dan InSet Lexicon
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="px-3 py-1.5 text-sm">
            <Activity className="mr-1.5 w-3.5 h-3.5" />
            10-Fold CV
          </Badge>
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

      {latestExp && (
        <div className="space-y-6">
          {/* Hasil Terbaru */}
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-foreground text-2xl">
              Hasil Training Terakhir
            </h2>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(latestExp.created_at).toLocaleString("id-ID")}
            </Badge>
          </div>

          {/* Stats Utama */}
          {/* Stats Utama - 4 Card */}
          <div className="gap-3 grid grid-cols-2 lg:grid-cols-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Avg Accuracy Fold
                    </p>
                    <p className="font-bold tabular-nums text-violet-600 text-xl">
                      {(latestExp.accuracy_mean * 100).toFixed(2)}%
                    </p>
                    <p className="text-muted-foreground text-xs">
                      ±{(latestExp.accuracy_std * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div className="flex bg-violet-500/10 ml-2 p-2 rounded-lg shrink-0">
                    <TrendingUp className="w-4 h-4 text-violet-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Avg F1-Score Fold
                    </p>
                    <p className="font-bold tabular-nums text-sky-600 text-xl">
                      {(latestExp.f1_score_mean * 100).toFixed(2)}%
                    </p>
                    <p className="text-muted-foreground text-xs">
                      ±{(latestExp.f1_score_std * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div className="flex bg-sky-500/10 ml-2 p-2 rounded-lg shrink-0">
                    <Zap className="w-4 h-4 text-sky-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Samples
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-xl">
                      {latestExp.total_samples}
                    </p>
                    <p className="text-muted-foreground text-xs">total data</p>
                  </div>
                  <div className="flex bg-emerald-500/10 ml-2 p-2 rounded-lg shrink-0">
                    <Target className="w-4 h-4 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Features
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-xl">
                      {latestExp.feature_count}
                    </p>
                    <p className="text-muted-foreground text-xs">dimensi</p>
                  </div>
                  <div className="flex bg-amber-500/10 ml-2 p-2 rounded-lg shrink-0">
                    <Layers className="w-4 h-4 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Classification Report (Kiri) + CV Folds (Kanan) */}
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
            {/* Classification Report */}
            <Card className="border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-violet-600" />
                  <CardTitle className="text-lg">
                    Classification Report
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {latestExp.classification_report ? (
                  <ClassificationReportTable
                    report={latestExp.classification_report}
                  />
                ) : (
                  <p className="py-8 text-muted-foreground text-center">
                    Tidak ada data
                  </p>
                )}
              </CardContent>
            </Card>

            {/* CV Folds */}
            <Card className="border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-sky-600" />
                  <CardTitle className="text-lg">Rincian per Fold</CardTitle>
                </div>
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
                    {latestExp.folds?.map((fold: any) => (
                      <TableRow key={fold.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">
                          Fold {fold.fold_number}
                        </TableCell>
                        <TableCell className="font-mono text-violet-600 text-right">
                          {(fold.accuracy * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell className="font-mono text-sky-600 text-right">
                          {(fold.f1_score * 100).toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>Average</TableCell>
                      <TableCell className="text-violet-600 text-right">
                        {(latestExp.accuracy_mean * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-sky-600 text-right">
                        {(latestExp.f1_score_mean * 100).toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Riwayat Eksperimen */}
          {experiments.length > 1 && (
            <Card className="border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-muted-foreground" />
                  <CardTitle className="text-lg">
                    Riwayat Eksperimen ({experiments.length - 1} sebelumnya)
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">
                        Nama Eksperimen
                      </TableHead>
                      <TableHead className="font-bold text-right">
                        Akurasi
                      </TableHead>
                      <TableHead className="font-bold text-right">
                        F1-Score
                      </TableHead>
                      <TableHead className="font-bold text-right">
                        Δ Acc
                      </TableHead>
                      <TableHead className="font-bold text-right">
                        Tanggal
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {experiments.slice(1).map((exp: any) => (
                      <TableRow key={exp.id} className="hover:bg-muted/30">
                        <TableCell className="max-w-[250px] font-medium text-sm truncate">
                          {exp.experiment_name}
                        </TableCell>
                        <TableCell className="font-mono text-violet-600 text-right">
                          {(exp.accuracy_mean * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell className="font-mono text-sky-600 text-right">
                          {(exp.f1_score_mean * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell className="font-mono text-emerald-600 text-right">
                          +{exp.improvement_accuracy?.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs text-right">
                          {new Date(exp.created_at).toLocaleDateString("id-ID")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!latestExp && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <Brain className="w-16 h-16 text-muted-foreground/20" />
            <p className="text-muted-foreground text-lg">
              Belum ada hasil eksperimen
            </p>
            <Button
              onClick={handleRunModeling}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <Play className="mr-2 w-4 h-4" />
              Jalankan Training
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Classification Report Component
function ClassificationReportTable({ report }: { report: string }) {
  const parseReport = (text: string) => {
    const lines = text.split("\n").filter((line) => line.trim());
    const result: any = {
      classes: [],
      accuracy: "",
      macroAvg: { precision: "", recall: "", f1: "", support: "" },
      weightedAvg: { precision: "", recall: "", f1: "", support: "" },
    };
    for (const line of lines) {
      const t = line.trim();
      if (t.includes("precision") && t.includes("recall")) continue;
      if (t.startsWith("accuracy")) {
        result.accuracy = t.split(/\s+/)[1] || "";
        continue;
      }
      if (t.match(/^(negative|neutral|positive)\s/)) {
        const p = t.split(/\s+/);
        result.classes.push({
          name: p[0],
          precision: p[1],
          recall: p[2],
          f1: p[3],
          support: p[4],
        });
        continue;
      }
      if (t.startsWith("macro avg")) {
        const p = t.split(/\s+/);
        result.macroAvg = {
          precision: p[2],
          recall: p[3],
          f1: p[4],
          support: p[5],
        };
        continue;
      }
      if (t.startsWith("weighted avg")) {
        const p = t.split(/\s+/);
        result.weightedAvg = {
          precision: p[2],
          recall: p[3],
          f1: p[4],
          support: p[5],
        };
      }
    }
    return result;
  };
  const data = parseReport(report);
  const getClassBadge = (name: string) => {
    switch (name) {
      case "negative":
        return (
          <Badge className="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">
            Negative
          </Badge>
        );
      case "neutral":
        return (
          <Badge className="bg-muted text-muted-foreground">Neutral</Badge>
        );
      case "positive":
        return (
          <Badge className="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400">
            Positive
          </Badge>
        );
      default:
        return <Badge variant="outline">{name}</Badge>;
    }
  };
  const getScoreColor = (v: string) => {
    const n = parseFloat(v);
    if (isNaN(n)) return "text-muted-foreground";
    if (n >= 0.8) return "text-emerald-600 font-semibold";
    if (n >= 0.7) return "text-sky-600 font-semibold";
    if (n >= 0.6) return "text-amber-600 font-semibold";
    return "text-red-600 font-semibold";
  };
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-bold">Class</TableHead>
            <TableHead className="font-bold text-center">Precision</TableHead>
            <TableHead className="font-bold text-center">Recall</TableHead>
            <TableHead className="font-bold text-center">F1-Score</TableHead>
            <TableHead className="font-bold text-center">Support</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.classes.map((cls: any) => (
            <TableRow key={cls.name} className="hover:bg-muted/30">
              <TableCell>{getClassBadge(cls.name)}</TableCell>
              <TableCell
                className={`text-center font-mono ${getScoreColor(cls.precision)}`}
              >
                {cls.precision}
              </TableCell>
              <TableCell
                className={`text-center font-mono ${getScoreColor(cls.recall)}`}
              >
                {cls.recall}
              </TableCell>
              <TableCell
                className={`text-center font-mono ${getScoreColor(cls.f1)}`}
              >
                {cls.f1}
              </TableCell>
              <TableCell className="font-mono text-muted-foreground text-center">
                {cls.support}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="bg-primary/10 p-3 rounded-lg text-center">
        <span className="font-medium text-primary">Accuracy: </span>
        <span className="font-mono font-bold text-primary">
          {data.accuracy}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-bold">Average</TableHead>
            <TableHead className="font-bold text-center">Precision</TableHead>
            <TableHead className="font-bold text-center">Recall</TableHead>
            <TableHead className="font-bold text-center">F1-Score</TableHead>
            <TableHead className="font-bold text-center">Support</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="hover:bg-muted/30">
            <TableCell>
              <Badge variant="secondary">Macro Avg</Badge>
            </TableCell>
            <TableCell className="font-mono text-center">
              {data.macroAvg.precision}
            </TableCell>
            <TableCell className="font-mono text-center">
              {data.macroAvg.recall}
            </TableCell>
            <TableCell className="font-mono text-center">
              {data.macroAvg.f1}
            </TableCell>
            <TableCell className="font-mono text-center">
              {data.macroAvg.support}
            </TableCell>
          </TableRow>
          <TableRow className="hover:bg-muted/30">
            <TableCell>
              <Badge variant="secondary">Weighted Avg</Badge>
            </TableCell>
            <TableCell className="font-mono text-center">
              {data.weightedAvg.precision}
            </TableCell>
            <TableCell className="font-mono text-center">
              {data.weightedAvg.recall}
            </TableCell>
            <TableCell className="font-mono text-center">
              {data.weightedAvg.f1}
            </TableCell>
            <TableCell className="font-mono text-center">
              {data.weightedAvg.support}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
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
      <div className="gap-3 grid grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="w-full h-18" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="w-48 h-6" />
          </CardHeader>
          <CardContent>
            <Skeleton className="w-full h-64" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="w-48 h-6" />
          </CardHeader>
          <CardContent>
            <Skeleton className="w-full h-64" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
