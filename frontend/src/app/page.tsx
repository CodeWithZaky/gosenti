"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Minus,
  Newspaper,
  PieChart as PieChartIcon,
  ThumbsDown,
  ThumbsUp,
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

export default function TrendDashboard() {
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [yearlyData, setYearlyData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [totals, setTotals] = useState({ pos: 0, neu: 0, neg: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const COLORS = { pos: "#10b981", neu: "#94a3b8", neg: "#ef4444" };

  useEffect(() => {
    const fetchTrendData = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/dashboard/trend");
        const json = await res.json();

        if (json.status === "success") {
          const data = json.data;
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

          const yearlyArray = Object.values(yearMap).sort((a: any, b: any) =>
            a.year.localeCompare(b.year),
          );
          setYearlyData(yearlyArray);
        } else {
          setError(json.message || "Gagal mengambil data");
        }
      } catch (err) {
        console.error("Gagal mengambil data chart", err);
        setError("Gagal terhubung ke server");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrendData();
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

  return (
    <div className="space-y-6 min-h-screen">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          {/* <div className="bg-primary p-2 rounded-xl">
            <Activity className="w-6 h-6 text-primary-foreground" />
          </div> */}
          <div>
            <h1 className="font-bold text-foreground text-3xl">
              Analisis Tren Sentimen
            </h1>
            <p className="mt-1 text-muted-foreground">
              Perkembangan sentimen berita dari tahun 2025 hingga 2026
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="gap-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border">
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
              Keseluruhan data
            </p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row justify-between items-center space-y-0 pb-2">
            <CardTitle className="font-medium text-green-600 text-sm">
              Sentimen Positif
            </CardTitle>
            <ThumbsUp className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-green-600 text-3xl">
              {totals.pos.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="secondary"
                className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              >
                {positivePercentage}%
              </Badge>
              <span className="text-muted-foreground text-xs">dari total</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row justify-between items-center space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Sentimen Neutral
            </CardTitle>
            <Minus className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-foreground text-3xl">
              {totals.neu.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{neutralPercentage}%</Badge>
              <span className="text-muted-foreground text-xs">dari total</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row justify-between items-center space-y-0 pb-2">
            <CardTitle className="font-medium text-red-600 text-sm">
              Sentimen Negatif
            </CardTitle>
            <ThumbsDown className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-red-600 text-3xl">
              {totals.neg.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="secondary"
                className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
              >
                {negativePercentage}%
              </Badge>
              <span className="text-muted-foreground text-xs">dari total</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Area Chart */}
      <Card className="border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <CardTitle>Tren Sentimen Bulanan</CardTitle>
          </div>
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
        </CardContent>
      </Card>

      {/* Bar Chart & Pie Chart */}
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2 border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
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
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="neutral"
                  name="Neutral"
                  fill={COLORS.neu}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="negative"
                  name="Negatif"
                  fill={COLORS.neg}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-primary" />
              <CardTitle>Distribusi Total</CardTitle>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-8">
      <div className="space-y-2">
        <Skeleton className="w-64 h-8" />
        <Skeleton className="w-96 h-4" />
      </div>
      <div className="gap-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
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
