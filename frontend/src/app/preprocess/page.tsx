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
  ArrowRight,
  CheckCircle2,
  Eye,
  FileText,
  Filter,
  Hash,
  Loader2,
  Play,
  Settings,
  TrendingDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface PreprocessItem {
  guid: string;
  original_title: string;
  clean_title: string;
}

export default function PreprocessPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PreprocessItem | null>(null);

  const {
    items: data,
    loading,
    initialLoading,
    hasMore,
    total,
    pagination,
    loadMore,
    reset,
  } = useLoadMore<PreprocessItem>(async (page, pageSize) => {
    const res = await fetch(
      `http://localhost:8000/api/data/preprocessing?page=${page}&page_size=${pageSize}`,
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const result = await res.json();
    return { items: result.items, pagination: result.pagination };
  });

  useEffect(() => {
    loadMore();
  }, []);

  const runPreprocessing = async () => {
    setIsRunning(true);
    const toastId = toast.loading("Menjalankan preprocessing...");

    try {
      const res = await fetch(
        "http://localhost:8000/api/pipeline/preprocessing",
        { method: "POST" },
      );
      const result = await res.json();

      if (result.status === "success") {
        toast.success("Preprocessing berhasil!", {
          id: toastId,
          description: `${total} data telah diproses`,
        });
        reset();
        setTimeout(() => loadMore(), 1000);
      } else {
        toast.error("Preprocessing gagal!", {
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

  const avgOriginalLength =
    data.length > 0
      ? Math.round(
          data.reduce((sum, item) => sum + item.original_title.length, 0) /
            data.length,
        )
      : 0;
  const avgCleanLength =
    data.length > 0
      ? Math.round(
          data.reduce((sum, item) => sum + item.clean_title.length, 0) /
            data.length,
        )
      : 0;
  const avgReduction =
    avgOriginalLength > 0
      ? (
          ((avgOriginalLength - avgCleanLength) / avgOriginalLength) *
          100
        ).toFixed(1)
      : "0";

  if (initialLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Preprocessing</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Pembersihan teks berita sebelum analisis sentimen
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* <Badge variant="secondary" className="px-3 py-1.5 text-sm">
            <FileText className="mr-1.5 w-3.5 h-3.5" />
            {total.toLocaleString()} Data
          </Badge> */}
          <Button
            onClick={runPreprocessing}
            disabled={isRunning}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Play className="mr-2 w-4 h-4" />
                Jalankan Preprocessing
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Total Data
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {total.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">data diproses</p>
              </div>
              <div className="bg-purple-500/10 p-2.5 rounded-xl">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Rata-rata Awal
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {avgOriginalLength}
                  <span className="ml-1 font-normal text-muted-foreground text-sm">
                    char
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  sebelum cleaning
                </p>
              </div>
              <div className="bg-sky-500/10 p-2.5 rounded-xl">
                <Hash className="w-5 h-5 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Rata-rata Bersih
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {avgCleanLength}
                  <span className="ml-1 font-normal text-muted-foreground text-sm">
                    char
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  setelah cleaning
                </p>
              </div>
              <div className="bg-emerald-500/10 p-2.5 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Reduksi
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {avgReduction}%
                </p>
                <div className="flex items-center gap-1 text-emerald-600 text-xs">
                  <TrendingDown className="w-3 h-3" />
                  <span>pengurangan teks</span>
                </div>
              </div>
              <div className="bg-amber-500/10 p-2.5 rounded-xl">
                <Filter className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <Settings className="w-16 h-16 text-muted-foreground/20" />
            <p className="text-muted-foreground text-lg">
              Belum ada data preprocessing
            </p>
            <Button
              onClick={runPreprocessing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Play className="mr-2 w-4 h-4" />
              Jalankan Preprocessing
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
                    <TableHead className="w-[45%] font-bold">
                      <Badge
                        variant="outline"
                        className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs"
                      >
                        Original
                      </Badge>
                    </TableHead>
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead className="w-[45%] font-bold">
                      <Badge className="bg-green-100 hover:bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs">
                        Cleaned
                      </Badge>
                    </TableHead>
                    <TableHead className="w-[80px] font-bold text-center">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow
                      key={item.guid}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium text-muted-foreground text-center">
                        {(pagination.page - 1) * pagination.page_size +
                          index +
                          1}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[400px] text-muted-foreground line-clamp-2">
                          {item.original_title}
                        </p>
                        <p className="mt-1 text-muted-foreground/60 text-xs">
                          {item.original_title.length} char
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[400px] font-medium text-foreground line-clamp-2">
                          {item.clean_title}
                        </p>
                        <p className="mt-1 text-emerald-600 dark:text-emerald-400 text-xs">
                          {item.clean_title.length} char (-
                          {item.original_title.length - item.clean_title.length}
                          )
                        </p>
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

      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Preprocessing</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 mt-4">
              <div className="bg-red-50 dark:bg-red-950/30 p-4 border border-red-100 dark:border-red-800 rounded-lg">
                <Badge
                  variant="outline"
                  className="mb-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
                >
                  Original
                </Badge>
                <p className="mt-2 text-foreground">
                  {selectedItem.original_title}
                </p>
                <p className="mt-2 text-muted-foreground text-xs">
                  {selectedItem.original_title.length} karakter
                </p>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="w-6 h-6 text-purple-400" />
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 p-4 border border-green-100 dark:border-green-800 rounded-lg">
                <Badge className="bg-green-100 dark:bg-green-900/50 mb-2 text-green-700 dark:text-green-400">
                  Cleaned
                </Badge>
                <p className="mt-2 font-medium text-foreground">
                  {selectedItem.clean_title}
                </p>
                <p className="mt-2 text-emerald-600 dark:text-emerald-400 text-xs">
                  {selectedItem.clean_title.length} karakter (-
                  {selectedItem.original_title.length -
                    selectedItem.clean_title.length}
                  )
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
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="w-full h-20" />
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
                <Skeleton className="flex-1 h-12" />
                <Skeleton className="w-4 h-4" />
                <Skeleton className="flex-1 h-12" />
                <Skeleton className="w-8 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
