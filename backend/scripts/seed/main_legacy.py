import json
import os
import sys

from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
from sqlalchemy import func
from database import CvFold, ExperimentResult, InsetFeature, SentiStrength, SessionLocal, News, Preprocessing
import subprocess
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import Optional

app = FastAPI(title="Gosenti Backend API")

# Konfigurasi CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fungsi bantuan database
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================================
# HELPER: PAGINATION
# ============================================================
def paginate_query(query, page: int = 1, page_size: int = 20):
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
# ROOT
# ============================================================
@app.get("/")
def read_root():
    return {"message": "Gosenti Backend is Running!"}

# ============================================================
# ENDPOINT: NEWS
# ============================================================
@app.get("/api/news")
def get_news(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(News).order_by(News.published_at.desc())
    result = paginate_query(query, page, page_size)
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
    script_path = os.path.join("scripts", "pipeline", f"{step_name}.py")
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail=f"Skrip {step_name}.py tidak ditemukan!")
    custom_env = os.environ.copy()
    custom_env["PYTHONIOENCODING"] = "utf-8"
    try:
        process = subprocess.run(
            [sys.executable, script_path],
            capture_output=True, text=True, encoding="utf-8", check=True, env=custom_env
        )
        return {"status": "success", "message": f"Tahap {step_name} berhasil!", "output": process.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": f"Error: {step_name}", "error_detail": e.stderr}

# ============================================================
# ENDPOINT: PREPROCESSING
# ============================================================
@app.get("/api/data/preprocessing")
def get_preprocessing_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(Preprocessing, News).join(News, Preprocessing.news_guid == News.guid).order_by(Preprocessing.id.desc())
    result = paginate_query(query, page, page_size)
    data = [{"guid": prep.news_guid, "original_title": news.title, "clean_title": prep.clean_title} for prep, news in result["items"]]
    return {"items": data, "pagination": result["pagination"]}

# ============================================================
# ENDPOINT: SENTISTRENGTH
# ============================================================
@app.get("/api/data/sentistrength")
def get_sentistrength_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(SentiStrength, Preprocessing).join(Preprocessing, SentiStrength.news_guid == Preprocessing.news_guid).order_by(SentiStrength.id.desc())
    result = paginate_query(query, page, page_size)
    data = [{"guid": s.news_guid, "clean_title": p.clean_title, "label": s.label_sentistrength, "pos": s.ss_max_positive, "neg": s.ss_max_negative} for s, p in result["items"]]
    return {"items": data, "pagination": result["pagination"]}

# ============================================================
# ENDPOINT: INSET FEATURES
# ============================================================
@app.get("/api/data/features")
def get_features_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("id"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db)
):
    all_pos = db.query(InsetFeature.inset_pos).all()
    all_neg = db.query(InsetFeature.inset_neg).all()
    pos_values = [p[0] for p in all_pos if p[0] is not None]
    neg_values = [n[0] for n in all_neg if n[0] is not None]
    
    if not pos_values or not neg_values:
        return {"items": [], "pagination": {"page": 1, "page_size": 20, "total": 0, "total_pages": 0, "has_more": False}, "stats": {}}
    
    min_pos, max_pos = min(pos_values), max(pos_values)
    min_neg, max_neg = min(neg_values), max(neg_values)
    
    stats = {
        "max_pos": max_pos, "min_pos": min_pos, "max_neg": max_neg, "min_neg": min_neg,
        "avg_pos": round(sum(pos_values) / len(pos_values), 2),
        "avg_neg": round(sum(neg_values) / len(neg_values), 2),
        "total": len(pos_values),
        "has_both": sum(1 for p, n in zip(pos_values, neg_values) if p > 0 and n < 0),
    }
    
    sort_column = {"pos": InsetFeature.inset_pos, "neg": InsetFeature.inset_neg, "id": InsetFeature.id}.get(sort_by, InsetFeature.id)
    order = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    
    query = db.query(InsetFeature, Preprocessing).join(Preprocessing, InsetFeature.news_guid == Preprocessing.news_guid).order_by(order)
    result = paginate_query(query, page, page_size)
    
    data = []
    for feat, prep in result["items"]:
        pos_norm = (feat.inset_pos - min_pos) / (max_pos - min_pos) if max_pos > min_pos else 0
        neg_norm = (feat.inset_neg - min_neg) / (max_neg - min_neg) if max_neg > min_neg else 0
        data.append({"guid": feat.news_guid, "clean_title": prep.clean_title, "inset_pos": feat.inset_pos or 0, "inset_neg": feat.inset_neg or 0, "inset_pos_norm": round(pos_norm, 4), "inset_neg_norm": round(neg_norm, 4)})
    
    return {"items": data, "pagination": result["pagination"], "stats": stats}

