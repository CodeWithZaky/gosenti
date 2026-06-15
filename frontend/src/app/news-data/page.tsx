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
  Calendar,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Newspaper,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";

interface NewsItem {
  guid: string;
  title: string;
  url: string;
  portal_name: string;
  published_at: string | null;
  scraped_at: string | null;
}

export default function NewsDataPage() {
  const {
    items: data,
    loading,
    initialLoading,
    hasMore,
    total,
    pagination,
    loadMore,
  } = useLoadMore<NewsItem>(async (page, pageSize) => {
    const res = await fetch(
      `http://localhost:8000/api/news?page=${page}&page_size=${pageSize}`,
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const result = await res.json();
    return { items: result.items, pagination: result.pagination };
  });

  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  useEffect(() => {
    loadMore();
  }, []);

  if (initialLoading) return <LoadingSkeleton />;

  const portals = [...new Set(data.map((item) => item.portal_name))];

  // Hitung statistik tambahan
  const tanggalTerbaru =
    data.length > 0
      ? data.reduce((latest, item) => {
          if (!item.published_at) return latest;
          const d = new Date(item.published_at);
          return d > latest ? d : latest;
        }, new Date(0))
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="font-bold text-foreground text-3xl">Data Berita</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Data mentah hasil scraping sebelum diproses
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="px-3 py-1.5 text-sm">
            <Newspaper className="mr-1.5 w-3.5 h-3.5" />
            {total.toLocaleString()} Berita
          </Badge>
        </div>
      </div>

      {/* Stats Cards - 4 Kolom */}
      <div className="gap-4 grid grid-cols-2 lg:grid-cols-4">
        {/* Total Data */}
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
                <p className="text-muted-foreground text-xs">
                  berita terkumpul
                </p>
              </div>
              <div className="bg-primary/10 p-2.5 rounded-xl">
                <Newspaper className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portal */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Portal
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {portals.length}
                </p>
                <p className="text-muted-foreground text-xs">sumber berita</p>
              </div>
              <div className="bg-sky-500/10 p-2.5 rounded-xl">
                <Globe className="w-5 h-5 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Terbaru */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Data Terbaru
                </p>
                <p className="font-bold text-foreground text-lg leading-tight">
                  {tanggalTerbaru
                    ? tanggalTerbaru.toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "-"}
                </p>
                <p className="text-muted-foreground text-xs">
                  publikasi terakhir
                </p>
              </div>
              <div className="bg-emerald-500/10 p-2.5 rounded-xl">
                <Calendar className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ditampilkan */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Ditampilkan
                </p>
                <p className="font-bold tabular-nums text-foreground text-2xl">
                  {data.length.toLocaleString()}
                </p>
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Clock className="w-3 h-3" />
                  <span>dari {total.toLocaleString()} total</span>
                </div>
              </div>
              <div className="bg-amber-500/10 p-2.5 rounded-xl">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/50">
                  <TableHead className="w-[80px] font-bold">No</TableHead>
                  <TableHead className="min-w-[350px] font-bold">
                    Judul Berita
                  </TableHead>
                  <TableHead className="w-[140px] font-bold">Portal</TableHead>
                  <TableHead className="w-[160px] font-bold">
                    Tanggal Publikasi
                  </TableHead>
                  <TableHead className="w-[140px] font-bold text-center">
                    Aksi
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Newspaper className="w-12 h-12 text-muted-foreground/30" />
                        <p className="text-muted-foreground">
                          Belum ada data berita
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item, index) => (
                    <TableRow
                      key={item.guid}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium text-muted-foreground">
                        {(pagination.page - 1) * pagination.page_size +
                          index +
                          1}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5 max-w-[350px]">
                          <p className="font-medium text-foreground line-clamp-2 leading-snug">
                            {item.title}
                          </p>
                          <Badge
                            variant="secondary"
                            className="font-normal text-xs"
                          >
                            {item.guid.substring(0, 8)}...
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-medium">
                          <Globe className="mr-1 w-3 h-3" />
                          {item.portal_name}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-sm whitespace-nowrap">
                            {item.published_at
                              ? new Date(item.published_at).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center items-center gap-1">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="mr-1.5 w-4 h-4" />
                              Buka
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedItem(item)}
                          >
                            <Info className="mr-1.5 w-4 h-4" />
                            Detail
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-xl">
              Detail Berita
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6 py-4">
              {/* Judul */}
              <div className="space-y-2">
                <label className="font-medium text-muted-foreground text-sm uppercase tracking-wider">
                  Judul Berita
                </label>
                <p className="font-semibold text-foreground text-lg">
                  {selectedItem.title}
                </p>
              </div>

              {/* Grid Info */}
              <div className="gap-4 grid grid-cols-1 md:grid-cols-2">
                {/* GUID */}
                <div className="space-y-1">
                  <label className="font-medium text-muted-foreground text-sm">
                    GUID
                  </label>
                  <p className="bg-muted p-2 rounded-md font-mono text-sm break-all">
                    {selectedItem.guid}
                  </p>
                </div>

                {/* Portal */}
                <div className="space-y-1">
                  <label className="font-medium text-muted-foreground text-sm">
                    Portal
                  </label>
                  <div>
                    <Badge variant="outline" className="font-medium">
                      <Globe className="mr-1 w-3 h-3" />
                      {selectedItem.portal_name}
                    </Badge>
                  </div>
                </div>

                {/* URL */}
                <div className="space-y-1 md:col-span-2">
                  <label className="font-medium text-muted-foreground text-sm">
                    URL Berita
                  </label>
                  <a
                    href={selectedItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary text-sm hover:underline break-all"
                  >
                    {selectedItem.url}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>

                {/* Tanggal Publikasi */}
                <div className="space-y-1">
                  <label className="font-medium text-muted-foreground text-sm">
                    Tanggal Publikasi
                  </label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      {selectedItem.published_at
                        ? new Date(
                            selectedItem.published_at,
                          ).toLocaleDateString("id-ID", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Tidak tersedia"}
                    </p>
                  </div>
                </div>

                {/* Tanggal Scraping */}
                <div className="space-y-1">
                  <label className="font-medium text-muted-foreground text-sm">
                    Tanggal Scraping
                  </label>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      {selectedItem.scraped_at
                        ? new Date(selectedItem.scraped_at).toLocaleDateString(
                            "id-ID",
                            {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            },
                          )
                        : "Tidak tersedia"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedItem(null)}>
                  Tutup
                </Button>
                <a
                  href={selectedItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button>
                    <ExternalLink className="mr-2 w-4 h-4" />
                    Buka Berita
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LoadMoreButton
        onClick={loadMore}
        loading={loading}
        hasMore={hasMore}
        currentCount={data.length}
        totalCount={total}
      />
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
          <div className="space-y-4 p-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-8 h-8" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-3/4 h-4" />
                  <Skeleton className="w-1/2 h-3" />
                </div>
                <Skeleton className="w-20 h-6" />
                <Skeleton className="w-24 h-4" />
                <Skeleton className="w-32 h-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
