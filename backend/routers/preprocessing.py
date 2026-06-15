# routers/preprocessing.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import News, Preprocessing
from utils.db import get_db, paginate_query

router = APIRouter(prefix="/api/data/preprocessing", tags=["Preprocessing"])


@router.get("")
def get_preprocessing_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Preprocessing, News)
        .join(News, Preprocessing.news_guid == News.guid)
        .order_by(Preprocessing.id.desc())
    )
    result = paginate_query(query, page, page_size)
    items = [
        {
            "guid": prep.news_guid,
            "original_title": news.title,
            "clean_title": prep.clean_title,
        }
        for prep, news in result["items"]
    ]
    return {"items": items, "pagination": result["pagination"]}
