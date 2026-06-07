// lib/api.ts
export async function apiFetch(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, options);

    if (!res.ok) {
      if (res.status === 500) {
        throw new Error("Server error. Database mungkin tidak tersedia.");
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    if (
      err.message.includes("Failed to fetch") ||
      err.message.includes("NetworkError")
    ) {
      throw new Error(
        "Tidak dapat terhubung ke server. Pastikan backend berjalan di port 8000.",
      );
    }
    throw err;
  }
}
