# scripts/pipeline/tfidf_vectorizer.py
import sys
import os
import joblib
import numpy as np
from scipy.sparse import save_npz
from sklearn.feature_extraction.text import TfidfVectorizer

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.append(backend_dir)

from database import SessionLocal, Preprocessing

def run_tfidf():
    print("=" * 60)
    print("TF-IDF VECTORIZER")
    print("=" * 60)
    
    session = SessionLocal()
    
    # Ambil SEMUA data preprocessing
    prep_data = session.query(Preprocessing).all()
    texts = [p.clean_title for p in prep_data]
    session.close()
    
    print(f"Jumlah dokumen: {len(texts)}")
    
    # TF-IDF Vectorizer
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),      # unigram + bigram
        max_features=None,       # maksimal 5000 fitur
        min_df=2,                # minimal muncul di 2 dokumen
        max_df=0.8,              # maksimal 80% dokumen
        sublinear_tf=True,
    )
    
    print("Melakukan fit_transform...")
    X_tfidf = vectorizer.fit_transform(texts)
    
    print(f"TF-IDF matrix shape: {X_tfidf.shape}")
    
    # Simpan HANYA TF-IDF matrix (TANPA InSet)
    models_dir = os.path.join(backend_dir, "models")
    os.makedirs(models_dir, exist_ok=True)
    
    save_npz(os.path.join(models_dir, "X_tfidf.npz"), X_tfidf)
    joblib.dump(vectorizer, os.path.join(models_dir, "tfidf_vectorizer.pkl"))
    
    print(f"TF-IDF matrix saved: {X_tfidf.shape}")
    print("SELESAI!")

if __name__ == "__main__":
    run_tfidf()