# ============================================================
# ENDPOINT: TF-IDF SUMMARY
# ============================================================
@app.get("/api/tfidf/summary")
def get_tfidf_summary():
    import numpy as np
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
    
    # ✅ HITUNG STATS
    if mean_tfidf is not None:
        mean_val = round(float(mean_tfidf.mean()), 6)
        max_val = round(float(mean_tfidf.max()), 6)
        min_val = round(float(mean_tfidf.min()), 6)
    else:
        mean_val = round(float(idf.mean()), 6)
        max_val = round(float(idf.max()), 6)
        min_val = round(float(idf.min()), 6)
    
    # ✅ RETURN DENGAN STATS
    return {
        "total_features": int(len(feature_names)),
        "top_features": top_features,
        "stats": {
            "mean_score": mean_val,
            "max_score": max_val,
            "min_score": min_val,
        }
    }

@app.get("/api/features/summary")
def get_features_summary():
    return get_tfidf_summary()

# ============================================================
# ENDPOINT: DASHBOARD TREND
# ============================================================
@app.get("/api/dashboard/trend")
def get_sentiment_trend(db: Session = Depends(get_db)):
    results = db.query(News.published_at, SentiStrength.label_sentistrength).join(SentiStrength, News.guid == SentiStrength.news_guid).all()
    if not results:
        return {"status": "error", "message": "Tiada data"}
    
    df = pd.DataFrame(results, columns=['published_at', 'label'])
    df['date'] = pd.to_datetime(df['published_at'], errors='coerce').dt.tz_localize(None)
    df = df.dropna(subset=['date'])
    df = df[(df['date'].dt.year >= 2022) & (df['date'].dt.year <= 2026)]
    df['month_year'] = df['date'].dt.strftime('%b %Y')
    df['sort_key'] = df['date'].dt.strftime('%Y-%m')
    
    grouped = df.groupby(['sort_key', 'month_year', 'label']).size().unstack(fill_value=0).reset_index()
    for col in ['positive', 'neutral', 'negative']:
        if col not in grouped.columns:
            grouped[col] = 0
    grouped = grouped.sort_values('sort_key')
    
    chart_data = [{"date": row['month_year'], "positive": int(row['positive']), "neutral": int(row['neutral']), "negative": int(row['negative'])} for _, row in grouped.iterrows()]
    return {"status": "success", "data": chart_data}

# ============================================================
# ENDPOINT: STATS
# ============================================================
@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total_news = db.query(News).count()
    total_preprocessed = db.query(Preprocessing).count()
    total_sentistrength = db.query(SentiStrength).count()
    
    latest_exp = db.query(ExperimentResult).order_by(ExperimentResult.created_at.desc()).first()
    
    return {
        "total_news": total_news,
        "total_preprocessed": total_preprocessed,
        "total_sentistrength": total_sentistrength,
        "accuracy": latest_exp.proposed_accuracy if latest_exp else 0,
        "f1_score": latest_exp.proposed_f1 if latest_exp else 0,
        "improvement": latest_exp.improvement_accuracy if latest_exp else 0,
    }

