"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Layers,
  Minus,
  Newspaper,
  PieChart as PieChartIcon,
  Search,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

export default function DashboardPage() {
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [yearlyData, setYearlyData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [totals, setTotals] = useState({ pos: 0, neu: 0, neg: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const COLORS = { pos: "#10b981", neu: "#94a3b8", neg: "#ef4444" };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [trendRes, statsRes] = await Promise.all([
          fetch("http://localhost:8000/api/dashboard/trend"),
          fetch("http://localhost:8000/api/stats"),
        ]);

        const trendJson = await trendRes.json();
        const statsJson = await statsRes.json();

        if (trendJson.status === "success") {
          const data = trendJson.data;
          setMonthlyData(data);

          let totalPos = 0,
            totalNeu = 0,
            totalNeg = 0;
          const yearMap: Record<string, any> = {};

          data.forEach((item: any) => {
            totalPos += item.positive;
            totalNeu += item.neutral;
            totalNeg += item.negative;
            const year = item.date.split(" ")[1];
            if (!yearMap[year]) {
              yearMap[year] = { year, positive: 0, neutral: 0, negative: 0 };
            }
            yearMap[year].positive += item.positive;
            yearMap[year].neutral += item.neutral;
            yearMap[year].negative += item.negative;
          });

          setTotals({ pos: totalPos, neu: totalNeu, neg: totalNeg });
          setPieData([
            { name: "Positif", value: totalPos, color: COLORS.pos },
            { name: "Neutral", value: totalNeu, color: COLORS.neu },
            { name: "Negatif", value: totalNeg, color: COLORS.neg },
          ]);

          setYearlyData(
            Object.values(yearMap).sort((a: any, b: any) =>
              a.year.localeCompare(b.year),
            ),
          );
        }

        if (statsJson) {
          setStats(statsJson);
        }
      } catch (err) {
        console.error("Gagal mengambil data", err);
        setError("Gagal terhubung ke server");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="flex justify-center items-center p-8 min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <CardTitle>Gagal Memuat Data</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAll = totals.pos + totals.neu + totals.neg;
  const positivePercentage =
    totalAll > 0 ? ((totals.pos / totalAll) * 100).toFixed(1) : "0";
  const neutralPercentage =
    totalAll > 0 ? ((totals.neu / totalAll) * 100).toFixed(1) : "0";
  const negativePercentage =
    totalAll > 0 ? ((totals.neg / totalAll) * 100).toFixed(1) : "0";
  const avgPositivePerMonth = Math.round(
    totals.pos / (monthlyData.length || 1),
  );
  const avgNeutralPerMonth = Math.round(totals.neu / (monthlyData.length || 1));
  const avgNegativePerMonth = Math.round(
    totals.neg / (monthlyData.length || 1),
  );

  return (
    <div className="space-y-6 min-h-screen">
      {/* ============================================================ */}
      {/* HEADER */}
      {/* ============================================================ */}
      <div>
        <h1 className="font-bold text-foreground text-3xl">
          Analisis Tren Sentimen
        </h1>
        <p className="mt-1 text-muted-foreground">
          Dashboard analisis sentimen berita ekonomi Indonesia 2025-2026
        </p>
      </div>

      {/* ============================================================ */}
      {/* ABSTRAK / RINGKASAN PENELITIAN */}
      {/* ============================================================ */}
      <Card className="bg-linear-to-br from-violet-50 dark:from-violet-950/20 via-white dark:via-gray-950 to-sky-50 dark:to-sky-950/20 shadow-lg border-2 border-violet-100 dark:border-violet-900/50">
        <CardContent className="p-6">
          <div className="gap-6 grid grid-cols-1 lg:grid-cols-3">
            {/* Kolom 1: Tentang Penelitian */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="bg-violet-100 dark:bg-violet-900/50 p-1.5 rounded-lg">
                  <Newspaper className="w-4 h-4 text-violet-600" />
                </div>
                <h3 className="font-semibold text-foreground text-sm">
                  Tentang Penelitian
                </h3>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Analisis sentimen berita ekonomi menggunakan metode{" "}
                <span className="font-semibold text-violet-600">
                  Complement Naive Bayes (CNB)
                </span>{" "}
                dengan kombinasi fitur{" "}
                <span className="font-semibold text-violet-600">TF-IDF</span>{" "}
                dan{" "}
                <span className="font-semibold text-violet-600">
                  InSet Lexicon
                </span>
                . Penelitian menggunakan dataset berita dari portal ekonomi
                Indonesia.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  CNB
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  TF-IDF
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  InSet Lexicon
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  10-Fold CV
                </Badge>
              </div>
            </div>

            {/* Kolom 2: Metodologi */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="bg-sky-100 dark:bg-sky-900/50 p-1.5 rounded-lg">
                  <Layers className="w-4 h-4 text-sky-600" />
                </div>
                <h3 className="font-semibold text-foreground text-sm">
                  Metodologi
                </h3>
              </div>
              <div className="space-y-1.5">
                {[
                  {
                    step: 1,
                    text: "Scraping berita ekonomi dari portal berita",
                    icon: <Newspaper className="w-3 h-3" />,
                  },
                  {
                    step: 2,
                    text: "Preprocessing & pelabelan SentiStrength",
                    icon: <Search className="w-3 h-3" />,
                  },
                  {
                    step: 3,
                    text: "Ekstraksi fitur TF-IDF + InSet Lexicon",
                    icon: <Zap className="w-3 h-3" />,
                  },
                  {
                    step: 4,
                    text: "Klasifikasi CNB + Grid Search (100 trials)",
                    icon: <Target className="w-3 h-3" />,
                  },
                  {
                    step: 5,
                    text: "Evaluasi 10-Fold Cross Validation",
                    icon: <BarChart3 className="w-3 h-3" />,
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="flex items-center gap-2 text-muted-foreground text-sm"
                  >
                    <Badge
                      variant="outline"
                      className="flex justify-center items-center p-0 rounded-full w-5 h-5 text-xs"
                    >
                      {item.step}
                    </Badge>
                    {item.icon}
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Kolom 3: Hasil Utama */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-100 dark:bg-emerald-900/50 p-1.5 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-foreground text-sm">
                  Hasil Utama
                </h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-white dark:bg-gray-900 p-2.5 border rounded-lg">
                  <span className="text-sm">Total Dataset</span>
                  <span className="font-bold">
                    {totalAll.toLocaleString()} berita
                  </span>
                </div>
                <div className="flex justify-between items-center bg-white dark:bg-gray-900 p-2.5 border rounded-lg">
                  <span className="text-sm">Periode</span>
                  <span className="font-medium text-sm">2025 - 2026</span>
                </div>
                <div className="flex justify-between items-center bg-white dark:bg-gray-900 p-2.5 border rounded-lg">
                  <span className="text-sm">Distribusi Sentimen</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-green-600">
                      {positivePercentage}% Pos
                    </span>
                    <span className="text-gray-400">|</span>
                    <span className="font-medium text-red-600">
                      {negativePercentage}% Neg
                    </span>
                  </div>
                </div>
                {stats && (
                  <>
                    <div className="flex justify-between items-center bg-white dark:bg-gray-900 p-2.5 border rounded-lg">
                      <span className="text-sm">Akurasi Model (CNB)</span>
                      <span className="font-bold text-violet-600">
                        {((stats.accuracy || 0) * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white dark:bg-gray-900 p-2.5 border rounded-lg">
                      <span className="text-sm">F1-Score Model</span>
                      <span className="font-bold text-sky-600">
                        {((stats.f1_score || 0) * 100).toFixed(2)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* SUMMARY CARDS */}
      {/* ============================================================ */}
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md border transition-shadow">
          <CardHeader className="flex flex-row justify-between items-center space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Total Berita
            </CardTitle>
            <Newspaper className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-foreground text-3xl">
              {totalAll.toLocaleString()}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {monthlyData.length} bulan data
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md border transition-shadow">
          <CardHeader className="flex flex-row justify-between items-center space-y-0 pb-2">
            <CardTitle className="font-medium text-green-600 text-sm">
              Positif
            </CardTitle>
            <ThumbsUp className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-green-600 text-3xl">
              {totals.pos.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs">
                {positivePercentage}%
              </Badge>
              <span className="text-muted-foreground text-xs">
                ±{avgPositivePerMonth}/bln
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md border transition-shadow">
          <CardHeader className="flex flex-row justify-between items-center space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Neutral
            </CardTitle>
            <Minus className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-foreground text-3xl">
              {totals.neu.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {neutralPercentage}%
              </Badge>
              <span className="text-muted-foreground text-xs">
                ±{avgNeutralPerMonth}/bln
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md border transition-shadow">
          <CardHeader className="flex flex-row justify-between items-center space-y-0 pb-2">
            <CardTitle className="font-medium text-red-600 text-sm">
              Negatif
            </CardTitle>
            <ThumbsDown className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-red-600 text-3xl">
              {totals.neg.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">
                {negativePercentage}%
              </Badge>
              <span className="text-muted-foreground text-xs">
                ±{avgNegativePerMonth}/bln
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================ */}
      {/* AREA CHART - TREN BULANAN */}
      {/* ============================================================ */}
      <Card className="shadow-md border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-violet-600" />
            <CardTitle>Tren Sentimen Bulanan (2025-2026)</CardTitle>
          </div>
          <p className="text-muted-foreground text-sm">
            Fluktuasi jumlah berita positif, neutral, dan negatif per bulan
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart
              data={monthlyData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.pos} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.pos} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorNeu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.neu} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.neu} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.neg} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.neg} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                tickMargin={10}
                minTickGap={30}
              />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card)",
                  color: "var(--card-foreground)",
                }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area
                type="monotone"
                dataKey="positive"
                name="Positif"
                stroke={COLORS.pos}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPos)"
              />
              <Area
                type="monotone"
                dataKey="neutral"
                name="Neutral"
                stroke={COLORS.neu}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorNeu)"
              />
              <Area
                type="monotone"
                dataKey="negative"
                name="Negatif"
                stroke={COLORS.neg}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorNeg)"
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Rata-rata per bulan */}
          <div className="gap-4 grid grid-cols-3 bg-muted/30 mt-4 p-3 rounded-lg">
            <div className="text-center">
              <p className="text-muted-foreground text-xs">Rata-rata/bulan</p>
              <p className="font-bold text-green-600 text-lg">
                {avgPositivePerMonth.toLocaleString()}
              </p>
              <p className="text-muted-foreground text-xs">Positif</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs">Rata-rata/bulan</p>
              <p className="font-bold text-gray-500 text-lg">
                {avgNeutralPerMonth.toLocaleString()}
              </p>
              <p className="text-muted-foreground text-xs">Neutral</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs">Rata-rata/bulan</p>
              <p className="font-bold text-red-600 text-lg">
                {avgNegativePerMonth.toLocaleString()}
              </p>
              <p className="text-muted-foreground text-xs">Negatif</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* BAR CHART + PIE CHART */}
      {/* ============================================================ */}
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-3">
        {/* Bar Chart - Tahunan */}
        <Card className="lg:col-span-2 shadow-md border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-600" />
              <CardTitle>Perbandingan Sentimen Tahunan</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={yearlyData}
                margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="year"
                  tick={{
                    fontSize: 14,
                    fontWeight: "bold",
                    fill: "var(--foreground)",
                  }}
                />
                <YAxis tick={{ fill: "var(--muted-foreground)" }} />
                <RechartsTooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--card-foreground)",
                  }}
                />
                <Legend iconType="circle" />
                <Bar
                  dataKey="positive"
                  name="Positif"
                  fill={COLORS.pos}
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="neutral"
                  name="Neutral"
                  fill={COLORS.neu}
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="negative"
                  name="Negatif"
                  fill={COLORS.neg}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart - Distribusi */}
        <Card className="shadow-md border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-emerald-600" />
              <CardTitle>Distribusi Sentimen</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({
                      name,
                      percent,
                    }: {
                      name?: string;
                      percent?: number;
                    }) => {
                      if (percent !== undefined)
                        return `${name} ${(percent * 100).toFixed(0)}%`;
                      return name || "";
                    }}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--card)",
                      color: "var(--card-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="bg-green-500 rounded-full w-3 h-3"></div>
                <span className="text-muted-foreground text-sm">Positif</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-gray-400 rounded-full w-3 h-3"></div>
                <span className="text-muted-foreground text-sm">Neutral</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-red-500 rounded-full w-3 h-3"></div>
                <span className="text-muted-foreground text-sm">Negatif</span>
              </div>
            </div>
            <p className="mt-4 text-muted-foreground text-xs text-center">
              Total {totalAll.toLocaleString()} berita • {positivePercentage}%
              Positif, {neutralPercentage}% Neutral, {negativePercentage}%
              Negatif
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// SKELETON LOADING
// ============================================================
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="w-64 h-8" />
      <Skeleton className="w-full h-48" />
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="w-24 h-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="mb-2 w-32 h-8" />
              <Skeleton className="w-16 h-4" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="w-48 h-6" />
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-[400px]" />
        </CardContent>
      </Card>
    </div>
  );
}
