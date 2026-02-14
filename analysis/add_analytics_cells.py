"""
Script to add trading analytics graph cells to the existing trading_analysis.ipynb notebook.
Run this once from the analysis/ directory.
"""
import json, os

NOTEBOOK_PATH = os.path.join(os.path.dirname(__file__), "trading_analysis.ipynb")

# ---------- define new cells ----------

new_cells = []

# --- Section header ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "---\n",
        "# 📊 Fat-Tail Distribution Analytics\n",
        "**Institutional Check:** Do MFE/MAE distributions exhibit fat tails? If yes, fixed TP/SL may be leaving R on the table or exposing you to outlier adverse moves that normal models underestimate."
    ]
})

# --- Load CSVs ---
new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "# Load the three analytics CSVs\n",
        "df_analytics = load('trading_analytics.csv')\n",
        "df_tp_eff    = load('tp_efficiency.csv')\n",
        "df_mae_surv  = load('mae_survival.csv')\n",
        "\n",
        "# Also need detailed trades for scatter / histogram\n",
        "df_trades = load('trades_detailed.csv')\n",
        "\n",
        "# Quick preview of the analytics summary (global rows only)\n",
        "if df_analytics is not None:\n",
        "    display(df_analytics[df_analytics['Scope'].str.startswith('GLOBAL')])"
    ]
})

