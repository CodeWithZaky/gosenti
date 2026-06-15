# cek.py
import pandas as pd
from pathlib import Path

# Path ke CSV (satu folder dengan script ini)
csv_path = Path(__file__).resolve().parent / "news_data.csv"

print(f"Membaca CSV dari: {csv_path}")
print(f"File exists: {csv_path.exists()}\n")

df = pd.read_csv(csv_path)

# Cari baris 805 (index 804)
row = df.iloc[804]

print("=" * 50)
print("DEBUG BARIS 805")
print("=" * 50)
print(f"GUID: {row['guid']}")
print(f"Title: {row['title'][:50]}...")
print(f"\nRaw scraped_at: {repr(row['scraped_at'])}")
print(f"Type: {type(row['scraped_at'])}")

# Coba lihat bytes
scraped_str = str(row['scraped_at'])
print(f"\nString length: {len(scraped_str)}")
print(f"Bytes: {scraped_str.encode('utf-8')}")
print(f"Character codes: {[ord(c) for c in scraped_str]}")

# Coba parse dengan pandas
print("\n" + "=" * 50)
print("TEST PANDAS PARSING")
print("=" * 50)
result = pd.to_datetime(row['scraped_at'], errors='coerce')
print(f"Hasil pd.to_datetime: {result}")
print(f"Is NaT: {pd.isna(result)}")

# Coba parse dengan dateutil
from dateutil import parser
try:
    parsed = parser.parse(scraped_str.strip())
    print(f"\n✅ dateutil berhasil: {parsed}")
except Exception as e:
    print(f"\n❌ dateutil gagal: {e}")

# Coba manual dengan format spesifik
from datetime import datetime
try:
    # Coba format ISO 8601
    manual = datetime.fromisoformat(scraped_str.strip())
    print(f"✅ fromisoformat berhasil: {manual}")
except Exception as e:
    print(f"❌ fromisoformat gagal: {e}")
    # Coba tanpa timezone
    try:
        clean_str = scraped_str.strip().replace('+00:00', '')
        manual = datetime.fromisoformat(clean_str)
        print(f"✅ fromisoformat (tanpa tz) berhasil: {manual}")
    except Exception as e2:
        print(f"❌ fromisoformat (tanpa tz) gagal: {e2}")