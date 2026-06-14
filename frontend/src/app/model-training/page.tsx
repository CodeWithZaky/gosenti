"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  ArrowRight,
  Brain,
  Calendar,
  Layers,
  Loader2,
  Play,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function ModelingPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasGridSearch, setHasGridSearch] = useState(false);
  const [alphaInfo, setAlphaInfo] = useState({ baseline: 1.0, proposed: 1.0 });

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

  const fetchAlphaInfo = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/modeling/grid-search");
      const result = await res.json();
      if (result.status === "success") {
        setHasGridSearch(true);
        // Coba ambil alpha dari best_params
        const paramsRes = await fetch(
          "http://localhost:8000/api/evaluation/confusion-matrix",
        );
        const paramsData = await paramsRes.json();
        if (paramsData.status === "success" && paramsData.data.config) {
          setAlphaInfo({
            baseline: paramsData.data.config.alpha_baseline || 1.0,
            proposed: paramsData.data.config.alpha_proposed || 1.0,
          });
        }
      }
    } catch (err) {
      setHasGridSearch(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchAlphaInfo();
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
        setIsProcessing(false);
        setTimeout(() => {
          fetchHistory();
          fetchAlphaInfo();
        }, 1000);
      } else {
        toast.error("Training gagal!", {
          id: toastId,
          description: result.message || "Terjadi kesalahan",
        });
        setIsProcessing(false);
      }
    } catch (err) {
      toast.error("Gagal terhubung ke server", { id: toastId });
      setIsProcessing(false);
    }
  };

  const latestExp = experiments[0];

  if (loading) return <LoadingSkeleton />;

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
    </div>
  );
}
