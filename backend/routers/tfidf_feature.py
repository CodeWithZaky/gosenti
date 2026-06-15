# routers/tfidf_feature.py

import os
from collections import defaultdict

import joblib
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sklearn.feature_extraction.text import CountVectorizer

from database import SentiStrength, Preprocessing
from utils.db import get_db

router = APIRouter(prefix="/api/tfidf", tags=["TF-IDF"])

MODELS_DIR = "models"


def _load_tfidf_model():
    """Load vectorizer dan matrix TF-IDF. Raise 404 jika belum ada."""
    from scipy.sparse import load_npz

    model_path = os.path.join(MODELS_DIR, "tfidf_vectorizer.pkl")
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="Model TF-IDF belum dibuat!")

    vectorizer = joblib.load(model_path)
    tfidf_path = os.path.join(MODELS_DIR, "X_tfidf.npz")
    X = load_npz(tfidf_path) if os.path.exists(tfidf_path) else None
    return vectorizer, X


def _load_or_create_count_vectorizer(db: Session):
    """
    Load atau buat CountVectorizer untuk menghitung TF murni.
    Disimpan ke file agar konsisten dengan TF-IDF vectorizer.
    """
    count_path = os.path.join(MODELS_DIR, "count_vectorizer.pkl")
    count_matrix_path = os.path.join(MODELS_DIR, "X_count.npz")
    
    from scipy.sparse import load_npz, save_npz
    
    # Coba load dari file
    if os.path.exists(count_path) and os.path.exists(count_matrix_path):
        count_vectorizer = joblib.load(count_path)
        X_count = load_npz(count_matrix_path)
        return count_vectorizer, X_count
    
    # Buat baru dari database
    prep_data = db.query(Preprocessing).all()
    texts = [p.clean_title for p in prep_data]
    
    if not texts:
        raise HTTPException(status_code=404, detail="Tidak ada data preprocessing")
    
    # Gunakan parameter yang sama dengan TF-IDF vectorizer
    count_vectorizer = CountVectorizer(
        ngram_range=(1, 2),
        min_df=2,
        max_df=0.8,
        max_features=None,  # Sesuaikan dengan TF-IDF
    )
    
    X_count = count_vectorizer.fit_transform(texts)
    
    # Simpan untuk digunakan kembali
    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(count_vectorizer, count_path)
    save_npz(count_matrix_path, X_count)
    
    return count_vectorizer, X_count


@router.get("/summary")
def get_tfidf_summary(db: Session = Depends(get_db)):
    """
    Mengembalikan summary TF-IDF dengan TF, IDF, dan TF-IDF terpisah.
    """
    vectorizer, X_tfidf = _load_tfidf_model()
    feature_names = vectorizer.get_feature_names_out()
    idf_values = vectorizer.idf_
    
    # Load atau buat CountVectorizer untuk TF murni
    try:
        count_vectorizer, X_count = _load_or_create_count_vectorizer(db)
        count_feature_names = count_vectorizer.get_feature_names_out()
        
        # Hitung mean TF per fitur
        mean_tf = np.array(X_count.mean(axis=0)).flatten()
        
        # Buat mapping dari feature name ke index CountVectorizer
        count_idx_map = {name: idx for idx, name in enumerate(count_feature_names)}
    except Exception as e:
        # Fallback: estimasi TF dari TF-IDF / IDF
        print(f"Warning: Tidak bisa load CountVectorizer: {e}")
        mean_tf = None
    
    # Hitung mean TF-IDF
    if X_tfidf is not None:
        mean_tfidf = np.array(X_tfidf.mean(axis=0)).flatten()
        top_idx = np.argsort(mean_tfidf)[::-1]
    else:
        mean_tfidf = None
        top_idx = np.argsort(idf_values)[::-1]  # Fallback sort by IDF
    
    # Bangun top_features dengan TF, IDF, TF-IDF
    top_features = []
    for i, idx in enumerate(top_idx[:100]):
        word = str(feature_names[idx])
        idf_val = float(idf_values[idx])
        
        # Dapatkan TF
        if mean_tf is not None and word in count_idx_map:
            tf_val = float(mean_tf[count_idx_map[word]])
        elif mean_tfidf is not None and idf_val > 0:
            # Estimasi TF dari TF-IDF / IDF
            tf_val = float(mean_tfidf[idx] / idf_val)
        else:
            tf_val = 0.0
        
        # Hitung TF-IDF
        tfidf_val = float(mean_tfidf[idx]) if mean_tfidf is not None else tf_val * idf_val
        
        top_features.append({
            "rank": i + 1,
            "word": word,
            "tf": round(tf_val, 6),
            "idf": round(idf_val, 4),
            "tfidf": round(tfidf_val, 6),
            "type": "bigram" if " " in word else "unigram",
        })
    
    # Statistik
    if mean_tf is not None:
        tf_values = [f["tf"] for f in top_features]
    else:
        tf_values = [f["tfidf"] / max(f["idf"], 0.001) for f in top_features]
    
    idf_vals = [f["idf"] for f in top_features]
    tfidf_vals = [f["tfidf"] for f in top_features]
    
    stats = {
        "mean_tf": round(float(np.mean(tf_values)), 6),
        "mean_idf": round(float(np.mean(idf_vals)), 4),
        "mean_tfidf": round(float(np.mean(tfidf_vals)), 6),
        "max_tfidf": round(float(np.max(tfidf_vals)), 6),
        "min_tfidf": round(float(np.min(tfidf_vals)), 6),
    }
    
    return {
        "total_features": int(len(feature_names)),
        "top_features": top_features,
        "stats": stats,
    }


