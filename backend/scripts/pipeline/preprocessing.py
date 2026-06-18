# scripts/pipeline/preprocessing.py
import sys
import os
import re
from pathlib import Path
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
from Sastrawi.StopWordRemover.StopWordRemoverFactory import StopWordRemoverFactory

backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

from database import SessionLocal, News, Preprocessing

# ═══════════════════════════════════════════════════════════════
# SASTRAWI SETUP
# ═══════════════════════════════════════════════════════════════

stemmer_factory = StemmerFactory()
stemmer = stemmer_factory.create_stemmer()

stopword_factory = StopWordRemoverFactory()
sastrawi_stopwords = set(stopword_factory.get_stop_words())

PROTECTED_WORDS = {
    "belum", "bukan", "tak", "tanpa", "tidak",
    "pantang", "jangan", "bukanlah", "tidak pernah","nggak"
}

CUSTOM_STOPWORDS = sastrawi_stopwords - PROTECTED_WORDS


# ═══════════════════════════════════════════════════════════════
# TEXT PROCESSING FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def do_case_folding(text):
    """Case folding saja — untuk kolom case_folding"""
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def clean_text(text):
    """Case folding + cleaning — untuk kolom clean_title"""
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r'http\S+|www\S+|https\S+', '', text)
    text = re.sub(r'@\w+', '', text)
    text = re.sub(r'#\w+', '', text)
    text = re.sub(r'\d+', '', text)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def do_stemming(text):
    """Stemming menggunakan Sastrawi — untuk kolom stemming"""
    if not isinstance(text, str) or text == "":
        return ""
    return stemmer.stem(text)

def do_stopword_removal(text):
    """Custom stopword removal dengan protected words — untuk kolom stopword_removal"""
    if not isinstance(text, str) or text == "":
        return ""
    tokens = text.split()
    filtered = [w for w in tokens if w not in CUSTOM_STOPWORDS]
    return ' '.join(filtered)


# ═══════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════

def run_preprocessing():
    print("=" * 60)
    print("PREPROCESSING PIPELINE")
    print("=" * 60)
    print(f"Protected words  : {sorted(PROTECTED_WORDS)}")
    print(f"Custom stopwords : {len(CUSTOM_STOPWORDS)} kata")

    session = SessionLocal()
    news_list = session.query(News).all()
    total_data = len(news_list)
    print(f"\nJumlah data: {total_data}")
    print("\nMemulai preprocessing...\n")

    count_success = 0
    count_skipped = 0

    for news in news_list:
        try:
            # Step 1: case folding
            case_folded = do_case_folding(news.title)

            # Step 2: cleaning → clean_title
            clean = clean_text(news.title)

            # Filter teks terlalu pendek/kosong
            if clean == "" or len(clean) <= 3:
                count_skipped += 1
                continue

            # Step 3: custom stopword removal (SEBELUM stemming)
            stopword_removed = do_stopword_removal(clean)

            # Step 4: stemming (SETELAH stopword removal)
            stemmed = do_stemming(stopword_removed)

            # Simpan ke database
            existing = session.query(Preprocessing).filter_by(
                news_guid=news.guid
            ).first()

            if existing:
                existing.clean_title = clean
                existing.case_folding = case_folded
                existing.stemming = stemmed
                existing.stopword_removal = stopword_removed
            else:
                new_data = Preprocessing(
                    news_guid=news.guid,
                    clean_title=clean,
                    case_folding=case_folded,
                    stemming=stemmed,
                    stopword_removal=stopword_removed
                )
                session.add(new_data)

            count_success += 1

        except Exception as e:
            print(f"Error pada GUID {news.guid}: {e}")

        if (count_success + count_skipped) % 500 == 0:
            print(f"Progres: {count_success + count_skipped} / {total_data}...")

    session.commit()
    session.close()

    print("\n" + "=" * 60)
    print(f"✅ PREPROCESSING SELESAI")
    print(f"Berhasil diproses : {count_success}")
    print(f"Dilewati          : {count_skipped}")
    print("=" * 60)

    # Tampilkan contoh hasil
    print("\nContoh hasil preprocessing (5 pertama):")
    session = SessionLocal()
    samples = session.query(Preprocessing).limit(5).all()
    for i, s in enumerate(samples, 1):
        print(f"\n  [{i}]")
        print(f"  case_folding     : {s.case_folding[:80]}")
        print(f"  clean_title      : {s.clean_title[:80]}")
        print(f"  stopword_removal : {s.stopword_removal[:80]}")  # Stopword removal dilakukan dulu
        print(f"  stemming         : {s.stemming[:80]}")  # Lalu stemming
    session.close()


if __name__ == "__main__":
    run_preprocessing()