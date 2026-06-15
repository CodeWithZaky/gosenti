# routers/dashboard.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import ExperimentResult, News, Preprocessing, SentiStrength
from utils.db import get_db

router = APIRouter(prefix="/api", tags=["Dashboard"])


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    latest = db.query(ExperimentResult).order_by(ExperimentResult.created_at.desc()).first()
    return {
        "total_news": db.query(News).count(),
        "total_preprocessed": db.query(Preprocessing).count(),
        "total_sentistrength": db.query(SentiStrength).count(),
        "accuracy": latest.proposed_accuracy if latest else 0,
        "f1_score": latest.proposed_f1 if latest else 0,
        "improvement": latest.improvement_accuracy if latest else 0,
    }


@router.get("/dashboard/trend")
def get_sentiment_trend(db: Session = Depends(get_db)):
    import pandas as pd

    rows = (
        db.query(News.published_at, SentiStrength.label_sentistrength)
        .join(SentiStrength, News.guid == SentiStrength.news_guid)
        .all()
    )
    if not rows:
        return {"status": "error", "message": "Tiada data"}

    df = pd.DataFrame(rows, columns=["published_at", "label"])
    df["date"] = pd.to_datetime(df["published_at"], errors="coerce").dt.tz_localize(None)
    df = df.dropna(subset=["date"])
    df = df[df["date"].dt.year.between(2022, 2026)]
    df["month_year"] = df["date"].dt.strftime("%b %Y")
    df["sort_key"] = df["date"].dt.strftime("%Y-%m")

    grouped = (
        df.groupby(["sort_key", "month_year", "label"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    for col in ("positive", "neutral", "negative"):
        if col not in grouped.columns:
            grouped[col] = 0

    grouped = grouped.sort_values("sort_key")
    chart_data = [
        {
            "date": r["month_year"],
            "positive": int(r["positive"]),
            "neutral": int(r["neutral"]),
            "negative": int(r["negative"]),
        }
        for _, r in grouped.iterrows()
    ]
    return {"status": "success", "data": chart_data}
