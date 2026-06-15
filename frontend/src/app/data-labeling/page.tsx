"use client";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLoadMore } from "@/hooks/useLoadMore";
import {
  Eye,
  FileText,
  Loader2,
  Minus,
  Play,
  Scale,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface WordDetail {
  word: string;
  score: number;
  type: string;
}

interface WordDetailData {
  guid: string;
  clean_title: string;
  positive_words: WordDetail[];
  negative_words: WordDetail[];
}

interface SentiStrengthItem {
  guid: string;
  clean_title: string;
  label: string;
  pos: number;
  neg: number;
  word_summary?: {
    positive_count: number;
    negative_count: number;
    has_details: boolean;
  };
}

interface SentiStrengthStats {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  avg_positive: number;
  avg_negative: number;
}

export default function SentiStrengthPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SentiStrengthItem | null>(
    null,
  );
  const [wordData, setWordData] = useState<WordDetailData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [stats, setStats] = useState<SentiStrengthStats>({
    total: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    avg_positive: 0,
    avg_negative: 0,
  });

  const {
    items: data,
    loading,
    initialLoading,
    hasMore,
    total,
    pagination,
    loadMore,
    reset,
  } = useLoadMore<SentiStrengthItem>(async (page, pageSize) => {
    const res = await fetch(
      `http://localhost:8000/api/data/sentistrength?page=${page}&page_size=${pageSize}`,
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const result = await res.json();
    return { items: result.items, pagination: result.pagination };
  });

  const fetchStats = async () => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/data/sentistrength/stats",
      );
      const result = await res.json();
      if (result.status === "success") setStats(result.data);
    } catch (err) {
      console.error("Gagal mengambil statistik:", err);
    }
  };

  const fetchWordDetails = async (guid: string) => {
    setIsLoadingDetail(true);
    setWordData(null);

    try {
      const res = await fetch(
        `http://localhost:8000/api/data/sentistrength/${guid}/words`,
      );
      if (res.ok) {
        const result = await res.json();
        if (result.status === "success") {
          setWordData(result.data);
        }
      }
    } catch (err) {
      console.error("Gagal mengambil detail kata:", err);
      toast.error("Gagal mengambil detail kata");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadMore();
    fetchStats();
  }, []);

  const runSentistrength = async () => {
    setIsRunning(true);
    const toastId = toast.loading("Menjalankan SentiStrength...");

    try {
      const res = await fetch(
        "http://localhost:8000/api/pipeline/sentistrength",
        { method: "POST" },
      );
      const result = await res.json();

      if (result.status === "success") {
        toast.success("SentiStrength berhasil!", {
          id: toastId,
          description: `${stats.total} data telah dilabeli`,
        });
        reset();
        fetchStats();
        setTimeout(() => loadMore(), 1000);
      } else {
        toast.error("SentiStrength gagal!", {
          id: toastId,
          description: result.message || "Terjadi kesalahan",
        });
      }
    } catch (err) {
      toast.error("Gagal terhubung ke server", { id: toastId });
    } finally {
      setIsRunning(false);
    }
  };

  const handleOpenDetail = (item: SentiStrengthItem) => {
    setSelectedItem(item);
    fetchWordDetails(item.guid);
  };

  const getLabelBadge = (label: string) => {
    switch (label?.toLowerCase()) {
      case "positive":
        return (
          <Badge className="bg-green-100 dark:bg-green-900/50 font-medium text-green-700 dark:text-green-400">
            <ThumbsUp className="mr-1 w-3 h-3" />
            Positif
          </Badge>
        );
      case "negative":
        return (
          <Badge className="bg-red-100 dark:bg-red-900/50 font-medium text-red-700 dark:text-red-400">
            <ThumbsDown className="mr-1 w-3 h-3" />
            Negatif
          </Badge>
        );
      case "neutral":
        return (
          <Badge className="bg-muted font-medium text-muted-foreground">
            <Minus className="mr-1 w-3 h-3" />
            Neutral
          </Badge>
        );
      default:
        return <Badge variant="outline">{label}</Badge>;
    }
  };

  const getScoreColor = (score: number, type: "pos" | "neg") => {
    if (type === "pos") {
      if (score >= 3) return "text-emerald-600 dark:text-emerald-400 font-bold";
      if (score >= 2) return "text-emerald-500 dark:text-emerald-300";
      return "text-muted-foreground";
    } else {
      if (score <= -3) return "text-red-600 dark:text-red-400 font-bold";
      if (score <= -2) return "text-red-500 dark:text-red-300";
      return "text-muted-foreground";
    }
  };

  if (initialLoading) return <LoadingSkeleton />;

  const positivePct =
    stats.total > 0 ? ((stats.positive / stats.total) * 100).toFixed(1) : "0";
  const neutralPct =
    stats.total > 0 ? ((stats.neutral / stats.total) * 100).toFixed(1) : "0";
  const negativePct =
    stats.total > 0 ? ((stats.negative / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">
            SentiStrength ID
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Pelabelan sentimen menggunakan SentiStrength lexicon
          </p>
        </div>
        <Button
          onClick={runSentistrength}
          disabled={isRunning}
          className="bg-sky-600 hover:bg-sky-700"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <Play className="mr-2 w-4 h-4" />
              Jalankan SentiStrength
            </>
          )}
        </Button>
      </div>

      {/* Stats Cards - 5 Kolom Compact */}
      <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Total
                </p>
                <p className="font-bold tabular-nums text-foreground text-xl">
                  {stats.total.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs truncate">data</p>
              </div>
              <div className="bg-sky-500/10 ml-2 p-2 rounded-lg shrink-0">
                <FileText className="w-4 h-4 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Positif */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Positif
                </p>
                <p className="font-bold tabular-nums text-emerald-600 text-xl">
                  {stats.positive.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{positivePct}%</p>
              </div>
              <div className="bg-emerald-500/10 ml-2 p-2 rounded-lg shrink-0">
                <ThumbsUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Neutral */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Neutral
                </p>
                <p className="font-bold tabular-nums text-foreground text-xl">
                  {stats.neutral.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{neutralPct}%</p>
              </div>
              <div className="bg-muted ml-2 p-2 rounded-lg shrink-0">
                <Minus className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Negatif */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Negatif
                </p>
                <p className="font-bold tabular-nums text-red-600 text-xl">
                  {stats.negative.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">{negativePct}%</p>
              </div>
              <div className="bg-red-500/10 ml-2 p-2 rounded-lg shrink-0">
                <ThumbsDown className="w-4 h-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Avg Score */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Avg Score
                </p>
                <p className="font-bold text-foreground text-lg">
                  <span className="text-emerald-600">
                    +{stats.avg_positive}
                  </span>
                  <span className="mx-0.5 text-muted-foreground">/</span>
                  <span className="text-red-600">
                    -{Math.abs(stats.avg_negative)}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">rata-rata</p>
              </div>
              <div className="bg-violet-500/10 ml-2 p-2 rounded-lg shrink-0">
                <TrendingUp className="w-4 h-4 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <Scale className="w-16 h-16 text-muted-foreground/20" />
            <p className="text-muted-foreground text-lg">
              Belum ada data SentiStrength
            </p>
            <Button
              onClick={runSentistrength}
              className="bg-sky-600 hover:bg-sky-700"
            >
              <Play className="mr-2 w-4 h-4" />
              Jalankan SentiStrength
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-muted/50">
                    <TableHead className="w-[60px] font-bold">No</TableHead>
                    <TableHead className="font-bold">Teks Bersih</TableHead>
                    <TableHead className="w-[120px] font-bold">Label</TableHead>
                    <TableHead className="w-[100px] font-bold text-center">
                      Positif
                    </TableHead>
                    <TableHead className="w-[100px] font-bold text-center">
                      Negatif
                    </TableHead>
                    <TableHead className="w-[60px] font-bold text-center">
                      Detail
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow
                      key={item.guid}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="text-muted-foreground text-center">
                        {(pagination.page - 1) * pagination.page_size +
                          index +
                          1}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[500px] text-foreground line-clamp-2">
                          {item.clean_title}
                        </p>
                      </TableCell>
                      <TableCell>{getLabelBadge(item.label)}</TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`font-mono text-sm ${getScoreColor(item.pos, "pos")}`}
                        >
                          +{item.pos}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`font-mono text-sm ${getScoreColor(item.neg, "neg")}`}
                        >
                          {item.neg}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetail(item)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data.length > 0 && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loading}
          hasMore={hasMore}
          currentCount={data.length}
          totalCount={total}
        />
      )}

      {/* Dialog Detail */}
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
            setWordData(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detail SentiStrength
              {selectedItem && getLabelBadge(selectedItem.label)}
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 mt-4">
              {/* Teks */}
              <div className="bg-muted/50 p-4 border rounded-lg">
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Teks Bersih
                </p>
                <p className="text-foreground">{selectedItem.clean_title}</p>
              </div>

              {/* Skor */}
              <div className="gap-4 grid grid-cols-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 border border-emerald-100 dark:border-emerald-800 rounded-lg text-center">
                  <p className="mb-1 font-medium text-emerald-600 dark:text-emerald-400 text-xs">
                    Skor Positif
                  </p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-2xl">
                    +{selectedItem.pos}
                  </p>
                </div>
                <div className="bg-muted/50 p-4 border rounded-lg text-center">
                  <p className="mb-1 font-medium text-muted-foreground text-xs">
                    Label
                  </p>
                  <div className="mt-1">
                    {getLabelBadge(selectedItem.label)}
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 p-4 border border-red-100 dark:border-red-800 rounded-lg text-center">
                  <p className="mb-1 font-medium text-red-600 dark:text-red-400 text-xs">
                    Skor Negatif
                  </p>
                  <p className="font-bold text-red-600 dark:text-red-400 text-2xl">
                    {selectedItem.neg}
                  </p>
                </div>
              </div>

              {/* Loading */}
              {isLoadingDetail && (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                </div>
              )}

              {/* Kata Positif */}
              {!isLoadingDetail &&
                wordData &&
                wordData.positive_words.length > 0 && (
                  <div>
                    <p className="mb-2 font-medium text-emerald-700 dark:text-emerald-400 text-sm">
                      Kata Positif ({wordData.positive_words.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {wordData.positive_words.map((word, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                        >
                          {word.word}
                          <span className="opacity-75 ml-1.5 font-mono text-xs">
                            +{word.score}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {/* Kata Negatif */}
              {!isLoadingDetail &&
                wordData &&
                wordData.negative_words.length > 0 && (
                  <div>
                    <p className="mb-2 font-medium text-red-700 dark:text-red-400 text-sm">
                      Kata Negatif ({wordData.negative_words.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {wordData.negative_words.map((word, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                        >
                          {word.word}
                          <span className="opacity-75 ml-1.5 font-mono text-xs">
                            {word.score}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {/* Tidak ada kata */}
              {!isLoadingDetail &&
                wordData &&
                wordData.positive_words.length === 0 &&
                wordData.negative_words.length === 0 && (
                  <div className="py-4 text-muted-foreground text-sm text-center">
                    Tidak ada kata sentimen yang terdeteksi
                  </div>
                )}

              {/* GUID */}
              <div className="pt-2 text-center">
                <Badge variant="secondary" className="font-mono text-xs">
                  GUID: {selectedItem.guid}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
      <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="w-full h-18" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="space-y-3 p-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-8 h-4" />
                <Skeleton className="flex-1 h-10" />
                <Skeleton className="w-20 h-6" />
                <Skeleton className="w-16 h-6" />
                <Skeleton className="w-16 h-6" />
                <Skeleton className="w-8 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
