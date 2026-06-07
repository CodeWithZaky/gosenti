// components/ServerStatus.tsx
"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Database, Loader2, RefreshCw, ServerOff } from "lucide-react";
import { useEffect, useState } from "react";

interface ServerStatus {
  backend: "online" | "offline" | "checking";
  database: "online" | "offline" | "checking";
  message: string;
}

export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus>({
    backend: "checking",
    database: "checking",
    message: "Memeriksa koneksi...",
  });

  const checkStatus = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/stats");

      if (res.ok) {
        const data = await res.json();
        setStatus({
          backend: "online",
          database: "online",
          message: `Server aktif • ${data.total_news || 0} berita tersimpan`,
        });
      } else {
        setStatus({
          backend: "online",
          database: "offline",
          message: "Database tidak tersedia. Periksa koneksi database.",
        });
      }
    } catch (err) {
      setStatus({
        backend: "offline",
        database: "offline",
        message: "Server tidak berjalan. Jalankan backend terlebih dahulu.",
      });
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return { status, checkStatus };
}

export function ServerStatusBanner() {
  const { status, checkStatus } = useServerStatus();

  if (status.backend === "online" && status.database === "online") {
    return null;
  }

  const isOffline = status.backend === "offline";
  const isChecking = status.backend === "checking";

  return (
    <Alert
      variant={isOffline ? "destructive" : "default"}
      className="border-0 border-b rounded-none"
    >
      <div className="flex justify-between items-center w-full">
        <div className="flex items-center gap-3">
          {isChecking ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isOffline ? (
            <ServerOff className="w-5 h-5" />
          ) : (
            <Database className="w-5 h-5" />
          )}
          <div>
            <AlertTitle className="font-semibold text-sm">
              {isChecking
                ? "Memeriksa Koneksi"
                : isOffline
                  ? "Server Tidak Aktif"
                  : "Database Tidak Tersedia"}
            </AlertTitle>
            <AlertDescription className="text-xs">
              {status.message}
            </AlertDescription>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkStatus}
          disabled={isChecking}
        >
          <RefreshCw
            className={`w-4 h-4 mr-1 ${isChecking ? "animate-spin" : ""}`}
          />
          Cek Ulang
        </Button>
      </div>
    </Alert>
  );
}
