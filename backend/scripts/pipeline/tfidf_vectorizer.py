# scripts/pipeline/tfidf_vectorizer.py
import sys
import os
import joblib
import numpy as np
from scipy.sparse import save_npz
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.append(backend_dir)

from database import SessionLocal, Preprocessing

def run_tfidf():
    print("=" * 60)
    print("TF-IDF VECTORIZER + COUNT VECTORIZER")
    print("=" * 60)
    
    session = SessionLocal()
    
    # Ambil SEMUA data preprocessing
    prep_data = session.query(Preprocessing).all()
    texts = [p.clean_title for p in prep_data]
    session.close()
    
    print(f"Jumlah dokumen: {len(texts)}")
    
    # Parameter yang sama untuk kedua vectorizer
    vectorizer_params = {
        'ngram_range': (1, 2),
        'min_df': 2,
        'max_df': 0.8,
        'max_features': None,
    }
    
    # 1. CountVectorizer (untuk TF murni)
    print("\n[1/2] Membuat CountVectorizer (TF)...")
    count_vectorizer = CountVectorizer(**vectorizer_params)
    X_count = count_vectorizer.fit_transform(texts)
    print(f"  Count matrix shape: {X_count.shape}")
    
    # 2. TfidfVectorizer (untuk IDF & TF-IDF)
    print("\n[2/2] Membuat TfidfVectorizer (TF-IDF)...")
    tfidf_vectorizer = TfidfVectorizer(
        **vectorizer_params,
        sublinear_tf=True,
    )
    X_tfidf = tfidf_vectorizer.fit_transform(texts)
    print(f"  TF-IDF matrix shape: {X_tfidf.shape}")
    
    # Verifikasi konsistensi
    assert X_count.shape == X_tfidf.shape, \
        f"Shape mismatch! Count: {X_count.shape}, TF-IDF: {X_tfidf.shape}"
    assert list(count_vectorizer.get_feature_names_out()) == \
           list(tfidf_vectorizer.get_feature_names_out()), \
        "Feature names mismatch!"
    
    print("\n✅ Kedua vectorizer konsisten!")
    
    # Simpan semua
    models_dir = os.path.join(backend_dir, "models")
    os.makedirs(models_dir, exist_ok=True)
    
    print("\nMenyimpan model...")
    # CountVectorizer
    joblib.dump(count_vectorizer, os.path.join(models_dir, "count_vectorizer.pkl"))
    save_npz(os.path.join(models_dir, "X_count.npz"), X_count)
    print(f"  ✅ count_vectorizer.pkl")
    print(f"  ✅ X_count.npz ({X_count.shape})")
    
    # TfidfVectorizer
    joblib.dump(tfidf_vectorizer, os.path.join(models_dir, "tfidf_vectorizer.pkl"))
    save_npz(os.path.join(models_dir, "X_tfidf.npz"), X_tfidf)
    print(f"  ✅ tfidf_vectorizer.pkl")
    print(f"  ✅ X_tfidf.npz ({X_tfidf.shape})")
    
    # Statistik singkat
    print("\n" + "=" * 60)
    print("STATISTIK")
    print("=" * 60)
    print(f"Total fitur: {X_count.shape[1]}")
    print(f"Mean TF (non-zero): {X_count[X_count > 0].mean():.6f}")
    print(f"Mean IDF: {tfidf_vectorizer.idf_.mean():.4f}")
    print(f"Mean TF-IDF (non-zero): {X_tfidf[X_tfidf > 0].mean():.6f}")
    
    # Top 5 fitur
    feature_names = tfidf_vectorizer.get_feature_names_out()
    mean_tfidf = np.array(X_tfidf.mean(axis=0)).flatten()
    top5_idx = np.argsort(mean_tfidf)[-5:][::-1]
    
    print("\nTop 5 Fitur:")
    for i, idx in enumerate(top5_idx, 1):
        word = feature_names[idx]
        tf = X_count[:, idx].mean()
        idf = tfidf_vectorizer.idf_[idx]
        tfidf = mean_tfidf[idx]
        print(f"  {i}. {word:20s} | TF: {tf:.6f} | IDF: {idf:.4f} | TF-IDF: {tfidf:.6f}")
    
    print("\nSELESAI!")

if __name__ == "__main__":
    run_tfidf()