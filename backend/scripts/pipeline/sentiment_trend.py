# scripts/pipeline/sentiment_trend.py
import sys
import os
import pandas as pd
import matplotlib
matplotlib.use('Agg') # WAJIB UNTUK SERVER FASTAPI AGAR TIDAK CRASH
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from datetime import datetime

# Path Setup
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))
from database import SessionLocal, News, SentiStrength

# Set style
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("Set2")
plt.rcParams['font.size'] = 11
plt.rcParams['figure.dpi'] = 100

def parse_date(date_val):
    """Parse tanggal dari berbagai format menjadi datetime object"""
    try:
        # Menangani jika sudah berupa datetime atau string ISO 8601
        return pd.to_datetime(date_val).tz_localize(None)
    except:
        return None

def plot_sentiment_trend(df, output_path):
    # (Kode fungsi ini sama persis dengan milik Anda, tidak ada yang berubah secara logika grafik)
    df['date'] = df['published_at'].apply(parse_date)
    df_clean = df.dropna(subset=['date'])
    df_clean = df_clean[(df_clean['date'].dt.year >= 2022) & (df_clean['date'].dt.year <= 2026)]
    df_clean['year_month'] = df_clean['date'].dt.to_period('M')
    
    sentiment_by_month = df_clean.groupby(['year_month', 'label_sentistrength']).size().unstack(fill_value=0)
    sentiment_pct = sentiment_by_month.div(sentiment_by_month.sum(axis=1), axis=0) * 100
    
    fig, axes = plt.subplots(2, 1, figsize=(14, 10))
    months = [str(p) for p in sentiment_pct.index]
    x_pos = range(len(months))
    colors = {'positive': '#2ecc71', 'neutral': '#95a5a6', 'negative': '#e74c3c'}
    
    for label in ['positive', 'neutral', 'negative']:
        if label in sentiment_by_month.columns:
            axes[0].plot(x_pos, sentiment_by_month[label], marker='o', linewidth=2, markersize=4, color=colors.get(label), label=label.capitalize())
            if label in sentiment_pct.columns:
                axes[1].plot(x_pos, sentiment_pct[label], marker='o', linewidth=2, markersize=4, color=colors.get(label), label=label.capitalize())
                
    axes[0].set_title('Tren Jumlah Sentimen per Bulan (2022-2026)', fontsize=14, fontweight='bold')
    axes[0].set_ylabel('Jumlah')
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)
    tick_step = max(1, len(months) // 12)
    axes[0].set_xticks(x_pos[::tick_step])
    axes[0].set_xticklabels(months[::tick_step], rotation=45, ha='right')
    
    axes[1].set_title('Tren Persentase Sentimen per Bulan (2022-2026)', fontsize=14, fontweight='bold')
    axes[1].set_ylabel('Persentase (%)')
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)
    axes[1].set_ylim(0, 100)
    axes[1].set_xticks(x_pos[::tick_step])
    axes[1].set_xticklabels(months[::tick_step], rotation=45, ha='right')
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

def plot_yearly_comparison(df, output_path):
    # (Logika pembuatan grafik Bar)
    df['date'] = df['published_at'].apply(parse_date)
    df_clean = df.dropna(subset=['date'])
    df_clean = df_clean[(df_clean['date'].dt.year >= 2022) & (df_clean['date'].dt.year <= 2026)]
    df_clean['year'] = df_clean['date'].dt.year
    
    yearly_counts = df_clean.groupby(['year', 'label_sentistrength']).size().unstack(fill_value=0)
    yearly_pct = yearly_counts.div(yearly_counts.sum(axis=1), axis=0) * 100
    
    fig, ax = plt.subplots(figsize=(12, 6))
    years = yearly_pct.index.tolist()
    x_pos = range(len(years))
    width = 0.25
    colors = {'positive': '#2ecc71', 'neutral': '#95a5a6', 'negative': '#e74c3c'}
    
    for i, label in enumerate(['positive', 'neutral', 'negative']):
        if label in yearly_pct.columns:
            bars = ax.bar([p + i*width for p in x_pos], yearly_pct[label], width, label=label.capitalize(), color=colors.get(label), edgecolor='black')
            for bar, val in zip(bars, yearly_pct[label]):
                ax.annotate(f'{val:.1f}%', xy=(bar.get_x() + bar.get_width()/2, bar.get_height()), xytext=(0, 3), textcoords="offset points", ha='center', fontsize=9)
                
    ax.set_ylabel('Persentase (%)')
    ax.set_title('Perbandingan Sentimen per Tahun (2022-2026)', fontsize=14, fontweight='bold')
    ax.set_xticks([p + width for p in x_pos])
    ax.set_xticklabels(years)
    ax.legend()
    ax.set_ylim(0, 100)
    ax.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

