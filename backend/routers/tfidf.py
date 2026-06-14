import os
from collections import defaultdict

import joblib
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import SentiStrength
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


@router.get("/summary")
def get_tfidf_summary():
    vectorizer, X = _load_tfidf_model()
    feature_names = vectorizer.get_feature_names_out()
    idf = vectorizer.idf_

    if X is not None:
        mean_tfidf = np.array(X.mean(axis=0)).flatten()
        top_idx = np.argsort(mean_tfidf)[::-1]
    else:
        mean_tfidf = None
        top_idx = np.argsort(idf)[::-1]

    top_features = [
        {
            "rank": i + 1,
            "word": str(feature_names[idx]),
            "score": round(float(mean_tfidf[idx] if mean_tfidf is not None else idf[idx]), 6),
            "idf": round(float(idf[idx]), 4),
            "type": "bigram" if " " in str(feature_names[idx]) else "unigram",
        }
        for i, idx in enumerate(top_idx[:100])
    ]

    scores = mean_tfidf if mean_tfidf is not None else idf
    stats = {
        "mean_score": round(float(scores.mean()), 6),
        "max_score": round(float(scores.max()), 6),
        "min_score": round(float(scores.min()), 6),
    }

    return {"total_features": int(len(feature_names)), "top_features": top_features, "stats": stats}


# Alias lama agar tidak breaking change
@router.get("/summary-alias", include_in_schema=False)
@router.get("/api/features/summary", include_in_schema=False)
def get_features_summary():
    return get_tfidf_summary()


@router.get("/wordcloud")
def get_wordcloud_per_class(db: Session = Depends(get_db)):
    vectorizer, X = _load_tfidf_model()
    if X is None:
        raise HTTPException(status_code=404, detail="Matrix TF-IDF belum dibuat")

    feature_names = vectorizer.get_feature_names_out()
    labels = [r.label_sentistrength for r in db.query(SentiStrength).all()]

    word_scores: defaultdict = defaultdict(lambda: {"positive": 0, "neutral": 0, "negative": 0})
    counts: defaultdict = defaultdict(int)

    for i, label in enumerate(labels):
        if label not in ("positive", "neutral", "negative"):
            continue
        counts[label] += 1
        row = X[i].toarray().flatten()
        for idx in np.argsort(row)[-100:]:
            if row[idx] > 0:
                word_scores[feature_names[idx]][label] += row[idx]

    result = {}
    for label in ("positive", "neutral", "negative"):
        if counts[label] == 0:
            result[label] = []
            continue
        scored = [
            {"word": word, "score": round(scores[label] / counts[label], 6)}
            for word, scores in word_scores.items()
            if scores[label] > 0
        ]
        result[label] = sorted(scored, key=lambda x: x["score"], reverse=True)[:50]

    return {"status": "success", "data": result}