# --- 1. R / MFE / MAE Histograms ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 1. R / MFE / MAE Distribution Histograms\n",
        "**What to look for:** A normal distribution has kurtosis ≈ 0 (excess). Fat tails → kurtosis >> 0. Positive skew means the right tail (big wins) is heavier."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if df_trades is not None:\n",
        "    fig, axes = plt.subplots(1, 3, figsize=(18, 5))\n",
        "\n",
        "    for ax, col, color, label in zip(\n",
        "        axes,\n",
        "        ['R', 'MaxFavorableR', 'MaxAdverseR'],\n",
        "        ['#4FC3F7', '#66BB6A', '#EF5350'],\n",
        "        ['Trade R', 'MFE (MaxFavorableR)', 'MAE (MaxAdverseR)']\n",
        "    ):\n",
        "        data = df_trades[col].dropna()\n",
        "        ax.hist(data, bins=40, color=color, edgecolor='white', alpha=0.85)\n",
        "        ax.axvline(data.median(), color='black', linestyle='--', linewidth=1.2, label=f'Median={data.median():.2f}')\n",
        "        ax.set_title(label, fontsize=13, fontweight='bold')\n",
        "        ax.set_xlabel('R-multiple')\n",
        "        ax.set_ylabel('Count')\n",
        "        ax.legend()\n",
        "\n",
        "    plt.suptitle('Distribution of R, MFE & MAE', fontsize=15, fontweight='bold', y=1.02)\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 2. MFE vs Actual R (scatter) ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 2. MFE vs Actual R (Scatter)\n",
        "**Institutional Check:** Points well above the diagonal = trades that ran far beyond your TP. Cluster density tells you how much edge you're leaving on the table."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if df_trades is not None:\n",
        "    fig, ax = plt.subplots(figsize=(10, 8))\n",
        "    winners = df_trades[df_trades['R'] > 0]\n",
        "    losers  = df_trades[df_trades['R'] <= 0]\n",
        "\n",
        "    ax.scatter(winners['R'], winners['MaxFavorableR'], c='#66BB6A', alpha=0.6, s=30, label='Winners')\n",
        "    ax.scatter(losers['R'],  losers['MaxFavorableR'],  c='#EF5350', alpha=0.6, s=30, label='Losers')\n",
        "\n",
        "    # Diagonal reference\n",
        "    lim = max(df_trades['R'].max(), df_trades['MaxFavorableR'].max()) * 1.05\n",
        "    ax.plot([0, lim], [0, lim], 'k--', linewidth=0.8, alpha=0.4, label='MFE = R (perfect capture)')\n",
        "\n",
        "    ax.set_xlabel('Actual R', fontsize=12)\n",
        "    ax.set_ylabel('Max Favorable Excursion (R)', fontsize=12)\n",
        "    ax.set_title('MFE vs Actual R — How Much Edge Are You Capturing?', fontsize=14, fontweight='bold')\n",
        "    ax.legend()\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 3. MAE Survival Bar Chart ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 3. MAE Survival Analysis\n",
        "**Institutional Check:** Of eventual winners, what % dipped beyond various MAE thresholds before recovering? High survival at deep MAE = your SL is well-placed and absorbs noise."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if df_mae_surv is not None:\n",
        "    fig, ax = plt.subplots(figsize=(10, 5))\n",
        "    bars = ax.barh(\n",
        "        df_mae_surv['MAE_Threshold_R'].astype(str) + 'R',\n",
        "        df_mae_surv['PctOfWinners'] * 100,\n",
        "        color='#EF5350', edgecolor='white', height=0.6\n",
        "    )\n",
        "    for bar, pct in zip(bars, df_mae_surv['PctOfWinners'] * 100):\n",
        "        ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2,\n",
        "                f'{pct:.1f}%', va='center', fontsize=11, fontweight='bold')\n",
        "    ax.set_xlabel('% of Winners', fontsize=12)\n",
        "    ax.set_ylabel('MAE Threshold (R)', fontsize=12)\n",
        "    ax.set_title('MAE Survival — Winners That Dipped Beyond Threshold', fontsize=14, fontweight='bold')\n",
        "    ax.set_xlim(0, 100)\n",
        "    ax.invert_yaxis()\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 4. TP Capture Efficiency per Pair ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 4. TP Capture Efficiency (Per Pair)\n",
        "**Institutional Check:** A capture ratio near 100% means your TP is well-calibrated. Much below 100% means the market regularly runs past your TP — you may want a trailing stop or wider TP."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if df_tp_eff is not None:\n",
        "    fig, axes = plt.subplots(1, 2, figsize=(18, 6))\n",
        "\n",
        "    pair_rows = df_tp_eff[df_tp_eff['Scope'] != 'GLOBAL'].copy()\n",
        "    pair_rows = pair_rows.sort_values('AvgCapture', ascending=True)\n",
        "\n",
        "    # Left: Avg capture %\n",
        "    colors_cap = ['#66BB6A' if v >= 0.8 else '#FFA726' if v >= 0.5 else '#EF5350'\n",
        "                  for v in pair_rows['AvgCapture']]\n",
        "    axes[0].barh(pair_rows['Scope'], pair_rows['AvgCapture'] * 100, color=colors_cap, edgecolor='white')\n",
        "    axes[0].set_xlabel('Avg Capture %')\n",
        "    axes[0].set_title('TP Capture Efficiency', fontsize=13, fontweight='bold')\n",
        "    axes[0].axvline(100, color='black', linestyle='--', linewidth=0.8, alpha=0.3)\n",
        "\n",
        "    # Right: Avg R left on table\n",
        "    axes[1].barh(pair_rows['Scope'], pair_rows['LeftOnTableAvgR'], color='#AB47BC', edgecolor='white')\n",
        "    axes[1].set_xlabel('Avg R Left On Table')\n",
        "    axes[1].set_title('R Left On Table Per Pair', fontsize=13, fontweight='bold')\n",
        "\n",
        "    plt.suptitle(f'TP Efficiency Analysis (TP_R = {pair_rows[\"TP_R\"].iloc[0]})', fontsize=15, fontweight='bold', y=1.02)\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 5. Fat-Tail Kurtosis Heatmap ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 5. Excess Kurtosis Heatmap (Per Pair)\n",
        "**Interpretation:** Excess kurtosis > 0 = fat-tailed. Higher values = more extreme outlier risk. Compare R (capped by TP/SL) vs raw MFE/MAE."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if df_analytics is not None:\n",
        "    # Build a pivot: rows = pair, columns = series (R / MFE / MAE)\n",
        "    df_kurt = df_analytics[['Scope', 'ExcessKurtosis']].copy()\n",
        "    df_kurt['Pair'] = df_kurt['Scope'].str.rsplit('_', n=1).str[0]\n",
        "    df_kurt['Series'] = df_kurt['Scope'].str.rsplit('_', n=1).str[1]\n",
        "    df_kurt = df_kurt[df_kurt['Pair'] != 'GLOBAL']\n",
        "    pivot = df_kurt.pivot(index='Pair', columns='Series', values='ExcessKurtosis')\n",
        "\n",
        "    fig, ax = plt.subplots(figsize=(10, max(6, len(pivot) * 0.5)))\n",
        "    sns.heatmap(pivot, annot=True, fmt='.1f', cmap='RdYlGn_r', center=0, linewidths=0.5, ax=ax)\n",
        "    ax.set_title('Excess Kurtosis by Pair & Series (>0 = Fat-Tailed)', fontsize=14, fontweight='bold')\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 6. Skewness comparison ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 6. Skewness Comparison (Per Pair)\n",
        "**Interpretation:** Positive skew = right tail is heavier (more big wins). Negative skew = left tail is heavier (more big losses). Compare across pairs to find which coins have the most asymmetric distributions."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if df_analytics is not None:\n",
        "    df_skew = df_analytics[['Scope', 'Skewness']].copy()\n",
        "    df_skew['Pair'] = df_skew['Scope'].str.rsplit('_', n=1).str[0]\n",
        "    df_skew['Series'] = df_skew['Scope'].str.rsplit('_', n=1).str[1]\n",
        "    df_skew = df_skew[df_skew['Pair'] != 'GLOBAL']\n",
        "    pivot_skew = df_skew.pivot(index='Pair', columns='Series', values='Skewness')\n",
        "\n",
        "    fig, ax = plt.subplots(figsize=(10, max(6, len(pivot_skew) * 0.5)))\n",
        "    sns.heatmap(pivot_skew, annot=True, fmt='.2f', cmap='coolwarm', center=0, linewidths=0.5, ax=ax)\n",
        "    ax.set_title('Skewness by Pair & Series (+ = Right Tail Heavier)', fontsize=14, fontweight='bold')\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# ---------- inject into notebook ----------

with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
    nb = json.load(f)

nb['cells'].extend(new_cells)

with open(NOTEBOOK_PATH, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print(f"Done! Added {len(new_cells)} new cells to {NOTEBOOK_PATH}")
