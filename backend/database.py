import os
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime

Base = declarative_base()

# --- 1. TAHAP PENGUMPULAN DATA ---

class News(Base):
    __tablename__ = 'news'
    
    guid = Column(String(32), primary_key=True, index=True)
    title = Column(Text, nullable=True)
    url = Column(Text, unique=True, nullable=True)
    portal_name = Column(String(100), nullable=True)
    published_at = Column(DateTime, index=True, nullable=True)
    scraped_at = Column(DateTime, default=datetime.now)

    # Relasi
    duplicates_retained = relationship("NewsDuplicate", back_populates="news", cascade="all, delete-orphan")
    preprocessing = relationship("Preprocessing", back_populates="news", uselist=False, cascade="all, delete-orphan")
    sentistrength = relationship("SentiStrength", back_populates="news", uselist=False, cascade="all, delete-orphan")
    inset = relationship("InsetFeature", back_populates="news", uselist=False, cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="news", cascade="all, delete-orphan")

class NewsDuplicate(Base):
    __tablename__ = 'news_duplicates'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    retained_guid = Column(String(32), ForeignKey('news.guid'), index=True)
    retained_title = Column(Text)
    retained_date = Column(DateTime)
    removed_guid = Column(String(32))
    removed_title = Column(Text)
    removed_date = Column(DateTime)
    jaccard_score = Column(Float)

    news = relationship("News", back_populates="duplicates_retained")


# --- 2. TAHAP PEMROSESAN (PIPELINE) ---

class Preprocessing(Base):
    __tablename__ = 'preprocessing'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    news_guid = Column(String(32), ForeignKey('news.guid'), unique=True, index=True)
    clean_title = Column(Text) # Kolom 'title' dihapus agar tidak redundan

    news = relationship("News", back_populates="preprocessing")

class SentiStrength(Base):
    __tablename__ = 'sentistrength'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    news_guid = Column(String(32), ForeignKey('news.guid'), unique=True, index=True)
    label_sentistrength = Column(String(50))
    ss_max_positive = Column(Integer)
    ss_max_negative = Column(Integer)

    news = relationship("News", back_populates="sentistrength")

class InsetFeature(Base):
    __tablename__ = 'inset_features'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    news_guid = Column(String(32), ForeignKey('news.guid'), unique=True, index=True)
    inset_pos = Column(Float)
    inset_neg = Column(Float)

    news = relationship("News", back_populates="inset")


# --- 3. TAHAP MACHINE LEARNING (MODEL & TRACKING) ---

class ModelRegistry(Base):
    __tablename__ = 'models'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    experiment_name = Column(String(255), nullable=False)
    version = Column(String(50), unique=True, nullable=False)
    config_parameters = Column(JSON, nullable=True) 
    model_folder_path = Column(String(500), nullable=True) # Path untuk model .pkl dan TF-IDF
    created_at = Column(DateTime, default=datetime.now)

    predictions = relationship("Prediction", back_populates="model")
    evaluations = relationship("Evaluation", back_populates="model")

class Prediction(Base):
    __tablename__ = 'predictions'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    news_guid = Column(String(32), ForeignKey('news.guid'), index=True)
    model_id = Column(Integer, ForeignKey('models.id'), index=True)
    
    sentiment = Column(String(50), nullable=False)
    confidence = Column(Float, nullable=True)
    prob_positive = Column(Float, nullable=True)
    prob_negative = Column(Float, nullable=True)
    predicted_at = Column(DateTime, default=datetime.now)

    news = relationship("News", back_populates="predictions")
    model = relationship("ModelRegistry", back_populates="predictions")

class Evaluation(Base):
    __tablename__ = 'evaluations'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    model_id = Column(Integer, ForeignKey('models.id'))
    dataset_type = Column(String(100), nullable=True)
    
    accuracy = Column(Float, nullable=True)
    f1_score = Column(Float, nullable=True)
    precision = Column(Float, nullable=True)
    recall = Column(Float, nullable=True)
    evaluated_at = Column(DateTime, default=datetime.now)

    model = relationship("ModelRegistry", back_populates="evaluations")

class ExperimentResult(Base):
    __tablename__ = "experiment_results"
    id = Column(Integer, primary_key=True, index=True)
    experiment_name = Column(String)
    model_type = Column(String)
    total_samples = Column(Integer)
    cv_folds = Column(Integer)
    
    # Proposed
    accuracy_mean = Column(Float)
    accuracy_std = Column(Float)
    precision_mean = Column(Float)
    precision_std = Column(Float)
    recall_mean = Column(Float)
    recall_std = Column(Float)
    f1_score_mean = Column(Float)
    f1_score_std = Column(Float)
    
    # Baseline - TAMBAH 4 KOLOM
    baseline_accuracy_mean = Column(Float)
    baseline_accuracy_std = Column(Float)
    baseline_precision_mean = Column(Float)     # BARU
    baseline_precision_std = Column(Float)      # BARU
    baseline_recall_mean = Column(Float)        # BARU
    baseline_recall_std = Column(Float)         # BARU
    baseline_f1_mean = Column(Float)
    baseline_f1_std = Column(Float)
    
    # Improvement
    improvement_accuracy = Column(Float)
    improvement_f1 = Column(Float)
    
    # Detail
    classification_report = Column(Text)
    confusion_matrix = Column(Text)
    feature_count = Column(Integer)
    additional_features = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    folds = relationship("CvFold", back_populates="experiment")


class CvFold(Base):
    __tablename__ = "cv_folds"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiment_results.id"))
    fold_number = Column(Integer)
    accuracy = Column(Float)
    f1_score = Column(Float)

    # Relasi balik ke tabel utama
    experiment = relationship("ExperimentResult", back_populates="folds")


# --- KONFIGURASI DATABASE ---
DB_USER = "postgres"
DB_PASS = "1234567890"  
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "gosenti" 

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    print("Menghapus database lama...")
    Base.metadata.drop_all(bind=engine)
    print("Menciptakan tabel di database PostgreSQL...")
    Base.metadata.create_all(bind=engine)
    print("✅ Skema Final: Semua 8 tabel berhasil dibuat tanpa redundansi!")

if __name__ == "__main__":
    init_db()