# Alias lama — jangan lupa update response jika ada frontend lain yang pakai
@router.get("/summary-alias", include_in_schema=False)
def get_features_summary_alias(db: Session = Depends(get_db)):
    """Alias dengan format lama untuk backward compatibility."""
    result = get_tfidf_summary(db)
    
    # Convert ke format lama
    old_format = {
        "total_features": result["total_features"],
        "top_features": [
            {
                "rank": f["rank"],
                "word": f["word"],
                "score": f["tfidf"],  # score = tfidf
                "idf": f["idf"],
                "type": f["type"],
            }
            for f in result["top_features"]
        ],
        "stats": {
            "mean_score": result["stats"]["mean_tfidf"],
            "max_score": result["stats"]["max_tfidf"],
            "min_score": result["stats"]["min_tfidf"],
        },
    }
    return old_format


@router.get("/wordcloud")
def get_wordcloud_per_class(db: Session = Depends(get_db)):
    """
    Word cloud per kelas sentimen (positive, neutral, negative).
    """
    vectorizer, X = _load_tfidf_model()
    if X is None:
        raise HTTPException(status_code=404, detail="Matrix TF-IDF belum dibuat")

    feature_names = vectorizer.get_feature_names_out()
    labels = [r.label_sentistrength for r in db.query(SentiStrength).all()]

    # Akumulasi skor per kelas
    word_scores: dict = defaultdict(lambda: {"positive": 0.0, "neutral": 0.0, "negative": 0.0})
    counts: dict = defaultdict(int)

    for i, label in enumerate(labels):
        if label not in ("positive", "neutral", "negative"):
            continue
        counts[label] += 1
        row = X[i].toarray().flatten()
        
        # Ambil top 100 kata per dokumen untuk efisiensi
        top_indices = np.argsort(row)[-100:]
        for idx in top_indices:
            if row[idx] > 0:
                word_scores[feature_names[idx]][label] += row[idx]

    # Normalisasi & sorting
    result = {}
    for label in ("positive", "neutral", "negative"):
        if counts[label] == 0:
            result[label] = []
            continue
        
        scored = [
            {
                "word": word,
                "score": round(scores[label] / counts[label], 6),
            }
            for word, scores in word_scores.items()
            if scores[label] > 0
        ]
        result[label] = sorted(scored, key=lambda x: x["score"], reverse=True)[:50]

    return {"status": "success", "data": result}


@router.get("/feature/{word}")
def get_feature_detail(word: str, db: Session = Depends(get_db)):
    """
    Mendapatkan detail satu fitur: TF, IDF, TF-IDF per kelas.
    """
    vectorizer, X = _load_tfidf_model()
    feature_names = vectorizer.get_feature_names_out()
    idf_values = vectorizer.idf_
    
    # Cari index kata
    try:
        idx = list(feature_names).index(word)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Kata '{word}' tidak ditemukan")
    
    # TF-IDF per dokumen
    tfidf_scores = X[:, idx].toarray().flatten() if X is not None else []
    
    # Label per dokumen
    labels = [r.label_sentistrength for r in db.query(SentiStrength).all()]
    
    # Agregasi per kelas
    per_class = {"positive": [], "neutral": [], "negative": []}
    for score, label in zip(tfidf_scores, labels):
        if label in per_class and score > 0:
            per_class[label].append(float(score))
    
    return {
        "word": word,
        "idf": round(float(idf_values[idx]), 4),
        "type": "bigram" if " " in word else "unigram",
        "tfidf_mean": round(float(np.mean(tfidf_scores[tfidf_scores > 0])), 6) if len(tfidf_scores[tfidf_scores > 0]) > 0 else 0,
        "per_class": {
            label: {
                "count": len(scores),
                "mean": round(float(np.mean(scores)), 6) if scores else 0,
                "max": round(float(np.max(scores)), 6) if scores else 0,
            }
            for label, scores in per_class.items()
        },
    }