import sys
import os

# Tambahkan folder backend ke path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

# Import koneksi database
from database import SessionLocal, News, NewsDuplicate

def run_deduplication():
    print("=" * 60)
    print("MENJALANKAN DEDUPLIKASI")
    print("=" * 60)
    print("Pipeline deduplication - Silahkan implementasikan logika deduplikasi disini")
    print("=" * 60)

if __name__ == "__main__":
    run_deduplication()