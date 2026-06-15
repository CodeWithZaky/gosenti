from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import dashboard
from routers import evaluation
from routers import inset_feature
from routers import labeling
from routers import news
from routers import preprocessing
from routers import tfidf_feature
from routers import training

app = FastAPI(title="Gosenti Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(news.router)
app.include_router(preprocessing.router)
app.include_router(labeling.router)
app.include_router(inset_feature.router)
app.include_router(tfidf_feature.router)
app.include_router(training.router)
app.include_router(evaluation.router)


@app.get("/")
def read_root():
    return {"message": "Gosenti Backend is Running!"}
