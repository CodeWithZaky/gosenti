import sys
import re
from pathlib import Path
from datetime import datetime

import pandas as pd
from sqlalchemy.exc import IntegrityError

# Supaya terminal Windows bisa menampilkan UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Tambahkan folder backend ke PYTHONPATH
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

from database import SessionLocal, News


def clean_text(text):
    """
    Membersihkan karakter yang sering menyebabkan masalah
    pada data hasil scraping Google News.
    """

    if pd.isna(text):
        return None

    text = str(text)

    # Hapus karakter tak terlihat
    text = text.replace("\u200e", "")
    text = text.replace("\u200f", "")
    text = text.replace("\ufeff", "")

    # Hapus emoji dan unicode supplementary plane
    text = re.sub(
        r"[\U00010000-\U0010FFFF]",
        "",
        text,
        flags=re.UNICODE
    )

    return text.strip()


def safe_parse_datetime(date_str):
    """
    Parse datetime dengan multiple fallback methods.
    Return pandas Timestamp atau NaT jika gagal total.
    """
    if pd.isna(date_str) or date_str is None or str(date_str).strip() == '':
        return pd.NaT
    
    date_str = str(date_str).strip()
    
    # Coba 1: Pandas auto-detect
    try:
        result = pd.to_datetime(date_str, errors='coerce')
        if pd.notna(result):
            return result
    except:
        pass
    
    # Coba 2: dateutil parser (lebih fleksibel)
    try:
        from dateutil import parser
        result = parser.parse(date_str)
        return pd.Timestamp(result)
    except:
        pass
    
    # Coba 3: datetime.fromisoformat
    try:
        # Handle berbagai format timezone
        clean_str = date_str.replace('Z', '+00:00')
        if '+' in clean_str or clean_str.endswith('Z'):
            result = datetime.fromisoformat(clean_str)
        else:
            # Tanpa timezone, anggap UTC
            result = datetime.fromisoformat(clean_str)
            result = result.replace(tzinfo=None)  # Akan ditambahkan timezone nanti
        
        ts = pd.Timestamp(result)
        if ts.tzinfo is None:
            ts = ts.tz_localize('UTC')
        return ts
    except:
        pass
    
    print(f"   ⚠️ Gagal parse total: {repr(date_str)}")
    return pd.NaT


