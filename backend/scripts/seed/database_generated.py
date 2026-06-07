# Auto-generated schema from database
# Source: postgresql://postgres:***@localhost:5432/gosenti

from sqlalchemy import DOUBLE_PRECISION, INTEGER, JSON, TEXT, TIMESTAMP, VARCHAR, create_engine, Column, Integer, String, Float, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class News(Base):
    __tablename__ = "news"

    guid = Column(VARCHAR(32), primary_key=True)
    title = Column(TEXT)
    url = Column(TEXT)
    portal_name = Column(VARCHAR(100))
    published_at = Column(TIMESTAMP)
    scraped_at = Column(TIMESTAMP)

class News_duplicates(Base):
    __tablename__ = "news_duplicates"

    id = Column(INTEGER, primary_key=True, index=True)
    retained_guid = Column(VARCHAR(32))
    retained_title = Column(TEXT)
    retained_date = Column(TIMESTAMP)
    removed_guid = Column(VARCHAR(32))
    removed_title = Column(TEXT)
    removed_date = Column(TIMESTAMP)
    jaccard_score = Column(DOUBLE_PRECISION)
    # ForeignKey to news.guid

class Preprocessing(Base):
    __tablename__ = "preprocessing"

    id = Column(INTEGER, primary_key=True, index=True)
    news_guid = Column(VARCHAR(32))
    clean_title = Column(TEXT)
    # ForeignKey to news.guid

class Sentistrength(Base):
    __tablename__ = "sentistrength"

    id = Column(INTEGER, primary_key=True, index=True)
    news_guid = Column(VARCHAR(32))
    label_sentistrength = Column(VARCHAR(50))
    ss_max_positive = Column(INTEGER)
    ss_max_negative = Column(INTEGER)
    # ForeignKey to news.guid

class Inset_features(Base):
    __tablename__ = "inset_features"

    id = Column(INTEGER, primary_key=True, index=True)
    news_guid = Column(VARCHAR(32))
    inset_pos = Column(DOUBLE_PRECISION)
    inset_neg = Column(DOUBLE_PRECISION)
    # ForeignKey to news.guid

class Predictions(Base):
    __tablename__ = "predictions"

    id = Column(INTEGER, primary_key=True, index=True)
    news_guid = Column(VARCHAR(32))
    model_id = Column(INTEGER)
    sentiment = Column(VARCHAR(50))
    confidence = Column(DOUBLE_PRECISION)
    prob_positive = Column(DOUBLE_PRECISION)
    prob_negative = Column(DOUBLE_PRECISION)
    predicted_at = Column(TIMESTAMP)
    # ForeignKey to news.guid
    # ForeignKey to models.id

class Models(Base):
    __tablename__ = "models"

    id = Column(INTEGER, primary_key=True, index=True)
    experiment_name = Column(VARCHAR(255))
    version = Column(VARCHAR(50))
    config_parameters = Column(JSON)
    model_folder_path = Column(VARCHAR(500))
    created_at = Column(TIMESTAMP)

class Evaluations(Base):
    __tablename__ = "evaluations"

    id = Column(INTEGER, primary_key=True, index=True)
    model_id = Column(INTEGER)
    dataset_type = Column(VARCHAR(100))
    accuracy = Column(DOUBLE_PRECISION)
    f1_score = Column(DOUBLE_PRECISION)
    precision = Column(DOUBLE_PRECISION)
    recall = Column(DOUBLE_PRECISION)
    evaluated_at = Column(TIMESTAMP)
    # ForeignKey to models.id

class Cv_folds(Base):
    __tablename__ = "cv_folds"

    id = Column(INTEGER, primary_key=True, index=True)
    experiment_id = Column(INTEGER)
    fold_number = Column(INTEGER)
    accuracy = Column(DOUBLE_PRECISION)
    f1_score = Column(DOUBLE_PRECISION)
    # ForeignKey to experiment_results.id

class Experiment_results(Base):
    __tablename__ = "experiment_results"

    id = Column(INTEGER, primary_key=True, index=True)
    experiment_name = Column(VARCHAR)
    model_type = Column(VARCHAR)
    total_samples = Column(INTEGER)
    cv_folds = Column(INTEGER)
    accuracy_mean = Column(DOUBLE_PRECISION)
    accuracy_std = Column(DOUBLE_PRECISION)
    precision_mean = Column(DOUBLE_PRECISION)
    precision_std = Column(DOUBLE_PRECISION)
    recall_mean = Column(DOUBLE_PRECISION)
    recall_std = Column(DOUBLE_PRECISION)
    f1_score_mean = Column(DOUBLE_PRECISION)
    f1_score_std = Column(DOUBLE_PRECISION)
    baseline_accuracy_mean = Column(DOUBLE_PRECISION)
    baseline_accuracy_std = Column(DOUBLE_PRECISION)
    baseline_f1_mean = Column(DOUBLE_PRECISION)
    baseline_f1_std = Column(DOUBLE_PRECISION)
    improvement_accuracy = Column(DOUBLE_PRECISION)
    improvement_f1 = Column(DOUBLE_PRECISION)
    classification_report = Column(TEXT)
    confusion_matrix = Column(TEXT)
    feature_count = Column(INTEGER)
    additional_features = Column(VARCHAR)
    created_at = Column(TIMESTAMP)
    baseline_precision_mean = Column(DOUBLE_PRECISION)
    baseline_precision_std = Column(DOUBLE_PRECISION)
    baseline_recall_mean = Column(DOUBLE_PRECISION)
    baseline_recall_std = Column(DOUBLE_PRECISION)

