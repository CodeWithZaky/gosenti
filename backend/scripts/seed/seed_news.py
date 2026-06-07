import sys
import re
from pathlib import Path

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


def seed_raw_news(csv_path):
    print(f"Membaca data berita mentah dari:\n{csv_path}")

    try:
        df = pd.read_csv(csv_path)

        # Bersihkan teks
        df["title"] = df["title"].apply(clean_text)

        if "portal_name" in df.columns:
            df["portal_name"] = df["portal_name"].apply(clean_text)

        # Konversi datetime
        df["published_at"] = pd.to_datetime(
            df["published_at"],
            errors="coerce"
        )

        df["scraped_at"] = pd.to_datetime(
            df["scraped_at"],
            errors="coerce"
        )

        print(f"Total data CSV: {len(df)}")

    except FileNotFoundError:
        print(f"❌ File tidak ditemukan: {csv_path}")
        return

    except Exception as e:
        print(f"❌ Gagal membaca CSV: {e}")
        return

    session = SessionLocal()

    sukses_insert = 0
    gagal_insert = 0

    print("\nMemulai proses insert ke tabel news...\n")

    for index, row in df.iterrows():

        try:
            news_item = News(
                guid=str(row["guid"]),
                title=row["title"],
                url=str(row["url"]),
                portal_name=row["portal_name"],
                published_at=row["published_at"],
                scraped_at=row["scraped_at"]
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