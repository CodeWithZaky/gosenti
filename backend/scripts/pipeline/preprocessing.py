import sys
import os
import re
from pathlib import Path

# --- PERBAIKAN PATH MULAI DI SINI ---
# Kita suruh Python "naik 3 tingkat" dari lokasi file ini untuk mencari folder 'backend'
# (Tingkat 1: pipeline -> Tingkat 2: scripts -> Tingkat 3: backend)
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))
# --- PERBAIKAN PATH SELESAI ---

from database import SessionLocal, News, Preprocessing

def clean_text(text):
    """
    Membersihkan teks tweet/ulasan/berita
    """
    if not isinstance(text, str):
        return ""
    
    # Case folding
    text = text.lower()
    
    # Hapus URL
    text = re.sub(r'http\S+|www\S+|https\S+', '', text)
    
    # Hapus mention
    text = re.sub(r'@\w+', '', text)
    
    # Hapus hashtag (opsional, bisa dipertahankan)
    text = re.sub(r'#\w+', '', text)
    
    # Hapus angka
    text = re.sub(r'\d+', '', text)
    
    # Hapus karakter non-alfabet (selain spasi)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    
    # Hapus spasi berlebih
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def run_preprocessing():
    print("=" * 60)
    print("TAHAP 1: PREPROCESSING DATA (DATABASE MODE)")
    print("=" * 60)
    
    session = SessionLocal()
    
    # 1. Ambil semua data dari tabel News
    print("Mengambil data dari tabel 'news'...")
    news_list = session.query(News).all()
    total_data = len(news_list)
    print(f"Jumlah data awal di database: {total_data}")
    
    count_success = 0
    count_skipped = 0

    print("\nMemulai proses pembersihan teks...")
    # 2. Lakukan perulangan dan bersihkan satu per satu
    for news in news_list:
        try:
            hasil_bersih = clean_text(news.title)
            
            # Filter sama seperti kode asli Anda:
            # Hapus data yang kosong setelah cleaning dan panjang <= 3
            if hasil_bersih != "" and len(hasil_bersih) > 3:
                
                # Masukkan ke tabel preprocessing
                # Cek apakah data dengan GUID ini sudah pernah diproses sebelumnya
                existing_data = session.query(Preprocessing).filter_by(news_guid=news.guid).first()
                
                if existing_data:
                    # Jika sudah ada, cukup UPDATE teks bersihnya yang baru
                    existing_data.clean_title = hasil_bersih
                else:
                    # Jika belum ada, INSERT sebagai data baru
                    new_data = Preprocessing(
                        news_guid=news.guid,
                        clean_title=hasil_bersih
                    )
                    session.add(new_data)
                
                count_success += 1
            else:
                count_skipped += 1
                
        except Exception as e:
            print(f"Error pada GUID {news.guid}: {e}")
            
        # Cetak progres setiap 500 data agar UI tidak bengong
        if (count_success + count_skipped) % 500 == 0:
            print(f"Progres: {(count_success + count_skipped)} / {total_data} data diproses...")

    # 3. Simpan permanen ke database
    session.commit()
    session.close()
    
    print("\n" + "=" * 60)
    print(f"✅ PREPROCESSING SELESAI")
    print(f"Data bersih disimpan ke tabel 'preprocessing': {count_success}")
    print(f"Data dilewati (terlalu pendek/kosong): {count_skipped}")
    print("=" * 60)

if __name__ == "__main__":
    run_preprocessing()