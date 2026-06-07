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
import { useLoadMore } from "@/hooks/useLoadMore";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Eye,
  Loader2,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

interface DuplicateItem {
  id: number;
  retained_title: string;
  removed_title: string;
  jaccard_score: number;
}

interface DuplicateResponse {
  status: string;
  summary: { total_duplicate_pairs: number };
  items: DuplicateItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_more: boolean;
  };
}

export default function DeduplicationPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [pipelineOutput, setPipelineOutput] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [selectedItem, setSelectedItem] = useState<DuplicateItem | null>(null);

  const {
    items: data,
    loading,
    initialLoading,
    hasMore,
    total,
    pagination,
    loadMore,
    reset,
  } = useLoadMore<DuplicateItem>(async (page, pageSize) => {
    const res = await fetch(
      `http://localhost:8000/api/data/duplicates?page=${page}&page_size=${pageSize}`,
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const result: DuplicateResponse = await res.json();
    return { items: result.items, pagination: result.pagination };
  });

  useEffect(() => {
    loadMore();
  }, []);

  const runDeduplication = async () => {
    setIsRunning(true);
    setPipelineStatus("running");
    setPipelineOutput("");
    try {
      const res = await fetch(
        "http://localhost:8000/api/pipeline/deduplication",
        { method: "POST" },
      );
      const result = await res.json();
      setPipelineOutput(result.output || result.message);
      if (result.status === "success") {
        setPipelineStatus("success");
        reset();
        setTimeout(() => loadMore(), 1000);
      } else {
        setPipelineStatus("error");
      }
    } catch (err) {
      setPipelineOutput("Gagal menjalankan deduplikasi");
      setPipelineStatus("error");
    } finally {
      setIsRunning(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8)
      return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
    if (score >= 0.6)
      return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
    if (score >= 0.4)
      return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
    return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  };

  const highSimilarity = data.filter(
    (item) => item.jaccard_score >= 0.8,
  ).length;
  const avgSimilarity =
    data.length > 0
      ? (
          (data.reduce((sum, item) => sum + item.jaccard_score, 0) /
            data.length) *
          100
        ).toFixed(1)
      : "0";

  if (initialLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {/* <div className="bg-destructive p-2 rounded-xl">
              <Trash2 className="w-6 h-6 text-destructive-foreground" />
            </div> */}
            <div>
              <h1 className="font-bold text-foreground text-3xl">
                Deduplikasi Berita
              </h1>
              <p className="mt-1 text-muted-foreground text-sm">
                Deteksi dan penghapusan berita duplikat berdasarkan kemiripan
                teks
              </p>
            </div>
          </div>
        </div>

        {/* <div className="flex items-center gap-3">
          <Badge variant="secondary" className="px-3 py-1.5 text-sm">
            <Trash2 className="mr-1.5 w-3.5 h-3.5" />
            {total.toLocaleString()} Duplikat
          </Badge>
          <Button
            onClick={runDeduplication}
            disabled={isRunning}
            variant="destructive"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Play className="mr-2 w-4 h-4" />
                Jalankan Deduplikasi
              </>
            )}
          </Button>
        </div> */}
      </div>

      {/* Pipeline Output */}
      {pipelineOutput && (
        <Card className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {pipelineStatus === "success" && (
                <Badge className="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="mr-1 w-3 h-3" />
                  Success
                </Badge>
              )}
              {pipelineStatus === "error" && (
                <Badge className="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">
                  <XCircle className="mr-1 w-3 h-3" />
                  Error
                </Badge>
              )}
              {pipelineStatus === "running" && (
                <Badge className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400">
                  <Loader2 className="mr-1 w-3 h-3 animate-spin" />
                  Running
                </Badge>
              )}
            </div>
            <pre className="max-h-60 overflow-y-auto font-mono text-sm whitespace-pre-wrap">
              {pipelineOutput}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className="bg-destructive/10 p-2 rounded-lg">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs">
                Total Duplikat
              </p>
              <p className="font-bold text-foreground text-lg">
                {total.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className="bg-orange-500/10 p-2 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs">
                Similaritas Tinggi
              </p>
              <p className="font-bold text-foreground text-lg">
                {highSimilarity}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className="bg-primary/10 p-2 rounded-lg">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs">
                Rata-rata Similaritas
              </p>
              <p className="font-bold text-foreground text-lg">
                {avgSimilarity}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className="bg-emerald-500/10 p-2 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs">
                Ditampilkan
              </p>
              <p className="font-bold text-foreground text-lg">
                {data.length.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Trash2 className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground text-lg">
              Belum ada data duplikasi
            </p>
            <Button onClick={runDeduplication} variant="destructive">
              <Play className="mr-2 w-4 h-4" />
              Jalankan Deduplikasi
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-[60px]">No</TableHead>
                    <TableHead className="w-[40%]">
                      <Badge className="bg-green-100 hover:bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs">
                        Disimpan
                      </Badge>
                    </TableHead>
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead className="w-[40%]">
                      <Badge
                        variant="outline"
                        className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs"
                      >
                        Dihapus
                      </Badge>
                    </TableHead>
                    <TableHead className="w-[140px]">Similaritas</TableHead>
                    <TableHead className="w-[60px] text-center">
                      Detail
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium text-muted-foreground text-center">
                        {(pagination.page - 1) * pagination.page_size +
                          index +
                          1}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[350px] font-medium text-foreground line-clamp-2">
                          {item.retained_title}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[350px] text-muted-foreground line-clamp-2">
                          {item.removed_title}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div
                          className={`relative  h-6 rounded-full overflow-hidden border font-mono font-bold text-xs ${getScoreColor(item.jaccard_score)}`}
                        >
                          <div
                            className="absolute inset-0 bg-current opacity-20 h-full transition-all duration-500"
                            style={{ width: `${item.jaccard_score * 100}%` }}
                          />
                          <span className="absolute inset-0 flex justify-center items-center">
                            {(item.jaccard_score * 100).toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedItem(item)}
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Duplikasi</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 mt-4">
              <div className="bg-green-50 dark:bg-green-950/30 p-4 border border-green-100 dark:border-green-800 rounded-lg">
                <Badge className="bg-green-100 dark:bg-green-900/50 mb-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="mr-1 w-3 h-3" />
                  Disimpan
                </Badge>
                <p className="mt-2 font-medium text-foreground">
                  {selectedItem.retained_title}
                </p>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="w-6 h-6 text-destructive/60" />
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 p-4 border border-red-100 dark:border-red-800 rounded-lg">
                <Badge
                  variant="outline"
                  className="mb-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
                >
                  <XCircle className="mr-1 w-3 h-3" />
                  Dihapus
                </Badge>
                <p className="mt-2 text-foreground">
                  {selectedItem.removed_title}
                </p>
              </div>
              <div className="bg-muted/50 p-4 border rounded-lg">
                <p className="mb-3 font-medium text-muted-foreground text-sm">
                  Skor Similaritas (Jaccard)
                </p>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={`font-mono font-bold text-lg px-3 py-1 ${getScoreColor(selectedItem.jaccard_score)}`}
                  >
                    {(selectedItem.jaccard_score * 100).toFixed(1)}%
                  </Badge>
                  <div className="flex-1">
                    <Progress
                      value={selectedItem.jaccard_score * 100}
                      className="h-2"
                    />
                  </div>
                </div>
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
    <div className="space-y-6 p-8">
      <div className="space-y-2">
        <Skeleton className="w-64 h-8" />
        <Skeleton className="w-48 h-4" />
      </div>
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4">
              <Skeleton className="w-full h-12" />
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
                <Skeleton className="w-4 h-4" />
                <Skeleton className="flex-1 h-10" />
                <Skeleton className="w-24 h-10" />
                <Skeleton className="w-8 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
