from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import data, modeling, news, pipeline, tfidf

app = FastAPI(title="Gosenti Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(news.router)
app.include_router(pipeline.router)
app.include_router(data.router)
app.include_router(modeling.router)
app.include_router(tfidf.router)


@app.get("/")
def read_root():
    return {"message": "Gosenti Backend is Running!"}
