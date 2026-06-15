# routers/news.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import News
from utils.db import get_db, paginate_query

router = APIRouter(prefix="/api/news", tags=["News"])


@router.get("")
def get_news(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(News).order_by(News.published_at.desc())
    result = paginate_query(query, page, page_size)
    result["items"] = [
        {
            "guid": n.guid,
            "title": n.title,
            "url": n.url,
            "portal_name": n.portal_name,
            "published_at": n.published_at.isoformat() if n.published_at else None,
            "scraped_at": n.scraped_at.isoformat() if n.scraped_at else None,
        }
        for n in result["items"]
    ]
    return result
