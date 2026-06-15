import os
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, ForeignKey, Text, text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime

Base = declarative_base()

# ============================================================
# TAHAP 1: PENGUMPULAN DATA
# ============================================================

class News(Base):
    __tablename__ = 'news'
    
    guid = Column(String(32), primary_key=True, index=True)
    title = Column(Text, nullable=True)
    url = Column(Text, nullable=True)
    portal_name = Column(String(100), nullable=True)
    published_at = Column(DateTime, index=True, nullable=True)
    scraped_at = Column(DateTime, default=datetime.now)

    # Relasi (tanpa duplicates_retained)
    preprocessing = relationship("Preprocessing", back_populates="news", uselist=False, cascade="all, delete-orphan")
    sentistrength = relationship("SentiStrength", back_populates="news", uselist=False, cascade="all, delete-orphan")
    inset = relationship("InsetFeature", back_populates="news", uselist=False, cascade="all, delete-orphan")

# ============================================================
# TAHAP 2: PEMROSESAN
# ============================================================

class Preprocessing(Base):
    __tablename__ = 'preprocessing'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    news_guid = Column(String(32), ForeignKey('news.guid'), unique=True, index=True)
    clean_title = Column(Text)

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

# ============================================================
# TAHAP 3: MODELING & EVALUASI
# ============================================================

class ExperimentResult(Base):
    __tablename__ = "experiment_results"
    
    id = Column(Integer, primary_key=True, index=True)
    experiment_name = Column(String)
    model_type = Column(String)
    total_samples = Column(Integer)
    cv_folds = Column(Integer)
    feature_count = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Hasil utama (6 kolom)
    baseline_accuracy = Column(Float)
    baseline_f1 = Column(Float)
    proposed_accuracy = Column(Float)
    proposed_f1 = Column(Float)
    improvement_accuracy = Column(Float)
    improvement_f1 = Column(Float)
    
    # Relasi
    folds = relationship("CvFold", back_populates="experiment", cascade="all, delete-orphan")

class CvFold(Base):
    __tablename__ = "cv_folds"
    
    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiment_results.id"))
    fold_number = Column(Integer)
    model_type = Column(String(20))
    accuracy = Column(Float)
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    confusion_matrix = Column(Text)

    experiment = relationship("ExperimentResult", back_populates="folds")

# ============================================================
# KONFIGURASI DATABASE
# ============================================================

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
    
    # RESET TOTAL: Hapus seluruh schema public lalu buat ulang
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.commit()
    
    print("Menciptakan tabel di database PostgreSQL...")
    Base.metadata.create_all(bind=engine)
    print("✅ 6 tabel berhasil dibuat!")

if __name__ == "__main__":
    init_db()