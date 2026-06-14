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
  ArrowLeft,
  BarChart3,
  Info,
  Search,
  Star,
  Table2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface GridSearchTrial {
  alpha: number;
  norm: boolean;
  f1_score: number;
}

interface GridSearchData {
  baseline: GridSearchTrial[];
  proposed: GridSearchTrial[];
}

const BEST_COLOR = "#f59e0b";

export default function SearchAlphaPage() {
  const [gridSearch, setGridSearch] = useState<GridSearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bestAlpha, setBestAlpha] = useState<{
    baseline: { alpha: number; norm: boolean; f1_score: number };
    proposed: { alpha: number; norm: boolean; f1_score: number };
  } | null>(null);

  useEffect(() => {
    fetchGridSearch();
  }, []);

  const fetchGridSearch = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/modeling/grid-search");
      const result = await res.json();
      if (result.status === "success") {
        setGridSearch(result.data);

        const bestBaseline = result.data.baseline.reduce(
          (best: GridSearchTrial, curr: GridSearchTrial) =>
            curr.f1_score > best.f1_score ? curr : best,
        );
        const bestProposed = result.data.proposed.reduce(
          (best: GridSearchTrial, curr: GridSearchTrial) =>
            curr.f1_score > best.f1_score ? curr : best,
        );

        setBestAlpha({
          baseline: bestBaseline,
          proposed: bestProposed,
        });
      }
    } catch (err) {
      console.error("Gagal fetch grid search:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (!gridSearch) {
    return (
      <div className="flex justify-center items-center p-12 min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <Search className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <CardTitle>Data Grid Search Tidak Tersedia</CardTitle>
            <CardDescription>
              Jalankan training terlebih dahulu untuk menghasilkan data grid
              search
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/model-training">
              <Button variant="outline">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Kembali ke Modeling
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link
            href="/model-training"
            className="inline-flex items-center gap-1 mb-2 text-muted-foreground hover:text-foreground text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Modeling
          </Link>
          <h1 className="font-bold text-foreground text-3xl">
            Grid Search Alpha
          </h1>
          <p className="mt-2 text-muted-foreground">
            Visualisasi 100 trials pencarian alpha terbaik untuk Baseline &
            Proposed (F1 Macro Scoring)
          </p>
        </div>
      </div>

      {bestAlpha && (
        <div className="gap-4 grid grid-cols-1 sm:grid-cols-2">
          <Card className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 text-center">
              <Star className="mx-auto mb-2 w-6 h-6 text-amber-600" />
              <p className="text-muted-foreground text-xs">
                Best Alpha Baseline
              </p>
              <p className="font-mono font-bold text-2xl">
                α = {bestAlpha.baseline.alpha.toFixed(2)}
              </p>
              <p className="text-muted-foreground text-sm">
                norm={bestAlpha.baseline.norm ? "True" : "False"} • F1:{" "}
                {(bestAlpha.baseline.f1_score * 100).toFixed(3)}%
              </p>
            </CardContent>
          </Card>
          <Card className="bg-violet-50 dark:bg-violet-950/20 border-2 border-violet-200 dark:border-violet-800">
            <CardContent className="p-4 text-center">
              <Star className="mx-auto mb-2 w-6 h-6 text-violet-600" />
              <p className="text-muted-foreground text-xs">
                Best Alpha Proposed
              </p>
              <p className="font-mono font-bold text-violet-600 text-2xl">
                α = {bestAlpha.proposed.alpha.toFixed(2)}
              </p>
              <p className="text-muted-foreground text-sm">
                norm={bestAlpha.proposed.norm ? "True" : "False"} • F1:{" "}
                {(bestAlpha.proposed.f1_score * 100).toFixed(3)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="scatter" className="space-y-4">
        <TabsList>
          <TabsTrigger value="scatter">
            <BarChart3 className="mr-2 w-4 h-4" />
            Scatter Plot
          </TabsTrigger>
          <TabsTrigger value="line">
            <TrendingUp className="mr-2 w-4 h-4" />
            F1 Curve
          </TabsTrigger>
          <TabsTrigger value="heatmap">
            <Table2 className="mr-2 w-4 h-4" />
            Heatmap Table
          </TabsTrigger>
          <TabsTrigger value="all">
            <Search className="mr-2 w-4 h-4" />
            All 100 Trials
          </TabsTrigger>
        </TabsList>

        {/* SCATTER PLOT TAB */}
        <TabsContent value="scatter">
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
            {[
              {
                title: "Baseline (TF-IDF Only)",
                data: gridSearch.baseline,
                best: bestAlpha?.baseline,
                colorTrue: "#94a3b8",
                colorFalse: "#64748b",
              },
              {
                title: "Proposed (TF-IDF + InSet)",
                data: gridSearch.proposed,
                best: bestAlpha?.proposed,
                colorTrue: "#a78bfa",
                colorFalse: "#7c3aed",
              },
            ].map(({ title, data, best, colorTrue, colorFalse }) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription>
                    50 trials: α ∈ [0.01, 1.00] × norm True/False
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <ScatterChart
                      margin={{ top: 20, right: 20, bottom: 30, left: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="alpha"
                        type="number"
                        domain={[0, 1.05]}
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "Alpha (α)",
                          position: "bottom",
                          fontSize: 12,
                          offset: -10,
                        }}
                      />
                      <YAxis
                        dataKey="f1_score"
                        type="number"
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                        label={{
                          value: "F1-Score",
                          angle: -90,
                          position: "insideLeft",
                          fontSize: 12,
                        }}
                      />
                      <Tooltip
                        formatter={(value: any, name: any) => [
                          `${(value * 100).toFixed(4)}%`,
                          name,
                        ]}
                        labelFormatter={(label) => `Alpha: ${label}`}
                      />
                      <Legend />
                      <Scatter
                        name="norm=True"
                        data={data.filter((d) => d.norm)}
                        fill={colorTrue}
                        opacity={0.7}
                      >
                        {data
                          .filter((d) => d.norm)
                          .map((d, i) => (
                            <Cell
                              key={i}
                              fill={
                                best &&
                                d.alpha === best.alpha &&
                                d.norm === best.norm
                                  ? BEST_COLOR
                                  : colorTrue
                              }
                              stroke={
                                best &&
                                d.alpha === best.alpha &&
                                d.norm === best.norm
                                  ? BEST_COLOR
                                  : "none"
                              }
                              strokeWidth={
                                best &&
                                d.alpha === best.alpha &&
                                d.norm === best.norm
                                  ? 2
                                  : 0
                              }
                            />
                          ))}
                      </Scatter>
                      <Scatter
                        name="norm=False"
                        data={data.filter((d) => !d.norm)}
                        fill={colorFalse}
                        opacity={0.7}
                      >
                        {data
                          .filter((d) => !d.norm)
                          .map((d, i) => (
                            <Cell
                              key={i}
                              fill={
                                best &&
                                d.alpha === best.alpha &&
                                d.norm === best.norm
                                  ? BEST_COLOR
                                  : colorFalse
                              }
                              stroke={
                                best &&
                                d.alpha === best.alpha &&
                                d.norm === best.norm
                                  ? BEST_COLOR
                                  : "none"
                              }
                              strokeWidth={
                                best &&
                                d.alpha === best.alpha &&
                                d.norm === best.norm
                                  ? 2
                                  : 0
                              }
                            />
                          ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                  {best && (
                    <div className="mt-2 text-center">
                      <Badge className="bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
                        ★ Best: α={best.alpha.toFixed(2)}, norm=
                        {best.norm ? "True" : "False"}, F1=
                        {(best.f1_score * 100).toFixed(3)}%
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-muted/30 mt-4">
            <CardContent className="flex items-start gap-3 p-4">
              <Info className="mt-0.5 w-5 h-5 text-muted-foreground shrink-0" />
              <div className="space-y-1 text-muted-foreground text-sm">
                <p>
                  <strong>Scatter Plot:</strong> Setiap titik mewakili satu
                  kombinasi alpha & norm.
                </p>
                <p>
                  <strong>Titik kuning (★):</strong> Alpha terbaik berdasarkan
                  F1-Score tertinggi.
                </p>
                <p>
                  <strong>50 trials:</strong> 50 nilai alpha × 2 opsi norm = 100
                  total percobaan.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* F1 CURVE TAB */}
        <TabsContent value="line">
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
            {[
              {
                title: "Baseline - F1 per Alpha",
                data: gridSearch.baseline,
                best: bestAlpha?.baseline,
                color: "#64748b",
              },
              {
                title: "Proposed - F1 per Alpha",
                data: gridSearch.proposed,
                best: bestAlpha?.proposed,
                color: "#7c3aed",
              },
            ].map(({ title, data, best, color }) => {
              const alphas = [...new Set(data.map((d) => d.alpha))].sort(
                (a, b) => a - b,
              );
              const lineData = alphas.map((alpha) => {
                const trials = data.filter((d) => d.alpha === alpha);
                const avgF1 =
                  trials.reduce((sum, d) => sum + d.f1_score, 0) /
                  trials.length;
                const normTrue = trials.find((d) => d.norm)?.f1_score || 0;
                const normFalse = trials.find((d) => !d.norm)?.f1_score || 0;
                return {
                  alpha: alpha.toFixed(2),
                  avgF1: +(avgF1 * 100).toFixed(3),
                  normTrue: +(normTrue * 100).toFixed(3),
                  normFalse: +(normFalse * 100).toFixed(3),
                  isBest: best ? alpha === best.alpha : false,
                };
              });
              return (
                <Card key={title}>
                  <CardHeader>
                    <CardTitle className="text-lg">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart
                        data={lineData}
                        margin={{ top: 20, right: 20, bottom: 30, left: 20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="alpha"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: "Alpha (α)",
                            position: "bottom",
                            fontSize: 12,
                          }}
                        />
                        <YAxis
                          tickFormatter={(v) => `${v}%`}
                          label={{
                            value: "F1-Score",
                            angle: -90,
                            position: "insideLeft",
                            fontSize: 12,
                          }}
                        />
                        <Tooltip formatter={(v: any) => `${v}%`} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="normTrue"
                          name="norm=True"
                          stroke={color}
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="normFalse"
                          name="norm=False"
                          stroke={color}
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="avgF1"
                          name="Average"
                          stroke={BEST_COLOR}
                          strokeWidth={3}
                          dot={(props: any) => {
                            const { cx, cy, payload } = props;
                            if (payload.isBest)
                              return (
                                <svg
                                  x={cx - 8}
                                  y={cy - 8}
                                  width={16}
                                  height={16}
                                >
                                  <text
                                    x={8}
                                    y={12}
                                    textAnchor="middle"
                                    fontSize={12}
                                  >
                                    ★
                                  </text>
                                </svg>
                              );
                            return (
                              <circle cx={cx} cy={cy} r={3} fill={BEST_COLOR} />
                            );
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* HEATMAP TABLE TAB */}
        <TabsContent value="heatmap">
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
            {[
              {
                title: "Baseline (TF-IDF Only)",
                data: gridSearch.baseline,
                best: bestAlpha?.baseline,
              },
              {
                title: "Proposed (TF-IDF + InSet)",
                data: gridSearch.proposed,
                best: bestAlpha?.proposed,
              },
            ].map(({ title, data, best }) => {
              const alphas = [...new Set(data.map((d) => d.alpha))].sort(
                (a, b) => a - b,
              );
              const heatmapData = alphas.map((alpha) => {
                const normTrue = data.find((d) => d.alpha === alpha && d.norm);
                const normFalse = data.find(
                  (d) => d.alpha === alpha && !d.norm,
                );
                return {
                  alpha: alpha.toFixed(2),
                  normTrue: normTrue
                    ? (normTrue.f1_score * 100).toFixed(4)
                    : "-",
                  normFalse: normFalse
                    ? (normFalse.f1_score * 100).toFixed(4)
                    : "-",
                  isBest: best ? alpha === best.alpha : false,
                  bestNorm: best ? best.norm : null,
                };
              });
              const allScores = data.map((d) => d.f1_score);
              const maxScore = Math.max(...allScores);
              const minScore = Math.min(...allScores);
              const getColor = (accStr: string) => {
                if (accStr === "-") return "";
                const acc = parseFloat(accStr) / 100;
                const ratio = (acc - minScore) / (maxScore - minScore);
                if (ratio > 0.9)
                  return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
                if (ratio > 0.7)
                  return "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400";
                if (ratio > 0.5)
                  return "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400";
                return "";
              };
              return (
                <Card key={title}>
                  <CardHeader>
                    <CardTitle className="text-lg">{title}</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[600px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="top-0 sticky bg-card font-bold">
                            Alpha
                          </TableHead>
                          <TableHead className="top-0 sticky bg-card text-right">
                            norm=True
                          </TableHead>
                          <TableHead className="top-0 sticky bg-card text-right">
                            norm=False
                          </TableHead>
                          <TableHead className="top-0 sticky bg-card text-center">
                            Best
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {heatmapData.map((row) => (
                          <TableRow
                            key={row.alpha}
                            className={
                              row.isBest
                                ? "bg-amber-50 dark:bg-amber-950/30 font-semibold"
                                : ""
                            }
                          >
                            <TableCell className="font-mono">
                              {row.alpha}
                            </TableCell>
                            <TableCell
                              className={`font-mono text-right ${getColor(row.normTrue)} ${row.isBest && row.bestNorm === true ? "font-bold text-amber-600" : ""}`}
                            >
                              {row.normTrue}%
                            </TableCell>
                            <TableCell
                              className={`font-mono text-right ${getColor(row.normFalse)} ${row.isBest && row.bestNorm === false ? "font-bold text-amber-600" : ""}`}
                            >
                              {row.normFalse}%
                            </TableCell>
                            <TableCell className="text-center">
                              {row.isBest && (
                                <Badge className="bg-amber-100 text-amber-700">
                                  ★
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ALL TRIALS TAB */}
        <TabsContent value="all">
          <Tabs defaultValue="baseline">
            <TabsList>
              <TabsTrigger value="baseline">Baseline (50 trials)</TabsTrigger>
              <TabsTrigger value="proposed">Proposed (50 trials)</TabsTrigger>
            </TabsList>
            {[
              {
                value: "baseline",
                data: gridSearch.baseline,
                best: bestAlpha?.baseline,
              },
              {
                value: "proposed",
                data: gridSearch.proposed,
                best: bestAlpha?.proposed,
              },
            ].map(({ value, data, best }) => (
              <TabsContent key={value} value={value}>
                <Card>
                  <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="top-0 sticky bg-card w-[60px]">
                              Rank
                            </TableHead>
                            <TableHead className="top-0 sticky bg-card">
                              Alpha
                            </TableHead>
                            <TableHead className="top-0 sticky bg-card">
                              Norm
                            </TableHead>
                            <TableHead className="top-0 sticky bg-card text-right">
                              F1-Score
                            </TableHead>
                            <TableHead className="top-0 sticky bg-card text-center">
                              Status
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data
                            .sort((a, b) => b.f1_score - a.f1_score)
                            .map((trial, i) => {
                              const isBest =
                                best &&
                                trial.alpha === best.alpha &&
                                trial.norm === best.norm;
                              return (
                                <TableRow
                                  key={i}
                                  className={
                                    isBest
                                      ? "bg-amber-50 dark:bg-amber-950/30 font-semibold"
                                      : ""
                                  }
                                >
                                  <TableCell className="text-muted-foreground text-xs">
                                    {i === 0
                                      ? "🥇"
                                      : i === 1
                                        ? "🥈"
                                        : i === 2
                                          ? "🥉"
                                          : `#${i + 1}`}
                                  </TableCell>
                                  <TableCell className="font-mono">
                                    {trial.alpha.toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        trial.norm ? "default" : "secondary"
                                      }
                                    >
                                      {trial.norm ? "True" : "False"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono text-right">
                                    {(trial.f1_score * 100).toFixed(4)}%
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {isBest && (
                                      <Badge className="bg-amber-100 text-amber-700">
                                        ★ Best Alpha
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="w-64 h-8" />
      <div className="gap-4 grid grid-cols-1 sm:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-[500px]" />
    </div>
  );
}
