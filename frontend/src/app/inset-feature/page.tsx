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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  FileText,
  Hash,
  Loader2,
  Play,
  Puzzle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface InsetFeatureItem {
  guid: string;
  clean_title: string;
  inset_pos: number;
  inset_neg: number;
  inset_pos_norm: number;
  inset_neg_norm: number;
}

interface InsetStats {
  max_pos: number;
  min_pos: number;
  max_neg: number;
  min_neg: number;
  avg_pos: string;
  avg_neg: string;
  total: number;
  has_both: number;
}

type SortField = "pos" | "neg";
type SortOrder = "asc" | "desc";

export default function InsetFeaturePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InsetFeatureItem | null>(
    null,
  );
  const [sortField, setSortField] = useState<SortField>("pos");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [stats, setStats] = useState<InsetStats>({
    max_pos: 0,
    min_pos: 0,
    max_neg: 0,
    min_neg: 0,
    avg_pos: "0",
    avg_neg: "0",
    total: 0,
    has_both: 0,
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
  } = useLoadMore<InsetFeatureItem>(async (page, pageSize) => {
    const res = await fetch(
      `http://localhost:8000/api/data/features?page=${page}&page_size=${pageSize}`,
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const result = await res.json();
    if (result.stats) setStats(result.stats);
    return { items: result.items, pagination: result.pagination };
  });

  useEffect(() => {
    loadMore();
  }, []);

  const runInsetFeature = async () => {
    setIsRunning(true);
    const toastId = toast.loading("Menjalankan InSet Feature...");
    try {
      const res = await fetch(
        "http://localhost:8000/api/pipeline/inset_feature",
        { method: "POST" },
      );
      const result = await res.json();
      if (result.status === "success") {
        toast.success("InSet Feature berhasil!", { id: toastId });
        reset();
        setTimeout(() => loadMore(), 500);
      } else {
        toast.error("InSet Feature gagal!", {
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    // TIDAK RESET! Sort di frontend dari data yang sudah di-load
  };

  // Sort di frontend (dari data yang sudah di-load, sebanyak apapun)
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      let valA = sortField === "pos" ? a.inset_pos : a.inset_neg;
      let valB = sortField === "pos" ? b.inset_pos : b.inset_neg;
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortOrder]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="opacity-40 ml-1 w-3.5 h-3.5" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 w-3.5 h-3.5" />
    ) : (
      <ArrowDown className="ml-1 w-3.5 h-3.5" />
    );
  };

  if (initialLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">InSet Feature</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Ekstraksi fitur leksikon InSet untuk sentimen positif dan negatif
          </p>
        </div>
        <Button
          onClick={runInsetFeature}
          disabled={isRunning}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <Play className="mr-2 w-4 h-4" />
              Jalankan InSet Feature
            </>
          )}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
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
                <p className="text-muted-foreground text-xs">data</p>
              </div>
              <div className="bg-amber-500/10 ml-2 p-2 rounded-lg shrink-0">
                <FileText className="w-4 h-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Max Positif
                </p>
                <p className="font-bold tabular-nums text-emerald-600 text-xl">
                  +{stats.max_pos}
                </p>
                <p className="text-muted-foreground text-xs">skor tertinggi</p>
              </div>
              <div className="bg-emerald-500/10 ml-2 p-2 rounded-lg shrink-0">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Min Negatif
                </p>
                <p className="font-bold tabular-nums text-red-600 text-xl">
                  {stats.min_neg}
                </p>
                <p className="text-muted-foreground text-xs">skor terendah</p>
              </div>
              <div className="bg-red-500/10 ml-2 p-2 rounded-lg shrink-0">
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Ada Pos & Neg
                </p>
                <p className="font-bold tabular-nums text-violet-600 text-xl">
                  {stats.has_both.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">keduanya</p>
              </div>
              <div className="bg-violet-500/10 ml-2 p-2 rounded-lg shrink-0">
                <Hash className="w-4 h-4 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium text-muted-foreground text-xs truncate uppercase tracking-wider">
                  Avg Score
                </p>
                <p className="font-bold text-foreground text-lg">
                  <span className="text-emerald-600">+{stats.avg_pos}</span>
                  <span className="mx-0.5 text-muted-foreground">/</span>
                  <span className="text-red-600">{stats.avg_neg}</span>
                </p>
                <p className="text-muted-foreground text-xs">rata-rata</p>
              </div>
              <div className="bg-sky-500/10 ml-2 p-2 rounded-lg shrink-0">
                <Hash className="w-4 h-4 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {sortedData.length === 0 && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <Puzzle className="w-16 h-16 text-muted-foreground/20" />
            <p className="text-muted-foreground text-lg">
              Belum ada data fitur InSet
            </p>
            <Button
              onClick={runInsetFeature}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Play className="mr-2 w-4 h-4" />
              Jalankan InSet Feature
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
                    <TableHead className="w-[60px] font-bold text-center">
                      No
                    </TableHead>
                    <TableHead className="font-bold">Teks Bersih</TableHead>
                    <TableHead
                      className="w-[220px] font-bold cursor-pointer select-none"
                      onClick={() => handleSort("pos")}
                    >
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        Skor Positif <SortIcon field="pos" />
                      </span>
                    </TableHead>
                    <TableHead
                      className="w-[220px] font-bold cursor-pointer select-none"
                      onClick={() => handleSort("neg")}
                    >
                      <span className="flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                        Skor Negatif <SortIcon field="neg" />
                      </span>
                    </TableHead>
                    <TableHead className="w-[60px] font-bold text-center">
                      Detail
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((item, index) => (
                    <TableRow
                      key={`${item.guid}-${index}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium text-muted-foreground text-center">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[400px] text-foreground line-clamp-2">
                          {item.clean_title}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="font-mono font-bold text-emerald-600 text-sm">
                              +{item.inset_pos}
                            </span>
                            <span className="font-mono text-muted-foreground text-xs">
                              {(item.inset_pos_norm ?? 0).toFixed(3)}
                            </span>
                          </div>
                          <Progress
                            value={(item.inset_pos_norm ?? 0) * 100}
                            className="h-1.5"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="font-mono font-bold text-red-600 text-sm">
                              {item.inset_neg}
                            </span>
                            <span className="font-mono text-muted-foreground text-xs">
                              {(item.inset_neg_norm ?? 0).toFixed(3)}
                            </span>
                          </div>
                          <Progress
                            value={(item.inset_neg_norm ?? 0) * 100}
                            className="h-1.5"
                          />
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

      {sortedData.length > 0 && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loading}
          hasMore={hasMore}
          currentCount={sortedData.length}
          totalCount={total}
        />
      )}

      {/* Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail InSet Feature</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 mt-4">
              <div className="bg-muted/50 p-4 border rounded-lg">
                <p className="mb-2 font-medium text-muted-foreground text-xs">
                  Teks Bersih
                </p>
                <p className="text-foreground">{selectedItem.clean_title}</p>
              </div>
              <div className="gap-4 grid grid-cols-2">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 border border-emerald-100 dark:border-emerald-800 rounded-lg">
                  <TrendingUp className="mb-2 w-5 h-5 text-emerald-600" />
                  <p className="font-bold text-emerald-600 text-3xl">
                    +{selectedItem.inset_pos}
                  </p>
                  <Progress
                    value={(selectedItem.inset_pos_norm ?? 0) * 100}
                    className="mt-3 h-2"
                  />
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 p-4 border border-red-100 dark:border-red-800 rounded-lg">
                  <TrendingDown className="mb-2 w-5 h-5 text-red-600" />
                  <p className="font-bold text-red-600 text-3xl">
                    {selectedItem.inset_neg}
                  </p>
                  <Progress
                    value={(selectedItem.inset_neg_norm ?? 0) * 100}
                    className="mt-3 h-2"
                  />
                </div>
              </div>
              <div className="bg-muted/50 p-4 border rounded-lg text-center">
                <p className="font-bold text-2xl">
                  {selectedItem.inset_pos + selectedItem.inset_neg > 0
                    ? "+"
                    : ""}
                  {selectedItem.inset_pos + selectedItem.inset_neg}
                </p>
              </div>
              <div className="text-center">
                <Badge variant="secondary" className="text-xs">
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
                <Skeleton className="w-[220px] h-10" />
                <Skeleton className="w-[220px] h-10" />
                <Skeleton className="w-8 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
