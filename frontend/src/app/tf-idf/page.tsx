"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Cloud,
  FileText,
  Hash,
  Loader2,
  Play,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface TopFeature {
  rank: number;
  word: string;
  score: number;
  idf: number;
  type: "unigram" | "bigram";
}
interface TfidfSummary {
  total_features: number;
  top_features: TopFeature[];
  stats: { mean_score: number; max_score: number; min_score: number };
}
interface WordCloudItem {
  word: string;
  score: number;
}
type SortField = "word" | "type" | "score" | "idf";
type SortOrder = "asc" | "desc";

const wordcloudConfig = {
  positive: {
    title: "Positif",
    colors: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800",
  },
  neutral: {
    title: "Neutral",
    colors: "text-muted-foreground",
    bg: "bg-muted/30 border",
  },
  negative: {
    title: "Negatif",
    colors: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-800",
  },
};

export default function TfIdfPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<TfidfSummary>({
    total_features: 0,
    top_features: [],
    stats: { mean_score: 0, max_score: 0, min_score: 0 },
  });
  const [wordcloud, setWordcloud] = useState<Record<string, WordCloudItem[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [wordcloudLoading, setWordcloudLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const fetchSummary = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/tfidf/summary");
      const data = await res.json();
      if (!data.error && data.top_features) setSummary(data);
    } catch (err) {
      /* silent */
    }
  };

  const fetchWordcloud = async () => {
    setWordcloudLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/tfidf/wordcloud");
      const data = await res.json();
      if (data.status === "success") setWordcloud(data.data);
    } catch (err) {
      /* silent */
    } finally {
      setWordcloudLoading(false);
    }
  };

  useEffect(() => {
    // Fetch summary dulu (cepat), tampilkan UI
    fetchSummary().then(() => setLoading(false));
    // Wordcloud di background (lambat)
    fetchWordcloud();
  }, []);

  const handleRunTfidf = async () => {
    setIsProcessing(true);
    const toastId = toast.loading("Menjalankan TF-IDF...");
    try {
      const response = await fetch(
        "http://localhost:8000/api/pipeline/tfidf_vectorizer",
        { method: "POST" },
      );
      const result = await response.json();
      if (result.status === "success") {
        toast.success("TF-IDF berhasil!", {
          id: toastId,
          description: `${summary.total_features || "..."} fitur diekstrak`,
        });
        await fetchSummary();
        fetchWordcloud();
      } else
        toast.error("TF-IDF gagal!", {
          id: toastId,
          description: result.message || "Terjadi kesalahan",
        });
    } catch (error) {
      toast.error("Gagal terhubung ke server", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedFeatures = [...summary.top_features].sort((a, b) => {
    let valA: any, valB: any;
    switch (sortField) {
      case "word":
        valA = a.word.toLowerCase();
        valB = b.word.toLowerCase();
        break;
      case "type":
        valA = a.type;
        valB = b.type;
        break;
      case "score":
        valA = a.score;
        valB = b.score;
        break;
      case "idf":
        valA = a.idf;
        valB = b.idf;
        break;
      default:
        return 0;
    }
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="opacity-40 ml-1 w-3.5 h-3.5" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 w-3.5 h-3.5" />
    ) : (
      <ArrowDown className="ml-1 w-3.5 h-3.5" />
    );
  };

  if (loading) return <LoadingSkeleton />;

  const unigramCount = summary.top_features.filter(
    (f) => f.type === "unigram",
  ).length;
  const bigramCount = summary.top_features.filter(
    (f) => f.type === "bigram",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">
            Analisis TF-IDF
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Term Frequency - Inverse Document Frequency
          </p>
        </div>
        <Button onClick={handleRunTfidf} disabled={isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <Play className="mr-2 w-4 h-4" />
              Jalankan TF-IDF
            </>
          )}
        </Button>
      </div>

      <div className="gap-3 grid grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Total Fitur
                </p>
                <p className="font-bold tabular-nums text-foreground text-xl">
                  {summary.total_features.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">
                  {unigramCount} uni + {bigramCount} bi
                </p>
              </div>
              <div className="flex-shrink-0 bg-primary/10 ml-2 p-2 rounded-lg">
                <Hash className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Mean Score
                </p>
                <p className="font-bold tabular-nums text-foreground text-xl">
                  {summary.stats.mean_score.toFixed(4)}
                </p>
                <p className="text-muted-foreground text-xs">
                  rata-rata TF-IDF
                </p>
              </div>
              <div className="flex-shrink-0 bg-emerald-500/10 ml-2 p-2 rounded-lg">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Max Score
                </p>
                <p className="font-bold tabular-nums text-violet-600 text-xl">
                  {summary.stats.max_score.toFixed(4)}
                </p>
                <p className="text-muted-foreground text-xs">skor tertinggi</p>
              </div>
              <div className="flex-shrink-0 bg-violet-500/10 ml-2 p-2 rounded-lg">
                <Zap className="w-4 h-4 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Status
                </p>
                <p className="font-bold text-emerald-600 text-xl">
                  {summary.total_features > 0 ? "Active" : "Ready"}
                </p>
                <p className="text-muted-foreground text-xs">model</p>
              </div>
              <div className="flex-shrink-0 bg-amber-500/10 ml-2 p-2 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="wordcloud" className="space-y-4">
        <TabsList>
          <TabsTrigger value="wordcloud">
            <Cloud className="mr-2 w-4 h-4" />
            Word Cloud per Kelas
          </TabsTrigger>
          <TabsTrigger value="table">
            <BarChart3 className="mr-2 w-4 h-4" />
            TF-IDF Table
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wordcloud">
          <Card className="border">
            <CardHeader>
              <CardTitle className="text-lg">Word Cloud per Kelas</CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                Visualisasi kata dominan berdasarkan sentimen (diurutkan: paling
                penting di atas)
              </p>
            </CardHeader>
            <CardContent>
              {wordcloudLoading ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <span className="ml-3 text-muted-foreground">
                    Memuat word cloud...
                  </span>
                </div>
              ) : Object.keys(wordcloud).length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <Cloud className="w-16 h-16 text-muted-foreground/20" />
                  <p className="text-muted-foreground text-lg">
                    Jalankan TF-IDF terlebih dahulu
                  </p>
                  <Button onClick={handleRunTfidf}>
                    <Play className="mr-2 w-4 h-4" />
                    Jalankan TF-IDF
                  </Button>
                </div>
              ) : (
                <div className="gap-6 grid grid-cols-1 md:grid-cols-3">
                  {(["positive", "neutral", "negative"] as const).map(
                    (label) => {
                      const words = wordcloud[label] || [];
                      const config = wordcloudConfig[label];
                      return (
                        <div
                          key={label}
                          className={`${config.bg} p-4 rounded-xl border`}
                        >
                          <h3
                            className={`font-semibold mb-3 text-center ${config.colors}`}
                          >
                            {config.title}
                            <span className="opacity-70 ml-1 font-normal text-xs">
                              ({words.length} kata)
                            </span>
                          </h3>
                          <div className="flex flex-wrap justify-center content-start gap-1.5 min-h-[200px]">
                            {words.length === 0 ? (
                              <p className="mt-8 text-muted-foreground text-sm">
                                Belum ada data
                              </p>
                            ) : (
                              words.map((item, i) => (
                                <span
                                  key={i}
                                  className={`${config.colors} hover:scale-110 transition-transform cursor-default`}
                                  style={{
                                    fontSize: `${Math.max(10, 26 - i * 0.3)}px`,
                                    opacity: Math.max(0.25, 1 - i * 0.013),
                                    fontWeight: i < 10 ? "bold" : "normal",
                                  }}
                                  title={`Score: ${item.score.toFixed(4)}`}
                                >
                                  {item.word}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table">
          <Card className="border">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg">Top Features</CardTitle>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Klik header kolom untuk mengurutkan
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <FileText className="mr-1 w-3 h-3" />
                    Unigram: {unigramCount}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <FileText className="mr-1 w-3 h-3" />
                    Bigram: {bigramCount}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {summary.top_features.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <BarChart3 className="w-16 h-16 text-muted-foreground/20" />
                  <p className="text-muted-foreground text-lg">
                    Belum ada data fitur
                  </p>
                  <Button onClick={handleRunTfidf}>
                    <Play className="mr-2 w-4 h-4" />
                    Jalankan TF-IDF
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead
                          className="font-bold cursor-pointer select-none"
                          onClick={() => handleSort("word")}
                        >
                          <span className="flex items-center">
                            Kata <SortIcon field="word" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="w-[80px] font-bold text-center cursor-pointer select-none"
                          onClick={() => handleSort("type")}
                        >
                          <span className="flex justify-center items-center">
                            Tipe <SortIcon field="type" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="w-[140px] font-bold text-right cursor-pointer select-none"
                          onClick={() => handleSort("score")}
                        >
                          <span className="flex justify-end items-center">
                            Mean TF-IDF <SortIcon field="score" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="w-[100px] font-bold text-right cursor-pointer select-none"
                          onClick={() => handleSort("idf")}
                        >
                          <span className="flex justify-end items-center">
                            IDF <SortIcon field="idf" />
                          </span>
                        </TableHead>
                        <TableHead className="w-[200px] font-bold">
                          Bobot Relatif
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedFeatures.map((item) => {
                        const isBigram = item.type === "bigram";
                        const maxScore = summary.stats.max_score;
                        const pct = (item.score / maxScore) * 100;
                        return (
                          <TableRow
                            key={item.rank}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <TableCell>
                              <span
                                className={`font-medium text-foreground ${isBigram ? "italic" : ""}`}
                              >
                                {item.word}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={isBigram ? "secondary" : "outline"}
                                className="text-xs"
                              >
                                {isBigram ? "Bigram" : "Unigram"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm text-right">
                              <span className="font-semibold text-violet-600">
                                {item.score.toFixed(6)}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground text-sm text-right">
                              {item.idf}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={pct} className="flex-1 h-2" />
                                <span className="w-10 text-muted-foreground text-xs text-right">
                                  {pct.toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
      <Card>
        <CardHeader>
          <Skeleton className="w-48 h-6" />
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-64" />
        </CardContent>
      </Card>
    </div>
  );
}
