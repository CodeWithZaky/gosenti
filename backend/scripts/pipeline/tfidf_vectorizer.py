# scripts/pipeline/tfidf_vectorizer.py
import sys
import os
import joblib
import numpy as np
from scipy.sparse import save_npz
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

from database import SessionLocal, Preprocessing


# ═══════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════

def run_tfidf():
    print("=" * 60)
    print("TF-IDF VECTORIZER + COUNT VECTORIZER")
    print("Input: stopword_removal (stem + custom stopword)")
    print("=" * 60)

    session = SessionLocal()
    prep_data = session.query(Preprocessing).all()

    # Baca stopword_removal langsung dari database
    texts = [p.stopword_removal for p in prep_data]

    print(f"Jumlah dokumen: {len(texts)}")

    # Contoh perbandingan kolom
    print("\nContoh perbandingan kolom (5 pertama):")
    for i, p in enumerate(prep_data[:5], 1):
        print(f"\n  [{i}]")
        print(f"  clean_title      : {p.clean_title[:80]}")
        print(f"  stemming         : {p.stemming[:80]}")
        print(f"  stopword_removal : {p.stopword_removal[:80]}")

    session.close()

    vectorizer_params = {
        'ngram_range': (1, 2),
        'min_df': 2,
        'max_df': 0.8,
        'max_features': None,
        # stopword sudah dihandle di preprocessing.py
    }

    # 1. CountVectorizer
    print("\n[1/2] Membuat CountVectorizer (TF)...")
    count_vectorizer = CountVectorizer(**vectorizer_params)
    X_count = count_vectorizer.fit_transform(texts)
    print(f"  Shape: {X_count.shape}")

    # 2. TfidfVectorizer
    print("\n[2/2] Membuat TfidfVectorizer (TF-IDF)...")
    tfidf_vectorizer = TfidfVectorizer(
        **vectorizer_params,
        sublinear_tf=True,
    )
    X_tfidf = tfidf_vectorizer.fit_transform(texts)
    print(f"  Shape: {X_tfidf.shape}")

    # Verifikasi konsistensi
    assert X_count.shape == X_tfidf.shape, \
        f"Shape mismatch! Count: {X_count.shape}, TF-IDF: {X_tfidf.shape}"
    assert list(count_vectorizer.get_feature_names_out()) == \
           list(tfidf_vectorizer.get_feature_names_out()), \
        "Feature names mismatch!"
    print("\n✅ Kedua vectorizer konsisten!")

    # Simpan model
    models_dir = os.path.join(str(backend_dir), "models")
    os.makedirs(models_dir, exist_ok=True)

    print("\nMenyimpan model...")
    joblib.dump(count_vectorizer, os.path.join(models_dir, "count_vectorizer.pkl"))
    save_npz(os.path.join(models_dir, "X_count.npz"), X_count)
    print(f"  ✅ count_vectorizer.pkl  {X_count.shape}")

    joblib.dump(tfidf_vectorizer, os.path.join(models_dir, "tfidf_vectorizer.pkl"))
    save_npz(os.path.join(models_dir, "X_tfidf.npz"), X_tfidf)
    print(f"  ✅ tfidf_vectorizer.pkl  {X_tfidf.shape}")

    # Statistik
    print("\n" + "=" * 60)
    print("STATISTIK")
    print("=" * 60)
    print(f"Total fitur      : {X_tfidf.shape[1]}")
    print(f"Mean IDF         : {tfidf_vectorizer.idf_.mean():.4f}")
    print(f"Mean TF-IDF      : {X_tfidf[X_tfidf > 0].mean():.6f}")

    # Top 10 fitur
    feature_names = tfidf_vectorizer.get_feature_names_out()
    mean_tfidf = np.array(X_tfidf.mean(axis=0)).flatten()
    top10_idx = np.argsort(mean_tfidf)[-10:][::-1]

    print("\nTop 10 Fitur:")
    for i, idx in enumerate(top10_idx, 1):
        tf = X_count[:, idx].mean()
        idf = tfidf_vectorizer.idf_[idx]
        tfidf_val = mean_tfidf[idx]
        print(f"  {i:2d}. {feature_names[idx]:25s} | TF: {tf:.6f} | IDF: {idf:.4f} | TF-IDF: {tfidf_val:.6f}")

    print("\nSELESAI!")


if __name__ == "__main__":
    run_tfidf()