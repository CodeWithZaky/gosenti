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
  ArrowLeft,
  CheckCircle2,
  Hash,
  Minus,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LexiconStats {
  positive_words: number;
  negative_words: number;
  negation_words: number;
  booster_words: number;
  total_lexicon: number;
}

interface CoverageItem {
  count: number;
  pct: number;
}

interface CoverageData {
  total_documents: number;
  total_words: number;
  lexicon_stats: LexiconStats;
  coverage: {
    known: CoverageItem;
    unknown: CoverageItem;
    negation: CoverageItem;
    booster: CoverageItem;
  };
  top_known: { word: string; count: number }[];
  top_unknown: { word: string; count: number }[];
  top_negation: { word: string; count: number }[];
  top_booster: { word: string; count: number }[];
  note: string;
}

interface NegationItem {
  phrase: string;
  negation_word: string;
  sentiment_word: string;
  full_text: string;
}

interface BoosterItem {
  phrase: string;
  booster_word: string;
  sentiment_word: string;
  position: string;
  full_text: string;
}

const COLORS = {
  known: "#10b981",
  unknown: "#ef4444",
  negation: "#f59e0b",
  booster: "#8b5cf6",
};

export default function SentiStrengthAnalysisPage() {
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [allNegation, setAllNegation] = useState<NegationItem[]>([]);
  const [allBooster, setAllBooster] = useState<BoosterItem[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("http://localhost:8000/api/data/sentistrength/coverage").then((r) =>
        r.json(),
      ),
      fetch("http://localhost:8000/api/data/sentistrength/all-negation").then(
        (r) => r.json(),
      ),
      fetch("http://localhost:8000/api/data/sentistrength/all-booster").then(
        (r) => r.json(),
      ),
    ])
      .then(([coverageData, allNegData, allBoostData]) => {
        if (coverageData.status === "success") setCoverage(coverageData.data);
        if (allNegData.status === "success")
          setAllNegation(allNegData.data.results || []);
        if (allBoostData.status === "success")
          setAllBooster(allBoostData.data.results || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!coverage) return null;

  const pieData = [
    {
      name: "Kata Dikenal",
      value: coverage.coverage.known.count,
      color: COLORS.known,
    },
    {
      name: "Tidak Dikenal",
      value: coverage.coverage.unknown.count,
      color: COLORS.unknown,
    },
  ];

  const barNegBooster = [
    {
      name: "Negasi",
      value: coverage.coverage.negation.count,
      fill: COLORS.negation,
    },
    {
      name: "Booster",
      value: coverage.coverage.booster.count,
      fill: COLORS.booster,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/data-labeling">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Kembali
          </Button>
        </Link>
        <div>
          <h1 className="font-bold text-foreground text-2xl">
            Analisis Cakupan SentiStrength
          </h1>
          <p className="text-muted-foreground text-sm">
            Kata dikenal vs tidak dikenal dalam lexicon SentiStrength
          </p>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-4 h-4 text-violet-600" />
              <p className="text-muted-foreground text-xs">Total Kata</p>
            </div>
            <p className="font-bold text-2xl">
              {coverage.total_words?.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              {coverage.total_documents} dokumen
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <p className="text-muted-foreground text-xs">Kata Dikenal</p>
            </div>
            <p className="font-bold text-emerald-600 text-2xl">
              {coverage.coverage.known.count?.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              {coverage.coverage.known.pct}%
            </p>
            <Progress
              value={coverage.coverage.known.pct}
              className="[&>div]:bg-emerald-500 mt-1 h-1.5"
            />
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-600" />
              <p className="text-muted-foreground text-xs">Tidak Dikenal</p>
            </div>
            <p className="font-bold text-red-600 text-2xl">
              {coverage.coverage.unknown.count?.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              {coverage.coverage.unknown.pct}%
            </p>
            <Progress
              value={coverage.coverage.unknown.pct}
              className="[&>div]:bg-red-500 mt-1 h-1.5"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Minus className="w-4 h-4 text-amber-600" />
              <p className="text-muted-foreground text-xs">Kena Negasi</p>
            </div>
            <p className="font-bold text-amber-600 text-2xl">
              {coverage.coverage.negation.count?.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              {coverage.coverage.negation.pct}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-violet-600" />
              <p className="text-muted-foreground text-xs">Kena Booster</p>
            </div>
            <p className="font-bold text-violet-600 text-2xl">
              {coverage.coverage.booster.count?.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              {coverage.coverage.booster.pct}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lexicon Stats */}
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200">
          <CardContent className="p-4 text-center">
            <p className="text-muted-foreground text-xs">Lexicon Positif</p>
            <p className="font-bold text-emerald-600 text-2xl">
              {coverage.lexicon_stats.positive_words?.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 dark:bg-red-950/20 border-red-200">
          <CardContent className="p-4 text-center">
            <p className="text-muted-foreground text-xs">Lexicon Negatif</p>
            <p className="font-bold text-red-600 text-2xl">
              {coverage.lexicon_stats.negative_words?.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
          <CardContent className="p-4 text-center">
            <p className="text-muted-foreground text-xs">Kata Negasi</p>
            <p className="font-bold text-amber-600 text-2xl">
              {coverage.lexicon_stats.negation_words?.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-violet-50 dark:bg-violet-950/20 border-violet-200">
          <CardContent className="p-4 text-center">
            <p className="text-muted-foreground text-xs">Kata Booster</p>
            <p className="font-bold text-violet-600 text-2xl">
              {coverage.lexicon_stats.booster_words?.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📊 Cakupan Lexicon</CardTitle>
            <CardDescription>
              Proporsi kata dikenal vs tidak dikenal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }: any) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => v.toLocaleString()} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📈 Negasi & Booster</CardTitle>
            <CardDescription>
              Jumlah kata yang terkena negasi dan booster
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={barNegBooster}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 14 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => v.toLocaleString()} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barNegBooster.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="unknown" className="space-y-4">
        <TabsList>
          <TabsTrigger value="unknown">
            <XCircle className="mr-2 w-4 h-4 text-red-500" />
            Tidak Dikenal
          </TabsTrigger>
          <TabsTrigger value="known">
            <CheckCircle2 className="mr-2 w-4 h-4 text-emerald-500" />
            Dikenal
          </TabsTrigger>
          <TabsTrigger value="negation">
            <Minus className="mr-2 w-4 h-4 text-amber-500" />
            Negasi ({allNegation.length})
          </TabsTrigger>
          <TabsTrigger value="booster">
            <Zap className="mr-2 w-4 h-4 text-violet-500" />
            Booster ({allBooster.length})
          </TabsTrigger>
        </TabsList>

        {/* Tidak Dikenal */}
        <TabsContent value="unknown">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <XCircle className="w-4 h-4 text-red-600" />
                Kata Tidak Dikenal ({coverage.top_unknown?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">No</TableHead>
                    <TableHead>Kata</TableHead>
                    <TableHead className="text-right">Frekuensi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.top_unknown?.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{item.word}</TableCell>
                      <TableCell className="font-mono text-right">
                        {item.count.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dikenal */}
        <TabsContent value="known">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Kata Dikenal ({coverage.top_known?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">No</TableHead>
                    <TableHead>Kata</TableHead>
                    <TableHead className="text-right">Frekuensi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.top_known?.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{item.word}</TableCell>
                      <TableCell className="font-mono text-right">
                        {item.count.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Negasi */}
        <TabsContent value="negation">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Minus className="w-4 h-4 text-amber-600" />
                Frasa Terkena Negasi ({allNegation.length})
              </CardTitle>
              <CardDescription>
                Pola: kata_negasi + kata_sentimen dalam kalimat asli
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              {allNegation.length === 0 ? (
                <p className="py-8 text-muted-foreground text-sm text-center">
                  Tidak ada frasa negasi ditemukan.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">No</TableHead>
                      <TableHead>Frasa Negasi</TableHead>
                      <TableHead>Kata Negasi</TableHead>
                      <TableHead>Kata Sentimen</TableHead>
                      <TableHead>Kalimat Lengkap</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allNegation.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground align-top">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-amber-600 align-top whitespace-nowrap">
                          {item.phrase}
                        </TableCell>
                        <TableCell className="font-medium align-top">
                          {item.negation_word}
                        </TableCell>
                        <TableCell className="font-medium align-top">
                          {item.sentiment_word}
                        </TableCell>
                        <TableCell className="text-xs leading-relaxed">
                          {item.full_text}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Booster */}
        <TabsContent value="booster">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-violet-600" />
                Frasa Terkena Booster ({allBooster.length})
              </CardTitle>
              <CardDescription>
                Pola: kata_booster + kata_sentimen dalam kalimat asli
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              {allBooster.length === 0 ? (
                <p className="py-8 text-muted-foreground text-sm text-center">
                  Tidak ada frasa booster ditemukan.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">No</TableHead>
                      <TableHead>Frasa Booster</TableHead>
                      <TableHead>Kata Booster</TableHead>
                      <TableHead>Kata Sentimen</TableHead>
                      <TableHead>Posisi</TableHead>
                      <TableHead>Kalimat Lengkap</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allBooster.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground align-top">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-violet-600 align-top whitespace-nowrap">
                          {item.phrase}
                        </TableCell>
                        <TableCell className="font-medium align-top">
                          {item.booster_word}
                        </TableCell>
                        <TableCell className="font-medium align-top">
                          {item.sentiment_word}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline" className="text-xs">
                            {item.position}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs leading-relaxed">
                          {item.full_text}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Analisis */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-muted-foreground text-sm leading-relaxed">
            <strong>📝 Analisis:</strong>
            <br />
            Dataset terdiri dari {coverage.total_documents} dokumen dengan total{" "}
            {coverage.total_words?.toLocaleString()} kata.{" "}
            <strong>{coverage.coverage.known.pct}% kata dikenal</strong> oleh
            lexicon SentiStrength (
            {coverage.lexicon_stats.total_lexicon?.toLocaleString()} kata).{" "}
            <strong>{coverage.coverage.unknown.pct}% kata tidak dikenal</strong>
            , didominasi oleh istilah ekonomi spesifik. Negasi terdeteksi pada{" "}
            {coverage.coverage.negation.pct}% kata (
            {coverage.coverage.negation.count} kemunculan), dan booster pada{" "}
            {coverage.coverage.booster.pct}% kata (
            {coverage.coverage.booster.count} kemunculan).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="w-64 h-8" />
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[400px]" />
      </div>
    </div>
  );
}