def plot_heatmap_trend(df, output_path):
    # (Logika Heatmap)
    df['date'] = df['published_at'].apply(parse_date)
    df_clean = df.dropna(subset=['date'])
    df_clean = df_clean[(df_clean['date'].dt.year >= 2022) & (df_clean['date'].dt.year <= 2026)]
    df_clean['year'] = df_clean['date'].dt.year
    df_clean['month'] = df_clean['date'].dt.month
    
    pivot_data = df_clean.groupby(['year', 'month', 'label_sentistrength']).size().unstack(fill_value=0)
    pivot_positive = pd.DataFrame(index=range(2022, 2027), columns=range(1, 13)).fillna(0)
    
    for year in range(2022, 2027):
        for month in range(1, 13):
            if (year, month) in pivot_data.index:
                total = pivot_data.loc[(year, month)].sum()
                pos = pivot_data.loc[(year, month)].get('positive', 0)
                pivot_positive.loc[year, month] = (pos / total * 100) if total > 0 else 0
                
    fig, ax = plt.subplots(figsize=(14, 8))
    im = ax.imshow(pivot_positive.values.astype(float), cmap='RdYlGn', aspect='auto', vmin=0, vmax=100)
    
    ax.set_xticks(range(12))
    ax.set_xticklabels(['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'])
    ax.set_yticks(range(5))
    ax.set_yticklabels([2022, 2023, 2024, 2025, 2026])
    ax.set_title('Heatmap Persentase Sentimen Positif per Bulan (2022-2026)', fontsize=14, fontweight='bold')
    
    for i in range(5):
        for j in range(12):
            val = pivot_positive.iloc[i, j]
            if val > 0:
                text_color = 'white' if val < 30 or val > 70 else 'black'
                ax.text(j, i, f'{val:.0f}%', ha='center', va='center', color=text_color, fontsize=9, fontweight='bold')
                
    plt.colorbar(im, ax=ax, label='Persentase Positif (%)')
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

def run_trend_analysis():
    def log(msg):
        print(msg)
        sys.stdout.flush()

    log("=" * 60)
    log("TAHAP 7: VISUALISASI TREN SENTIMEN (DATABASE MODE)")
    log("=" * 60)
    
    # 1. Siapkan folder statis untuk FastAPI agar UI bisa menampilkan gambarnya
    figures_dir = os.path.join(backend_dir, "static", "figures")
    os.makedirs(figures_dir, exist_ok=True)
    
    # 2. Tarik Data dari Database dengan JOIN
    log("\n[1] Menarik data tanggal & label dari Database...")
    session = SessionLocal()
    results = session.query(News.published_at, SentiStrength.label_sentistrength).join(
        SentiStrength, News.guid == SentiStrength.news_guid
    ).all()
    session.close()
    
    if not results:
        log("❌ Data kosong! Pastikan tabel News & SentiStrength ada isinya.")
        return
        
    df = pd.DataFrame(results, columns=['published_at', 'label_sentistrength'])
    log(f"✅ Data berhasil ditarik: {len(df)} baris")
    
    # 3. Generate Gambar
    log("\n[2] Membuat dan menyimpan grafik...")
    
    p1 = os.path.join(figures_dir, "sentiment_trend_line.png")
    plot_sentiment_trend(df.copy(), p1)
    log(" ➡️ Grafik Line Chart selesai.")
    
    p2 = os.path.join(figures_dir, "sentiment_yearly_comparison.png")
    plot_yearly_comparison(df.copy(), p2)
    log(" ➡️ Grafik Bar Chart selesai.")
    
    p3 = os.path.join(figures_dir, "sentiment_heatmap.png")
    plot_heatmap_trend(df.copy(), p3)
    log(" ➡️ Grafik Heatmap selesai.")
    
    log("\n" + "=" * 60)
    log("✅ SELURUH VISUALISASI SELESAI!")
    log(f"📁 Gambar telah disimpan di folder backend/static/figures/")
    log("=" * 60)

if __name__ == "__main__":
    run_trend_analysis()