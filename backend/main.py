import os
import sys

from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
from sqlalchemy import func
from database import CvFold, ExperimentResult, InsetFeature, NewsDuplicate, SentiStrength, SessionLocal, News, Preprocessing
import subprocess
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import Optional

app = FastAPI(title="Gosenti Backend API")

# Konfigurasi CORS agar Next.js (port 3000) bisa mengambil data dari FastAPI (port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fungsi bantuan untuk membuka dan menutup koneksi database secara otomatis
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================================
# HELPER FUNCTION: PAGINATION
# ============================================================
def paginate_query(query, page: int = 1, page_size: int = 20):
    """Helper function untuk pagination"""
    total = query.count()
    total_pages = (total + page_size - 1) // page_size
    
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_more": page < total_pages
        }
    }

# ============================================================
# ROOT ENDPOINT
# ============================================================
@app.get("/")
def read_root():
    return {"message": "Gosenti Backend is Running!"}

# ============================================================
# ENDPOINT: DATA BERITA (DENGAN PAGINATION)
# ============================================================
@app.get("/api/news")
def get_news(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Mengambil data berita dengan pagination"""
    query = db.query(News).order_by(News.published_at.desc())
    result = paginate_query(query, page, page_size)
    
    # Convert SQLAlchemy objects to dict
    result["items"] = [
        {
            "guid": news.guid,
            "title": news.title,
            "url": news.url,
            "portal_name": news.portal_name,
            "published_at": news.published_at.isoformat() if news.published_at else None,
            "scraped_at": news.scraped_at.isoformat() if news.scraped_at else None,
        }
        for news in result["items"]
    ]
    
    return result

# ============================================================
# ENDPOINT: PIPELINE RUNNER
# ============================================================
@app.post("/api/pipeline/{step_name}")
async def run_pipeline_step(step_name: str):
    """
    Endpoint dinamis khusus untuk menjalankan skrip di dalam folder scripts/pipeline/
    Contoh pemanggilan dari web: POST /api/pipeline/preprocessing
    """
    script_path = os.path.join("scripts", "pipeline", f"{step_name}.py")
    
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail=f"Skrip {step_name}.py tidak ditemukan di folder pipeline!")

    # Memaksa Python background menggunakan UTF-8
    custom_env = os.environ.copy()
    custom_env["PYTHONIOENCODING"] = "utf-8"

    try:
        process = subprocess.run(
            [sys.executable, script_path], 
            capture_output=True, 
            text=True,
            encoding="utf-8",
            check=True,
            env=custom_env
        )
        return {
            "status": "success", 
            "message": f"Tahap {step_name} berhasil dijalankan!",
            "output": process.stdout
        }
    except subprocess.CalledProcessError as e:
        return {
            "status": "error", 
            "message": f"Error saat menjalankan {step_name}",
            "error_detail": e.stderr
        }

# ============================================================
# ENDPOINT: PREPROCESSING DATA (DENGAN PAGINATION)
# ============================================================
@app.get("/api/data/preprocessing")
def get_preprocessing_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Mengambil data hasil preprocessing dengan pagination"""
    query = db.query(Preprocessing, News).join(
        News, Preprocessing.news_guid == News.guid
    ).order_by(Preprocessing.id.desc())
    
    result = paginate_query(query, page, page_size)
    
    data = []
    for prep, news in result["items"]:
        data.append({
            "guid": prep.news_guid,
            "original_title": news.title,
            "clean_title": prep.clean_title
        })
    
    return {
        "items": data,
        "pagination": result["pagination"]
    }

# ============================================================
# ENDPOINT: SENTISTRENGTH DATA (DENGAN PAGINATION)
# ============================================================
@app.get("/api/data/sentistrength")
def get_sentistrength_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Mengambil hasil pelabelan sentistrength dengan pagination"""
    query = db.query(SentiStrength, Preprocessing).join(
        Preprocessing, SentiStrength.news_guid == Preprocessing.news_guid
    ).order_by(SentiStrength.id.desc())
    
    result = paginate_query(query, page, page_size)
    
    data = []
    for senti, prep in result["items"]:
        data.append({
            "guid": senti.news_guid,
            "clean_title": prep.clean_title,
            "label": senti.label_sentistrength,
            "pos": senti.ss_max_positive,
            "neg": senti.ss_max_negative
        })
    
    return {
        "items": data,
        "pagination": result["pagination"]
    }

# ============================================================
# ENDPOINT: INSET FEATURES DATA (DENGAN PAGINATION)
# ============================================================
@app.get("/api/data/features")
def get_features_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Mengambil hasil ekstraksi fitur InSet dengan pagination + normalisasi"""
    query = db.query(InsetFeature, Preprocessing).join(
        Preprocessing, InsetFeature.news_guid == Preprocessing.news_guid
    ).order_by(InsetFeature.id.desc())
    
    result = paginate_query(query, page, page_size)
    
    # Hitung min/max dari SELURUH dataset
    all_pos = db.query(InsetFeature.inset_pos).all()
    all_neg = db.query(InsetFeature.inset_neg).all()
    
    pos_values = [p[0] for p in all_pos]
    neg_values = [n[0] for n in all_neg]
    
    min_pos, max_pos = min(pos_values), max(pos_values)
    min_neg, max_neg = min(neg_values), max(neg_values)  # nilai asli: -23, 0
    
    data = []
    for feat, prep in result["items"]:
        # Normalisasi InSetPos (0-1)
        if max_pos > min_pos:
            pos_norm = (feat.inset_pos - min_pos) / (max_pos - min_pos)
        else:
            pos_norm = 0
        
        # Normalisasi InSetNeg (0-1) - pakai nilai ASLI
        if max_neg > min_neg:
            neg_norm = (feat.inset_neg - min_neg) / (max_neg - min_neg)
        else:
            neg_norm = 0
        
        data.append({
            "guid": feat.news_guid,
            "clean_title": prep.clean_title,
            "inset_pos": feat.inset_pos,
            "inset_neg": feat.inset_neg,
            "inset_pos_norm": round(pos_norm, 4),
            "inset_neg_norm": round(neg_norm, 4),
        })
    
    return {
        "items": data,
        "pagination": result["pagination"],
    }

# ============================================================
# ENDPOINT: DUPLICATE DATA (DENGAN PAGINATION)
# ============================================================
@app.get("/api/data/duplicates")
def get_duplicate_news(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Mengambil data riwayat duplikasi dengan pagination"""
    query = db.query(NewsDuplicate).order_by(NewsDuplicate.id.desc())
    result = paginate_query(query, page, page_size)
    
    data = []
    for item in result["items"]:
        data.append({
            "id": item.id,
            "retained_title": item.retained_title,
            "removed_title": item.removed_title,
            "jaccard_score": float(item.jaccard_score) if item.jaccard_score else 0.0,
        })
    
    return {
        "status": "success",
        "summary": {
            "total_duplicate_pairs": result["pagination"]["total"]
        },
        "items": data,
        "pagination": result["pagination"]
    }

# ============================================================
# ENDPOINT: TF-IDF SUMMARY
# ============================================================
@app.get("/api/tfidf/summary")
def get_tfidf_summary():
    """Mengambil ringkasan TF-IDF features dengan ranking"""
    import joblib, numpy as np
    from scipy.sparse import load_npz
    
    model_path = os.path.join("models", "tfidf_vectorizer.pkl")
    tfidf_path = os.path.join("models", "X_tfidf.npz")
    
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="Model belum dibuat!")
    
    vectorizer = joblib.load(model_path)
    feature_names = vectorizer.get_feature_names_out()
    idf = vectorizer.idf_
    
    if os.path.exists(tfidf_path):
        X = load_npz(tfidf_path)
        mean_tfidf = np.array(X.mean(axis=0)).flatten()
        top_idx = np.argsort(mean_tfidf)[::-1]
    else:
        mean_tfidf = None
        top_idx = np.argsort(idf)[::-1]
    
    top_features = []
    for i, idx in enumerate(top_idx[:100]):
        word = str(feature_names[idx])
        score = round(float(mean_tfidf[idx]) if mean_tfidf is not None else float(idf[idx]), 6)
        idf_val = round(float(idf[idx]), 4)
        ngram_type = "bigram" if " " in word else "unigram"
        
        top_features.append({
            "rank": i + 1,
            "word": word,
            "score": score,
            "idf": idf_val,
            "type": ngram_type,
        })
    
    return {
        "total_features": int(len(feature_names)),
        "top_features": top_features,
        "stats": {
            "mean_score": round(float(mean_tfidf.mean()) if mean_tfidf is not None else float(idf.mean()), 6),
            "max_score": round(float(mean_tfidf.max()) if mean_tfidf is not None else float(idf.max()), 6),
            "min_score": round(float(mean_tfidf.min()) if mean_tfidf is not None else float(idf.min()), 6),
        }
    }

# ============================================================
# ENDPOINT: FEATURES SUMMARY (ALIAS)
# ============================================================
@app.get("/api/features/summary")
def get_features_summary():
    """Alias untuk TF-IDF summary"""
    return get_tfidf_summary()

# ============================================================
# ENDPOINT: MODELING HISTORY
# ============================================================
@app.get("/api/modeling/history")
def get_modeling_history(db: Session = Depends(get_db)):
    """Mengambil 5 eksperimen terakhir beserta detail fold"""
    experiments = db.query(ExperimentResult)\
        .options(joinedload(ExperimentResult.folds))\
        .order_by(ExperimentResult.created_at.desc())\
        .limit(5).all()
    
    return {"status": "success", "data": experiments}

# ============================================================
# ENDPOINT: DASHBOARD TREND
# ============================================================
@app.get("/api/dashboard/trend")
def get_sentiment_trend(db: Session = Depends(get_db)):
    """API untuk data chart tren sentimen"""
    
    results = db.query(News.published_at, SentiStrength.label_sentistrength).join(
        SentiStrength, News.guid == SentiStrength.news_guid
    ).all()
    
    if not results:
        return {"status": "error", "message": "Tiada data ditemui"}
        
    df = pd.DataFrame(results, columns=['published_at', 'label'])
    df['date'] = pd.to_datetime(df['published_at'], errors='coerce').dt.tz_localize(None)
    df = df.dropna(subset=['date'])
    
    # Filter tahun 2022-2026
    df = df[(df['date'].dt.year >= 2022) & (df['date'].dt.year <= 2026)]
    
    df['month_year'] = df['date'].dt.strftime('%b %Y')
    df['sort_key'] = df['date'].dt.strftime('%Y-%m')
    
    grouped = df.groupby(['sort_key', 'month_year', 'label']).size().unstack(fill_value=0).reset_index()
    
    for col in ['positive', 'neutral', 'negative']:
        if col not in grouped.columns:
            grouped[col] = 0
            
    grouped = grouped.sort_values('sort_key')
    
    chart_data = []
    for _, row in grouped.iterrows():
        chart_data.append({
            "date": row['month_year'],
            "positive": int(row['positive']),
            "neutral": int(row['neutral']),
            "negative": int(row['negative'])
        })
        
    return {"status": "success", "data": chart_data}

# ============================================================
# ENDPOINT: STATS DASHBOARD
# ============================================================
@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    """Mengambil statistik untuk dashboard"""
    total_news = db.query(News).count()
    total_preprocessed = db.query(Preprocessing).count()
    total_sentistrength = db.query(SentiStrength).count()
    total_duplicates = db.query(NewsDuplicate).count()
    
    latest_exp = db.query(ExperimentResult).order_by(
        ExperimentResult.created_at.desc()
    ).first()
    
    return {
        "total_news": total_news,
        "total_preprocessed": total_preprocessed,
        "total_sentistrength": total_sentistrength,
        "total_duplicates": total_duplicates,
        "accuracy": latest_exp.accuracy_mean if latest_exp else 0,
        "f1_score": latest_exp.f1_score_mean if latest_exp else 0,
        "improvement": latest_exp.improvement_accuracy if latest_exp else 0,
    }

# ============================================================
# ENDPOINT: EXPERIMENTS LATEST
# ============================================================
@app.get("/api/experiments/latest")
def get_latest_experiment(db: Session = Depends(get_db)):
    """Mengambil detail eksperimen terbaru dengan CV folds"""
    experiment = db.query(ExperimentResult).order_by(
        ExperimentResult.created_at.desc()
    ).first()
    
    if not experiment:
        return {"status": "error", "message": "Belum ada data eksperimen"}
    
    folds = db.query(CvFold).filter(
        CvFold.experiment_id == experiment.id
    ).order_by(CvFold.fold_number).all()
    
    return {
        "status": "success",
        "data": {
            "experiment": {
                "id": experiment.id,
                "experiment_name": experiment.experiment_name,
                "model_type": experiment.model_type,
                "total_samples": experiment.total_samples,
                "cv_folds": experiment.cv_folds,
                "accuracy_mean": experiment.accuracy_mean,
                "accuracy_std": experiment.accuracy_std,
                "precision_mean": experiment.precision_mean,
                "precision_std": experiment.precision_std,
                "recall_mean": experiment.recall_mean,
                "recall_std": experiment.recall_std,
                "f1_score_mean": experiment.f1_score_mean,
                "f1_score_std": experiment.f1_score_std,
                "baseline_accuracy_mean": experiment.baseline_accuracy_mean,
                "baseline_accuracy_std": experiment.baseline_accuracy_std,
                "baseline_f1_mean": experiment.baseline_f1_mean,
                "baseline_f1_std": experiment.baseline_f1_std,
                "improvement_accuracy": experiment.improvement_accuracy,
                "improvement_f1": experiment.improvement_f1,
                "feature_count": experiment.feature_count,
                "additional_features": experiment.additional_features,
                "created_at": experiment.created_at.isoformat() if experiment.created_at else None,
            },
            "cv_folds": [
                {
                    "fold_number": fold.fold_number,
                    "accuracy": fold.accuracy,
                    "f1_score": fold.f1_score,
                }
                for fold in folds
            ]
        }
    }

# ============================================================
# ENDPOINT: EVALUATION COMPARISON
# ============================================================
@app.get("/api/modeling/evaluation-comparison")
def get_evaluation_comparison(db: Session = Depends(get_db)):
    latest_exp = db.query(ExperimentResult).order_by(ExperimentResult.created_at.desc()).first()
    if not latest_exp:
        return {"status": "error", "message": "Belum ada data eksperimen"}
    
    return {
        "status": "success",
        "data": {
            "model_name": latest_exp.experiment_name,
            "model_type": latest_exp.model_type,
            "total_samples": latest_exp.total_samples,
            "cv_folds": latest_exp.cv_folds,
            "feature_count": latest_exp.feature_count,
            "additional_features": latest_exp.additional_features,
            "created_at": latest_exp.created_at.isoformat() if latest_exp.created_at else None,
            "baseline": {
                "accuracy": float(latest_exp.baseline_accuracy_mean or 0),
                "f1_score": float(latest_exp.baseline_f1_mean or 0),
                "accuracy_std": float(latest_exp.baseline_accuracy_std or 0),
                "f1_std": float(latest_exp.baseline_f1_std or 0),
                "precision": float(latest_exp.baseline_precision_mean or 0),
                "precision_std": float(latest_exp.baseline_precision_std or 0),
                "recall": float(latest_exp.baseline_recall_mean or 0),
                "recall_std": float(latest_exp.baseline_recall_std or 0),
            },
            "proposed": {
                "accuracy": float(latest_exp.accuracy_mean or 0),
                "accuracy_std": float(latest_exp.accuracy_std or 0),
                "precision": float(latest_exp.precision_mean or 0),
                "precision_std": float(latest_exp.precision_std or 0),
                "recall": float(latest_exp.recall_mean or 0),
                "recall_std": float(latest_exp.recall_std or 0),
                "f1_score": float(latest_exp.f1_score_mean or 0),
                "f1_std": float(latest_exp.f1_score_std or 0),
            },
            "improvement": {
                "accuracy": float(latest_exp.improvement_accuracy or 0),
                "f1": float(latest_exp.improvement_f1 or 0),
            },
            "classification_report": latest_exp.classification_report,
            "confusion_matrix": latest_exp.confusion_matrix,
        }
    }

# ============================================================
# ENDPOINT: PIPELINE CNB CLASSIFICATION
# ============================================================
@app.post("/api/pipeline/cnb_classification")
async def run_cnb_classification():
    """Menjalankan skrip klasifikasi CNB"""
    script_path = os.path.join("src", "05_cnb_classification.py")
    
    if not os.path.exists(script_path):
        raise HTTPException(
            status_code=404, 
            detail="Skrip klasifikasi tidak ditemukan! Pastikan file src/05_cnb_classification.py ada."
        )
    
    custom_env = os.environ.copy()
    custom_env["PYTHONIOENCODING"] = "utf-8"
    
    try:
        process = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=True,
            cwd=os.getcwd(),
            env=custom_env
        )
        return {
            "status": "success",
            "message": "Eksperimen berhasil dijalankan!",
            "output": process.stdout
        }
    except subprocess.CalledProcessError as e:
        return {
            "status": "error",
            "message": "Error saat menjalankan eksperimen",
            "error_detail": e.stderr
        }
    
@app.get("/api/data/sentistrength/stats")
def get_sentistrength_stats(db: Session = Depends(get_db)):
    """Mengambil statistik sentistrength"""
    total = db.query(SentiStrength).count()
    
    # Hitung per label
    positive = db.query(SentiStrength).filter(SentiStrength.label_sentistrength == "positive").count()
    neutral = db.query(SentiStrength).filter(SentiStrength.label_sentistrength == "neutral").count()
    negative = db.query(SentiStrength).filter(SentiStrength.label_sentistrength == "negative").count()
    
    # Hitung rata-rata score
    avg_positive = db.query(func.avg(SentiStrength.ss_max_positive)).scalar() or 0
    avg_negative = db.query(func.avg(SentiStrength.ss_max_negative)).scalar() or 0
    
    return {
        "status": "success",
        "data": {
            "total": total,
            "positive": positive,
            "neutral": neutral,
            "negative": negative,
            "avg_positive": round(float(avg_positive), 2),
            "avg_negative": round(float(avg_negative), 2),
        }
    }

# ============================================================
# ENDPOINT: WORDCLOUD PER KELAS SENTIMEN
# ============================================================
@app.get("/api/tfidf/wordcloud")
def get_wordcloud_per_class(db: Session = Depends(get_db)):
    """Mengambil top words per kelas sentimen, diurutkan by importance"""
    import joblib
    import numpy as np
    from scipy.sparse import load_npz
    from collections import defaultdict
    
    model_path = os.path.join("models", "tfidf_vectorizer.pkl")
    tfidf_path = os.path.join("models", "X_tfidf.npz")
    
    if not os.path.exists(model_path) or not os.path.exists(tfidf_path):
        raise HTTPException(status_code=404, detail="Model TF-IDF belum dibuat")
    
    vectorizer = joblib.load(model_path)
    X = load_npz(tfidf_path)
    feature_names = vectorizer.get_feature_names_out()
    
    # Ambil data sentimen
    results = db.query(SentiStrength).all()
    labels = [r.label_sentistrength for r in results]
    
    # Hitung rata-rata TF-IDF per kelas
    word_scores = defaultdict(lambda: {'positive': 0, 'neutral': 0, 'negative': 0})
    counts = defaultdict(int)
    
    for i, label in enumerate(labels):
        if label in ['positive', 'neutral', 'negative']:
            counts[label] += 1
            row = X[i].toarray().flatten()
            top_idx = np.argsort(row)[-100:]  # 100 kata teratas per dokumen
            for idx in top_idx:
                if row[idx] > 0:
                    word_scores[feature_names[idx]][label] += row[idx]
    
    # Rata-rata & sort by importance
    result = {'positive': [], 'neutral': [], 'negative': []}
    for label in ['positive', 'neutral', 'negative']:
        if counts[label] > 0:
            scored = [
                {'word': word, 'score': round(scores[label] / counts[label], 6)}
                for word, scores in word_scores.items() 
                if scores[label] > 0
            ]
            # Sort by score DESCENDING (paling penting di atas)
            scored.sort(key=lambda x: x['score'], reverse=True)
            result[label] = scored[:50]
    
    return {"status": "success", "data": result}