# ============================================================
# ENDPOINT: EXPERIMENTS LATEST
# ============================================================
@app.get("/api/experiments/latest")
def get_latest_experiment(db: Session = Depends(get_db)):
    experiment = db.query(ExperimentResult).order_by(ExperimentResult.created_at.desc()).first()
    if not experiment:
        return {"status": "error", "message": "Belum ada data eksperimen"}
    
    folds = db.query(CvFold).filter(CvFold.experiment_id == experiment.id).order_by(CvFold.fold_number).all()
    
    return {
        "status": "success",
        "data": {
            "experiment": {
                "id": experiment.id,
                "experiment_name": experiment.experiment_name,
                "model_type": experiment.model_type,
                "total_samples": experiment.total_samples,
                "cv_folds": experiment.cv_folds,
                "feature_count": experiment.feature_count,
                "accuracy": experiment.proposed_accuracy,
                "f1_score": experiment.proposed_f1,
                "baseline_accuracy": experiment.baseline_accuracy,
                "baseline_f1": experiment.baseline_f1,
                "improvement_accuracy": experiment.improvement_accuracy,
                "improvement_f1": experiment.improvement_f1,
                "created_at": experiment.created_at.isoformat() if experiment.created_at else None,
            },
            "cv_folds": [
                {"fold_number": f.fold_number, "accuracy": f.accuracy, "f1_score": f.f1_score, "precision": f.precision, "recall": f.recall}
                for f in folds
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
            "created_at": latest_exp.created_at.isoformat() if latest_exp.created_at else None,
            "baseline": {
                "accuracy": latest_exp.baseline_accuracy or 0,
                "f1_score": latest_exp.baseline_f1 or 0,
            },
            "proposed": {
                "accuracy": latest_exp.proposed_accuracy or 0,
                "f1_score": latest_exp.proposed_f1 or 0,
            },
            "improvement": {
                "accuracy": latest_exp.improvement_accuracy or 0,
                "f1": latest_exp.improvement_f1 or 0,
            },
        }
    }

# ============================================================
# ENDPOINT: MODELING HISTORY
# ============================================================
@app.get("/api/modeling/history")
def get_modeling_history(db: Session = Depends(get_db)):
    experiments = db.query(ExperimentResult).order_by(ExperimentResult.created_at.desc()).limit(5).all()
    
    result = []
    for exp in experiments:
        result.append({
            "id": exp.id,
            "experiment_name": exp.experiment_name,
            "model_type": exp.model_type,
            "total_samples": exp.total_samples,
            "cv_folds": exp.cv_folds,
            "feature_count": exp.feature_count,
            "baseline_accuracy": exp.baseline_accuracy,
            "baseline_f1": exp.baseline_f1,
            "proposed_accuracy": exp.proposed_accuracy,
            "proposed_f1": exp.proposed_f1,
            "improvement_accuracy": exp.improvement_accuracy,
            "improvement_f1": exp.improvement_f1,
            "created_at": exp.created_at.isoformat() if exp.created_at else None,
        })
    
    return {"status": "success", "data": result}

# ============================================================
# ENDPOINT: PIPELINE CNB
# ============================================================
@app.post("/api/pipeline/cnb_classification")
async def run_cnb_classification():
    script_path = os.path.join("src", "05_cnb_classification.py")
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail="Skrip tidak ditemukan!")
    custom_env = os.environ.copy()
    custom_env["PYTHONIOENCODING"] = "utf-8"
    try:
        process = subprocess.run([sys.executable, script_path], capture_output=True, text=True, encoding="utf-8", check=True, cwd=os.getcwd(), env=custom_env)
        return {"status": "success", "message": "Eksperimen berhasil!", "output": process.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": "Error", "error_detail": e.stderr}

# ============================================================
# ENDPOINT: SENTISTRENGTH STATS
# ============================================================
@app.get("/api/data/sentistrength/stats")
def get_sentistrength_stats(db: Session = Depends(get_db)):
    total = db.query(SentiStrength).count()
    positive = db.query(SentiStrength).filter(SentiStrength.label_sentistrength == "positive").count()
    neutral = db.query(SentiStrength).filter(SentiStrength.label_sentistrength == "neutral").count()
    negative = db.query(SentiStrength).filter(SentiStrength.label_sentistrength == "negative").count()
    avg_positive = db.query(func.avg(SentiStrength.ss_max_positive)).scalar() or 0
    avg_negative = db.query(func.avg(SentiStrength.ss_max_negative)).scalar() or 0
    
    return {
        "status": "success",
        "data": {
            "total": total, "positive": positive, "neutral": neutral, "negative": negative,
            "avg_positive": round(float(avg_positive), 2), "avg_negative": round(float(avg_negative), 2),
        }
    }

# ============================================================
# ENDPOINT: CONFUSION MATRIX (DARI JSON FILE)
# ============================================================
@app.get("/api/evaluation/confusion-matrix")
def get_confusion_matrix_detail():
    import numpy as np
    
    models_dir = os.path.join(os.path.dirname(__file__), "models")
    fold_path = os.path.join(models_dir, "fold_details.json")
    params_path = os.path.join(models_dir, "best_params.json")
    
    if not os.path.exists(fold_path):
        raise HTTPException(status_code=404, detail="Jalankan training dulu")
    
    with open(fold_path) as f:
        data = json.load(f)
    
    config = data.get("config", {})
    if os.path.exists(params_path):
        with open(params_path) as f:
            params = json.load(f)
        config["alpha_baseline"] = params.get("alpha_baseline", 1.0)
        config["alpha_proposed"] = params.get("alpha_proposed", 1.0)
    
    def calc_stats(folds):
        accs = [f['accuracy'] for f in folds]
        best_idx = int(np.argmax(accs))
        worst_idx = int(np.argmin(accs))
        overall_matrix = np.sum([np.array(f['matrix']) for f in folds], axis=0).tolist()
        
        return {
            "folds": folds,
            "best": folds[best_idx],
            "worst": folds[worst_idx],
            "average": {
                "accuracy": round(float(np.mean(accs)), 6),
                "accuracy_std": round(float(np.std(accs)), 6),
                "precision": round(float(np.mean([f['precision'] for f in folds])), 6),
                "precision_std": round(float(np.std([f['precision'] for f in folds])), 6),
                "recall": round(float(np.mean([f['recall'] for f in folds])), 6),
                "recall_std": round(float(np.std([f['recall'] for f in folds])), 6),
                "f1_score": round(float(np.mean([f['f1_score'] for f in folds])), 6),
                "f1_score_std": round(float(np.std([f['f1_score'] for f in folds])), 6),
            },
            "overall": {
                "accuracy": round(float(np.mean(accs)), 6),
                "precision": round(float(np.mean([f['precision'] for f in folds])), 6),
                "recall": round(float(np.mean([f['recall'] for f in folds])), 6),
                "f1_score": round(float(np.mean([f['f1_score'] for f in folds])), 6),
                "matrix": overall_matrix
            }
        }
    
    base_stats = calc_stats(data["baseline"])
    prop_stats = calc_stats(data["proposed"])
    
    improvement = {
        "accuracy": round((prop_stats["average"]["accuracy"] - base_stats["average"]["accuracy"]) * 100, 2),
        "f1_score": round((prop_stats["average"]["f1_score"] - base_stats["average"]["f1_score"]) * 100, 2),
    }
    
    return {
        "status": "success",
        "data": {
            "class_names": data["class_names"],
            "config": config,
            "baseline": base_stats,
            "proposed": prop_stats,
            "improvement": improvement
        }
    }

# ============================================================
# ENDPOINT: WORDCLOUD
# ============================================================
@app.get("/api/tfidf/wordcloud")
def get_wordcloud_per_class(db: Session = Depends(get_db)):
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
    
    results = db.query(SentiStrength).all()
    labels = [r.label_sentistrength for r in results]
    
    word_scores = defaultdict(lambda: {'positive': 0, 'neutral': 0, 'negative': 0})
    counts = defaultdict(int)
    
    for i, label in enumerate(labels):
        if label in ['positive', 'neutral', 'negative']:
            counts[label] += 1
            row = X[i].toarray().flatten()
            top_idx = np.argsort(row)[-100:]
            for idx in top_idx:
                if row[idx] > 0:
                    word_scores[feature_names[idx]][label] += row[idx]
    
    result = {'positive': [], 'neutral': [], 'negative': []}
    for label in ['positive', 'neutral', 'negative']:
        if counts[label] > 0:
            scored = [{'word': word, 'score': round(scores[label] / counts[label], 6)} for word, scores in word_scores.items() if scores[label] > 0]
            scored.sort(key=lambda x: x['score'], reverse=True)
            result[label] = scored[:50]
    
    return {"status": "success", "data": result}

# ============================================================
# ENDPOINT: GRID SEARCH
# ============================================================
@app.get("/api/modeling/grid-search")
def get_grid_search_results():
    grid_search_path = os.path.join("models", "grid_search_results.json")
    if not os.path.exists(grid_search_path):
        raise HTTPException(status_code=404, detail="Grid search results belum tersedia.")
    try:
        with open(grid_search_path, "r") as f:
            results = json.load(f)
        return {"status": "success", "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    
# ============================================================
# ENDPOINT: PAIRED T-TEST
# ============================================================
@app.get("/api/evaluation/ttest")
def get_ttest_result():
    import json
    import numpy as np
    from scipy import stats
    
    fold_path = os.path.join("models", "fold_details.json")
    
    if not os.path.exists(fold_path):
        raise HTTPException(status_code=404, detail="Jalankan training dulu")
    
    with open(fold_path) as f:
        data = json.load(f)
    
    # Ambil semua metrik per fold
    baseline_acc = [f['accuracy'] for f in data['baseline']]
    proposed_acc = [f['accuracy'] for f in data['proposed']]
    
    baseline_f1 = [f['f1_score'] for f in data['baseline']]
    proposed_f1 = [f['f1_score'] for f in data['proposed']]
    
    baseline_prec = [f['precision'] for f in data['baseline']]
    proposed_prec = [f['precision'] for f in data['proposed']]
    
    baseline_rec = [f['recall'] for f in data['baseline']]
    proposed_rec = [f['recall'] for f in data['proposed']]
    
    def calc_ttest(proposed, baseline):
        t_stat, p_value = stats.ttest_rel(proposed, baseline)
        diff = np.array(proposed) - np.array(baseline)
        cohens_d = np.mean(diff) / np.std(diff, ddof=1)
        return {
            "baseline_mean": round(float(np.mean(baseline)), 4),
            "proposed_mean": round(float(np.mean(proposed)), 4),
            "mean_diff": round(float(np.mean(diff)), 4),
            "t_statistic": round(float(t_stat), 4),
            "p_value": round(float(p_value), 6),
            "significant": bool(p_value < 0.05),
            "cohens_d": round(float(cohens_d), 4),
            "interpretation": "Signifikan (p < 0.05)" if p_value < 0.05 else "Tidak signifikan (p ≥ 0.05)"
        }
    
    return {
        "status": "success",
        "data": {
            "accuracy": calc_ttest(proposed_acc, baseline_acc),
            "precision": calc_ttest(proposed_prec, baseline_prec),
            "recall": calc_ttest(proposed_rec, baseline_rec),
            "f1_score": calc_ttest(proposed_f1, baseline_f1),
            "alpha": 0.05,
            "description": "Paired T-Test membandingkan 10 fold Baseline vs Proposed. H0: tidak ada perbedaan signifikan. Jika p < 0.05, H0 ditolak."
        }
    }

# ============================================================
# ENDPOINT: SENTISTRENGTH COVERAGE ANALYSIS
# ============================================================
@app.get("/api/data/sentistrength/coverage")
def get_sentistrength_coverage(db: Session = Depends(get_db)):
    """
    Analisis cakupan SentiStrength berdasarkan format asli sentistrength.py
    Format file: kata:skor (dipisah titik dua)
    """
    from collections import Counter
    import re
    import os
    
    SENTI_PATH = os.path.join("lexicons", "sentistrength_id")
    
    lexicon_positive = set()
    lexicon_negative = set()
    negation_words_set = set()
    booster_words_set = set()
    
    # Baca sentiwords (format: kata:skor)
    sentiwords_path = os.path.join(SENTI_PATH, "sentiwords_id.txt")
    if os.path.exists(sentiwords_path):
        with open(sentiwords_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and ':' in line:
                    parts = line.split(':')
                    word = parts[0].lower().strip()
                    try:
                        score = int(parts[1])
                        if score > 0:
                            lexicon_positive.add(word)
                        elif score < 0:
                            lexicon_negative.add(word)
                    except:
                        pass
    
    # Baca idioms (format: kata:skor)
    idioms_path = os.path.join(SENTI_PATH, "idioms_id.txt")
    if os.path.exists(idioms_path):
        with open(idioms_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and ':' in line:
                    parts = line.split(':')
                    word = parts[0].lower().strip()
                    try:
                        score = int(parts[1])
                        if score > 0:
                            lexicon_positive.add(word)
                        elif score < 0:
                            lexicon_negative.add(word)
                    except:
                        pass
    
    # Baca emoticon (format: emoticon | skor)
    emoticon_path = os.path.join(SENTI_PATH, "emoticon_id.txt")
    if os.path.exists(emoticon_path):
        with open(emoticon_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and '|' in line:
                    parts = line.split('|')
                    word = parts[0].lower().strip()
                    try:
                        score = int(parts[1].strip())
                        if score > 0:
                            lexicon_positive.add(word)
                        elif score < 0:
                            lexicon_negative.add(word)
                    except:
                        pass
    
    # Baca negation words (satu kata per baris)
    negation_path = os.path.join(SENTI_PATH, "negatingword.txt")
    if os.path.exists(negation_path):
        with open(negation_path, 'r', encoding='utf-8') as f:
            for line in f:
                word = line.strip().lower()
                if word:
                    negation_words_set.add(word)
    
    # Baca booster words (format: kata:skor)
    booster_path = os.path.join(SENTI_PATH, "boosterwords_id.txt")
    if os.path.exists(booster_path):
        with open(booster_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and ':' in line:
                    parts = line.split(':')
                    word = parts[0].lower().strip()
                    if word:
                        booster_words_set.add(word)
    
    all_lexicon = lexicon_positive | lexicon_negative
    
    print(f"✅ Lexicon: {len(lexicon_positive)} positif, {len(lexicon_negative)} negatif, "
          f"{len(negation_words_set)} negasi, {len(booster_words_set)} booster")
    
    # Ambil semua kata dari dataset
    results = db.query(Preprocessing.clean_title).all()
    
    all_words = []
    known_words_list = []
    unknown_words_list = []
    negation_words_found = []
    booster_words_found = []
    
    for (text,) in results:
        if text:
            text_lower = text.lower()
            words = re.findall(r'\b\w+\b', text_lower)
            all_words.extend(words)
            
            for word in words:
                if word in all_lexicon:
                    known_words_list.append(word)
                else:
                    unknown_words_list.append(word)
                
                if word in negation_words_set:
                    negation_words_found.append(word)
                
                if word in booster_words_set:
                    booster_words_found.append(word)
    
    all_counter = Counter(all_words)
    known_counter = Counter(known_words_list)
    unknown_counter = Counter(unknown_words_list)
    negation_counter = Counter(negation_words_found)
    booster_counter = Counter(booster_words_found)
    
    total_all = sum(all_counter.values())
    total_known = sum(known_counter.values())
    total_unknown = sum(unknown_counter.values())
    total_negation = sum(negation_counter.values())
    total_booster = sum(booster_counter.values())
    
    return {
        "status": "success",
        "data": {
            "total_documents": len(results),
            "total_words": total_all,
            "lexicon_stats": {
                "positive_words": len(lexicon_positive),
                "negative_words": len(lexicon_negative),
                "negation_words": len(negation_words_set),
                "booster_words": len(booster_words_set),
                "total_lexicon": len(all_lexicon)
            },
            "coverage": {
                "known": {
                    "count": total_known,
                    "pct": round((total_known / total_all * 100), 1) if total_all > 0 else 0
                },
                "unknown": {
                    "count": total_unknown,
                    "pct": round((total_unknown / total_all * 100), 1) if total_all > 0 else 0
                },
                "negation": {
                    "count": total_negation,
                    "pct": round((total_negation / total_all * 100), 1) if total_all > 0 else 0
                },
                "booster": {
                    "count": total_booster,
                    "pct": round((total_booster / total_all * 100), 1) if total_all > 0 else 0
                }
            },
            "top_known": [
                {"word": word, "count": count}
                for word, count in known_counter.most_common(30)
            ],
            "top_unknown": [
                {"word": word, "count": count}
                for word, count in unknown_counter.most_common(30)
            ],
            "top_negation": [
                {"word": word, "count": count}
                for word, count in negation_counter.most_common(20)
            ] if negation_counter else [],
            "top_booster": [
                {"word": word, "count": count}
                for word, count in booster_counter.most_common(20)
            ] if booster_counter else [],
            "note": f"Format file: kata:skor (sentiwords_id.txt, idioms_id.txt), emoticon: emoticon|skor, negasi: satu kata per baris"
        }
    }
@app.get("/api/data/sentistrength/unknown-words")
def get_sentistrength_unknown_words(db: Session = Depends(get_db)):
    """
    Detail kata tidak dikenal + contoh dokumen
    """
    from collections import Counter
    import re
    import os
    
    # Baca lexicon
    lexicon_dir = os.path.join("lexicons", "sentistrength_id")
    lexicon_words = set()
    
    if os.path.exists(lexicon_dir):
        for filename in os.listdir(lexicon_dir):
            if filename.endswith('.txt'):
                filepath = os.path.join(lexicon_dir, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith('#') and not line.startswith('//'):
                                parts = line.split('\t')
                                if len(parts) >= 1:
                                    word = parts[0].lower().strip()
                                    if word and len(word) > 1:
                                        lexicon_words.add(word)
                except:
                    pass
    
    # Ambil data
    results = db.query(
        SentiStrength.ss_max_positive,
        SentiStrength.ss_max_negative,
        SentiStrength.label_sentistrength,
        Preprocessing.clean_title
    ).join(
        Preprocessing, SentiStrength.news_guid == Preprocessing.news_guid
    ).all()
    
    unknown_counter = Counter()
    examples = []
    
    for pos, neg, label, text in results:
        if text:
            words = re.findall(r'\b\w+\b', text.lower())
            # Kata tidak dikenal = tidak ada di lexicon
            for w in words:
                if w not in lexicon_words:
                    unknown_counter[w] += 1
            
            # Contoh dokumen dengan skor 0
            if (pos is None or pos == 0) and (neg is None or neg == 0):
                unknown_in_doc = [w for w in words if w not in lexicon_words][:10]
                if len(examples) < 5:
                    examples.append({
                        "text": text[:150] + ("..." if len(text) > 150 else ""),
                        "label": label or "unknown",
                        "unknown_words": unknown_in_doc
                    })
    
    return {
        "status": "success",
        "data": {
            "total_unknown_words": len(unknown_counter),
            "top_unknown_words": [
                {"rank": i+1, "word": word, "frequency": count}
                for i, (word, count) in enumerate(unknown_counter.most_common(30))
            ],
            "example_documents": examples,
            "note": f"Kata-kata yang TIDAK ada di lexicon SentiStrength ({len(lexicon_words)} kata)."
        }
    }
@app.get("/api/data/sentistrength/distribution")
def get_sentistrength_distribution(db: Session = Depends(get_db)):
    """
    Distribusi skor SentiStrength
    """
    import numpy as np
    
    results = db.query(
        SentiStrength.ss_max_positive,
        SentiStrength.ss_max_negative,
        SentiStrength.label_sentistrength
    ).all()
    
    pos_scores = [r[0] for r in results if r[0] is not None]
    neg_scores = [r[1] for r in results if r[1] is not None]
    
    # Distribusi per range
    pos_dist = {
        "0": sum(1 for s in pos_scores if s == 0),
        "1-3": sum(1 for s in pos_scores if 1 <= s <= 3),
        "4-6": sum(1 for s in pos_scores if 4 <= s <= 6),
        "7-9": sum(1 for s in pos_scores if 7 <= s <= 9),
        "10+": sum(1 for s in pos_scores if s >= 10),
    }
    
    neg_dist = {
        "0": sum(1 for s in neg_scores if s == 0),
        "(-1)-(-3)": sum(1 for s in neg_scores if -3 <= s <= -1),
        "(-4)-(-6)": sum(1 for s in neg_scores if -6 <= s <= -4),
        "(-7)-(-9)": sum(1 for s in neg_scores if -9 <= s <= -7),
        "(-10)+": sum(1 for s in neg_scores if s <= -10),
    }
    
    return {
        "status": "success",
        "data": {
            "positive": {
                "mean": round(float(np.mean(pos_scores)), 2) if pos_scores else 0,
                "std": round(float(np.std(pos_scores)), 2) if pos_scores else 0,
                "min": int(np.min(pos_scores)) if pos_scores else 0,
                "max": int(np.max(pos_scores)) if pos_scores else 0,
                "distribution": pos_dist
            },
            "negative": {
                "mean": round(float(np.mean(neg_scores)), 2) if neg_scores else 0,
                "std": round(float(np.std(neg_scores)), 2) if neg_scores else 0,
                "min": int(np.min(neg_scores)) if neg_scores else 0,
                "max": int(np.max(neg_scores)) if neg_scores else 0,
                "distribution": neg_dist
            }
        }
    }


@app.get("/api/data/sentistrength/negation-examples")
def get_negation_examples(db: Session = Depends(get_db)):
    from collections import defaultdict
    import os
    
    SENTI_PATH = os.path.join("lexicons", "sentistrength_id")
    
    negation_words = set()
    with open(os.path.join(SENTI_PATH, "negatingword.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            w = line.strip().lower()
            if w: negation_words.add(w)
    
    sentiwords = {}
    with open(os.path.join(SENTI_PATH, "sentiwords_id.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            if ':' in line:
                p = line.strip().split(':')
                if len(p) >= 2:
                    try: sentiwords[p[0].lower()] = int(p[1])
                    except: pass
    
    results = db.query(Preprocessing.clean_title).all()
    
    # ✅ HAPUS BATASAN 3, tampilkan SEMUA
    negation_found = defaultdict(lambda: {"count": 0, "documents": []})
    
    for (text,) in results:
        if not text: continue
        words = text.lower().split()
        
        for i, word in enumerate(words):
            clean = word.strip('.,!?;:"\'()[]{}')
            if clean in negation_words and i + 1 < len(words):
                next_word = words[i + 1].strip('.,!?;:"\'()[]{}')
                if next_word in sentiwords:
                    phrase = f"{clean}_{next_word}"
                    negation_found[phrase]["count"] += 1
                    # ✅ SIMPAN SEMUA (hapus if len < 3)
                    negation_found[phrase]["documents"].append(text)
    
    sorted_results = sorted(negation_found.items(), key=lambda x: x[1]["count"], reverse=True)
    
    return {
        "status": "success",
        "data": {
            "examples": [
                {
                    "phrase": phrase,
                    "count": data["count"],
                    "samples": data["documents"]  # ✅ Semua sample
                }
                for phrase, data in sorted_results
            ]
        }
    }

@app.get("/api/data/sentistrength/booster-examples")
def get_booster_examples(db: Session = Depends(get_db)):
    """
    Data REAL dari database: deteksi frasa booster di semua dokumen
    """
    from collections import defaultdict
    import os
    
    SENTI_PATH = os.path.join("lexicons", "sentistrength_id")
    
    # Load lexicon
    booster_words = set()
    with open(os.path.join(SENTI_PATH, "boosterwords_id.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            if ':' in line:
                w = line.strip().split(':')[0].lower()
                if w: booster_words.add(w)
    
    sentiwords = {}
    with open(os.path.join(SENTI_PATH, "sentiwords_id.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            if ':' in line:
                p = line.strip().split(':')
                if len(p) >= 2:
                    try: sentiwords[p[0].lower()] = int(p[1])
                    except: pass
    
    results = db.query(Preprocessing.clean_title).all()
    
    booster_found = defaultdict(lambda: {"count": 0, "documents": []})
    
    for (text,) in results:
        if not text: continue
        words = text.lower().split()
        
        for i, word in enumerate(words):
            clean = word.strip('.,!?;:"\'()[]{}')
            
            if clean in booster_words:
                # Cek kata sebelum
                if i > 0:
                    prev_word = words[i - 1].strip('.,!?;:"\'()[]{}')
                    if prev_word in sentiwords:
                        phrase = f"{clean}_{prev_word}"
                        booster_found[phrase]["count"] += 1
                        if len(booster_found[phrase]["documents"]) < 3:
                            booster_found[phrase]["documents"].append(text)
                
                # Cek kata sesudah
                if i + 1 < len(words):
                    next_word = words[i + 1].strip('.,!?;:"\'()[]{}')
                    if next_word in sentiwords:
                        phrase = f"{clean}_{next_word}"
                        booster_found[phrase]["count"] += 1
                        if len(booster_found[phrase]["documents"]) < 3:
                            booster_found[phrase]["documents"].append(text)
    
    sorted_results = sorted(booster_found.items(), key=lambda x: x[1]["count"], reverse=True)
    
    return {
        "status": "success",
        "data": {
            "examples": [
                {
                    "phrase": phrase,
                    "count": data["count"],
                    "samples": data["documents"]
                }
                for phrase, data in sorted_results[:30]
            ]
        }
    }

@app.get("/api/data/sentistrength/all-negation")
def get_all_negation_data(db: Session = Depends(get_db)):
    """
    Tampilkan SEMUA frasa negasi: kata_negasi + kata_sentimen
    Contoh: tidak_baik, tak_terlibat, bukan_korupsi
    """
    from collections import defaultdict
    import os
    
    SENTI_PATH = os.path.join("lexicons", "sentistrength_id")
    
    # Load negation words
    negation_words = set()
    with open(os.path.join(SENTI_PATH, "negatingword.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            w = line.strip().lower()
            if w: negation_words.add(w)
    
    # Load sentiwords
    sentiwords = set()
    with open(os.path.join(SENTI_PATH, "sentiwords_id.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            if ':' in line:
                word = line.strip().split(':')[0].lower()
                if word: sentiwords.add(word)
    
    results = db.query(Preprocessing.clean_title).all()
    
    all_negation = []
    
    for (text,) in results:
        if not text: continue
        words = text.lower().split()
        
        for i, word in enumerate(words):
            clean = word.strip('.,!?;:"\'()[]{}')
            # HANYA jika kata negasi diikuti kata sentimen
            if clean in negation_words and i + 1 < len(words):
                next_word = words[i + 1].strip('.,!?;:"\'()[]{}')
                if next_word in sentiwords:
                    phrase = f"{clean}_{next_word}"
                    all_negation.append({
                        "phrase": phrase,
                        "negation_word": clean,
                        "sentiment_word": next_word,
                        "full_text": text
                    })
    
    return {
        "status": "success",
        "data": {
            "total": len(all_negation),
            "results": all_negation
        }
    }


@app.get("/api/data/sentistrength/all-booster")
def get_all_booster_data(db: Session = Depends(get_db)):
    """
    Tampilkan SEMUA frasa booster: kata_booster + kata_sentimen
    Contoh: sangat_bagus, paling_laris, tambah_kuat
    """
    from collections import defaultdict
    import os
    
    SENTI_PATH = os.path.join("lexicons", "sentistrength_id")
    
    # Load booster words
    booster_words = set()
    with open(os.path.join(SENTI_PATH, "boosterwords_id.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            if ':' in line:
                word = line.strip().split(':')[0].lower()
                if word: booster_words.add(word)
    
    # Load sentiwords
    sentiwords = set()
    with open(os.path.join(SENTI_PATH, "sentiwords_id.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            if ':' in line:
                word = line.strip().split(':')[0].lower()
                if word: sentiwords.add(word)
    
    results = db.query(Preprocessing.clean_title).all()
    
    all_booster = []
    
    for (text,) in results:
        if not text: continue
        words = text.lower().split()
        
        for i, word in enumerate(words):
            clean = word.strip('.,!?;:"\'()[]{}')
            if clean in booster_words:
                # Cek kata sebelum (booster + sentimen)
                if i > 0:
                    prev_word = words[i - 1].strip('.,!?;:"\'()[]{}')
                    if prev_word in sentiwords:
                        phrase = f"{clean}_{prev_word}"
                        all_booster.append({
                            "phrase": phrase,
                            "booster_word": clean,
                            "sentiment_word": prev_word,
                            "position": "sebelum",
                            "full_text": text
                        })
                
                # Cek kata sesudah (booster + sentimen)
                if i + 1 < len(words):
                    next_word = words[i + 1].strip('.,!?;:"\'()[]{}')
                    if next_word in sentiwords:
                        phrase = f"{clean}_{next_word}"
                        all_booster.append({
                            "phrase": phrase,
                            "booster_word": clean,
                            "sentiment_word": next_word,
                            "position": "sesudah",
                            "full_text": text
                        })
    
    return {
        "status": "success",
        "data": {
            "total": len(all_booster),
            "results": all_booster
        }
    }


@app.get("/api/data/sentistrength/all-booster")
def get_all_booster_data(db: Session = Depends(get_db)):
    """
    Tampilkan SEMUA data yang mengandung kata booster (tanpa filter)
    """
    from collections import defaultdict
    import os
    
    SENTI_PATH = os.path.join("lexicons", "sentistrength_id")
    
    # Load booster words
    booster_words = set()
    with open(os.path.join(SENTI_PATH, "boosterwords_id.txt"), 'r', encoding='utf-8') as f:
        for line in f:
            if ':' in line:
                w = line.strip().split(':')[0].lower()
                if w: booster_words.add(w)
    
    results = db.query(Preprocessing.clean_title).all()
    
    all_booster_data = []
    
    for (text,) in results:
        if not text: continue
        text_lower = text.lower()
        words = text_lower.split()
        
        for i, word in enumerate(words):
            clean = word.strip('.,!?;:"\'()[]{}')
            if clean in booster_words:
                prev_word = words[i-1].strip('.,!?;:"\'()[]{}') if i > 0 else ""
                next_word = words[i+1].strip('.,!?;:"\'()[]{}') if i + 1 < len(words) else ""
                
                all_booster_data.append({
                    "booster_word": clean,
                    "prev_word": prev_word,
                    "next_word": next_word,
                    "position": i,
                    "full_text": text
                })
    
    return {
        "status": "success",
        "data": {
            "total": len(all_booster_data),
            "booster_words_found": sorted(booster_words),
            "results": all_booster_data
        }
    }