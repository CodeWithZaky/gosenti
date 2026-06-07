import sys
import re
from pathlib import Path

import pandas as pd
from sqlalchemy.exc import IntegrityError

# Supaya terminal Windows mendukung UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Tambahkan folder backend ke PYTHONPATH
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

from database import SessionLocal, NewsDuplicate, News


def clean_text(text):
    if pd.isna(text):
        return None

    text = str(text)

    # Hapus karakter tak terlihat
    text = text.replace("\u200e", "")
    text = text.replace("\u200f", "")
    text = text.replace("\ufeff", "")

    # Hapus emoji
    text = re.sub(
        r"[\U00010000-\U0010FFFF]",
        "",
        text,
        flags=re.UNICODE
    )

    return text.strip()


def seed_duplicates_data(csv_path):
    print(f"Membaca data deduplikasi dari:\n{csv_path}")

    try:
        df = pd.read_csv(csv_path)

        # Bersihkan teks
        df["title_dipertahankan"] = (
            df["title_dipertahankan"]
            .apply(clean_text)
        )

        df["title_dihapus"] = (
            df["title_dihapus"]
            .apply(clean_text)
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
    news_induk_tidak_ada = 0

    print("\nMemulai proses insert ke tabel news_duplicates...\n")

    for index, row in df.iterrows():

        try:
            retained_guid = str(row["id_dipertahankan"])

            # Pastikan data induk ada
            news_exists = (
                session.query(News)
                .filter(News.guid == retained_guid)
                .first()
            )

            if not news_exists:
                news_induk_tidak_ada += 1
                continue

            duplicate_item = NewsDuplicate(
                retained_guid=retained_guid,

                retained_title=row["title_dipertahankan"],

                retained_date=pd.to_datetime(
                    row["tanggal_dipertahankan"],
                    errors="coerce"
                ),

                removed_guid=str(
                    row["id_dihapus"]
                ),

                removed_title=row["title_dihapus"],

                removed_date=pd.to_datetime(
                    row["tanggal_dihapus"],
                    errors="coerce"
                ),

                jaccard_score=float(
                    row["jaccard_score"]
                )
                if pd.notna(row["jaccard_score"])
                else None
            )

            session.add(duplicate_item)
            session.commit()

            sukses_insert += 1

            if sukses_insert % 100 == 0:
                print(
                    f"✅ {sukses_insert} data berhasil dimasukkan"
                )

        except IntegrityError as e:
            session.rollback()
            gagal_insert += 1

            print(
                f"\n❌ IntegrityError pada baris {index + 1}"
            )
            print(
                f"Retained GUID: "
                f"{row['id_dipertahankan']}"
            )
            print(
                f"Detail: {e.orig}"
            )

        except Exception as e:
            session.rollback()
            gagal_insert += 1

            print(
                f"\n❌ Error pada baris {index + 1}"
            )
            print(
                f"Retained GUID: "
                f"{row['id_dipertahankan']}"
            )
            print(
                f"Detail: {e}"
            )

    session.close()

    print("\n===================================")
    print("LAPORAN SEEDING DUPLICATES")
    print("===================================")
    print(f"✅ Berhasil insert      : {sukses_insert}")
    print(f"⚠️ Gagal insert        : {gagal_insert}")
    print(f"⏭️ Induk tidak ditemukan : {news_induk_tidak_ada}")
    print("===================================\n")


if __name__ == "__main__":

    csv_file = (
        Path(__file__).resolve().parent
        / "news_duplicates.csv"
    )

    print("Lokasi file CSV:")
    print(csv_file)

    if not csv_file.exists():
        print("\n❌ File CSV tidak ditemukan!")
        sys.exit(1)

    seed_duplicates_data(csv_file)