def seed_raw_news(csv_path):
    print(f"Membaca data berita mentah dari:\n{csv_path}")

    try:
        # Baca CSV tanpa parse date dulu
        df = pd.read_csv(csv_path)

        # Bersihkan teks
        df["title"] = df["title"].apply(clean_text)

        if "portal_name" in df.columns:
            df["portal_name"] = df["portal_name"].apply(clean_text)

        # 🔥 SIMPAN DATA MENTAH SEBELUM KONVERSI
        raw_scraped = df["scraped_at"].copy()
        
        # Konversi datetime standard
        df["published_at"] = pd.to_datetime(df["published_at"], errors="coerce")
        df["scraped_at"] = pd.to_datetime(df["scraped_at"], errors="coerce")

        # 🔥 DETEKSI & PERBAIKI NaT OTOMATIS
        nat_count = 0
        for idx in df.index:
            # Cek published_at
            if pd.isna(df.at[idx, "published_at"]):
                raw_val = raw_scraped[idx] if idx < len(raw_scraped) else None
                if raw_val is not None and str(raw_val).strip() != '':
                    # Coba parse ulang dari data mentah
                    parsed = safe_parse_datetime(str(raw_val))
                    if pd.notna(parsed):
                        df.at[idx, "published_at"] = parsed
                        nat_count += 1
                        print(f"✅ Baris {idx+1}: published_at diperbaiki → {parsed}")
            
            # Cek scraped_at
            if pd.isna(df.at[idx, "scraped_at"]):
                raw_val = df.at[idx, "scraped_at_raw"] if "scraped_at_raw" in df.columns else raw_scraped[idx]
                # Ambil dari CSV asli
                if pd.isna(df.at[idx, "scraped_at"]):
                    # Coba parse ulang
                    original_csv = pd.read_csv(csv_path)
                    raw_str = str(original_csv.at[idx, "scraped_at"])
                    parsed = safe_parse_datetime(raw_str)
                    
                    if pd.notna(parsed):
                        df.at[idx, "scraped_at"] = parsed
                        nat_count += 1
                        print(f"✅ Baris {idx+1}: scraped_at diperbaiki → {parsed}")
                    else:
                        # 🔥 FALLBACK: pakai published_at kalau ada
                        if pd.notna(df.at[idx, "published_at"]):
                            df.at[idx, "scraped_at"] = df.at[idx, "published_at"]
                            nat_count += 1
                            print(f"⚠️ Baris {idx+1}: scraped_at diisi dari published_at → {df.at[idx, 'published_at']}")
                        else:
                            # 🔥 FALLBACK TERAKHIR: pakai waktu sekarang
                            df.at[idx, "scraped_at"] = pd.Timestamp.now(tz='UTC')
                            nat_count += 1
                            print(f"⚠️ Baris {idx+1}: scraped_at diisi waktu sekarang → {df.at[idx, 'scraped_at']}")

        if nat_count > 0:
            print(f"\n🔧 Total {nat_count} data datetime berhasil diperbaiki otomatis")

        # 🔥 URUTKAN data dari scraped_at paling dulu (ascending)
        print("\n🔍 Mengurutkan data dari scraped_at paling awal...")
        df = df.sort_values(by='scraped_at', ascending=True)
        print(f"✅ Pengurutan selesai")
        
        print(f"\nTotal data CSV: {len(df)}")

    except FileNotFoundError:
        print(f"❌ File tidak ditemukan: {csv_path}")
        return

    except Exception as e:
        print(f"❌ Gagal membaca CSV: {e}")
        import traceback
        traceback.print_exc()
        return

    session = SessionLocal()

    sukses_insert = 0
    gagal_insert = 0

    print("\nMemulai proses insert ke tabel news...\n")

    for index, row in df.iterrows():

        try:
            # 🔥 KONVERSI FINAL: pastikan bukan NaT
            published_at = row["published_at"]
            scraped_at = row["scraped_at"]
            
            if pd.isna(published_at):
                published_at = None
            else:
                published_at = published_at.to_pydatetime() if hasattr(published_at, 'to_pydatetime') else published_at
            
            if pd.isna(scraped_at):
                scraped_at = None
            else:
                scraped_at = scraped_at.to_pydatetime() if hasattr(scraped_at, 'to_pydatetime') else scraped_at

            news_item = News(
                guid=str(row["guid"]),
                title=row["title"],
                url=str(row["url"]),
                portal_name=row["portal_name"],
                published_at=published_at,
                scraped_at=scraped_at
            )

            session.add(news_item)
            session.commit()

            sukses_insert += 1

            if sukses_insert % 100 == 0:
                print(f"✅ {sukses_insert} data berhasil dimasukkan")

        except IntegrityError as e:
            session.rollback()
            gagal_insert += 1

            print(
                f"\n❌ IntegrityError pada baris {index + 1}"
            )
            print(f"GUID : {row['guid']}")
            print(f"Detail : {e.orig}")

        except Exception as e:
            session.rollback()
            gagal_insert += 1

            print(
                f"\n❌ Error pada baris {index + 1}"
            )
            print(f"GUID : {row['guid']}")
            print(f"Detail : {e}")
            print(f"published_at: {row['published_at']} (type: {type(row['published_at'])})")
            print(f"scraped_at: {row['scraped_at']} (type: {type(row['scraped_at'])})")

    session.close()

    print("\n===================================")
    print("LAPORAN SEEDING RAW NEWS")
    print("===================================")
    print(f"✅ Berhasil insert : {sukses_insert}")
    print(f"⚠️ Gagal insert    : {gagal_insert}")
    print("===================================\n")


if __name__ == "__main__":

    csv_file = (
        Path(__file__).resolve().parent
        / "news_data.csv"
    )

    print("Lokasi file CSV:")
    print(csv_file)

    if not csv_file.exists():
        print("\n❌ File CSV tidak ditemukan!")
        sys.exit(1)

    seed_raw_news(csv_file)