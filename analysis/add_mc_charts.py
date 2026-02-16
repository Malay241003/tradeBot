"""
Script to add Monte Carlo V2 visualization cells to trading_analysis.ipynb.
Run this once from the analysis/ directory.
Reads mc_v2_report.json for drawdown distributions and equity paths.
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
        "# 🎲 Monte Carlo V2 — Institutional Risk Analysis\n",
        "**4 simulation models compared:** IID Shuffle (baseline), Block Bootstrap (streak-preserving), Correlation-Preserving (cross-pair clustering), and Stress Injection (edge decay + loss streaks).\n",
        "\n",
        "Data source: `mc_v2_report.json` and `mc_v2_comparison.csv`"
    ]
})

# --- Load MC data ---
new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "import json\n",
        "import numpy as np\n",
        "\n",
        "# Load MC V2 report\n",
        "mc_path = os.path.join(os.path.dirname(os.getcwd()), 'mc_v2_report.json') if 'analysis' in os.getcwd() else 'mc_v2_report.json'\n",
        "try:\n",
        "    with open(mc_path, 'r') as f:\n",
        "        mc_data = json.load(f)\n",
        "    print(f'✅ Loaded MC V2 data: {len(mc_data[\"models\"])} models')\n",
        "    for m in mc_data['models']:\n",
        "        print(f\"   {m['name']:20s} | 1% DD: {m['stats']['pct1DD']:6.1f}R | 5% DD: {m['stats']['pct5DD']:6.1f}R | Median Equity: {m['stats']['medianEquity']:8.1f}R | RoR: {m['stats']['riskOfRuin']}\")\n",
        "except FileNotFoundError:\n",
        "    mc_data = None\n",
        "    print('❌ mc_v2_report.json not found. Run backtest/run.js first.')"
    ]
})

# --- 1. Drawdown Distribution Overlay ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 1. Drawdown Distribution Overlay\n",
        "**All 4 MC models on one chart.** Vertical lines show 1% and 5% worst-case DD for each model.\n",
        "\n",
        "- 🔵 IID = baseline (assumes trades are independent)\n",
        "- 🟢 Block Bootstrap = preserves losing streaks\n",
        "- 🟠 Correlation-Preserving = preserves cross-pair clustering\n",
        "- 🔴 Stress = edge decay + injected loss streaks"
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if mc_data is not None:\n",
        "    fig, ax = plt.subplots(figsize=(16, 7))\n",
        "\n",
        "    model_keys = ['iid', 'block', 'correlated', 'stress']\n",
        "    model_names = ['IID Shuffle', 'Block Bootstrap', 'Correl-Preserve', 'Stress Injected']\n",
        "    colors = ['#42A5F5', '#66BB6A', '#FFA726', '#EF5350']\n",
        "    alphas = [0.5, 0.5, 0.5, 0.5]\n",
        "\n",
        "    for key, name, color, alpha in zip(model_keys, model_names, colors, alphas):\n",
        "        dds = mc_data['drawdowns'][key]\n",
        "        ax.hist(dds, bins=60, alpha=alpha, color=color, label=name, edgecolor='white', linewidth=0.3)\n",
        "\n",
        "        # 1% and 5% lines\n",
        "        pct1 = np.percentile(dds, 99)\n",
        "        pct5 = np.percentile(dds, 95)\n",
        "        ax.axvline(pct1, color=color, linestyle='--', linewidth=1.5, alpha=0.9)\n",
        "        ax.axvline(pct5, color=color, linestyle=':', linewidth=1.2, alpha=0.7)\n",
        "\n",
        "    ax.set_xlabel('Max Drawdown (R)', fontsize=13)\n",
        "    ax.set_ylabel('Frequency', fontsize=13)\n",
        "    ax.set_title('Monte Carlo V2 — Drawdown Distribution (All Models)', fontsize=15, fontweight='bold')\n",
        "    ax.legend(fontsize=11, loc='upper right')\n",
        "\n",
        "    # Add text annotation\n",
        "    ax.text(0.02, 0.95, 'Dashed = 1% worst case\\nDotted = 5% worst case',\n",
        "            transform=ax.transAxes, fontsize=10, verticalalignment='top',\n",
        "            bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))\n",
        "\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 2. Equity Path Fan Chart ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 2. Equity Path Fan Chart\n",
        "**50 sample equity curves per model.** The \"fan\" spread shows the range of possible outcomes.\n",
        "\n",
        "Tighter fan = more predictable. Wider fan = more uncertain. The stress model should show the widest spread."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if mc_data is not None:\n",
        "    fig, axes = plt.subplots(2, 2, figsize=(18, 12))\n",
        "    axes = axes.flatten()\n",
        "\n",
        "    model_keys = ['iid', 'block', 'correlated', 'stress']\n",
        "    model_names = ['IID Shuffle', 'Block Bootstrap', 'Correl-Preserve', 'Stress Injected']\n",
        "    colors = ['#42A5F5', '#66BB6A', '#FFA726', '#EF5350']\n",
        "\n",
        "    for ax, key, name, color in zip(axes, model_keys, model_names, colors):\n",
        "        paths = mc_data['paths'][key]\n",
        "\n",
        "        # Plot each path with low alpha\n",
        "        for path in paths:\n",
        "            ax.plot(path, color=color, alpha=0.08, linewidth=0.5)\n",
        "\n",
        "        # Compute and plot median path\n",
        "        max_len = max(len(p) for p in paths)\n",
        "        padded = [p + [p[-1]] * (max_len - len(p)) for p in paths]\n",
        "        median_path = np.median(padded, axis=0)\n",
        "        ax.plot(median_path, color=color, alpha=1.0, linewidth=2.5, label='Median')\n",
        "\n",
        "        # 5th and 95th percentile bands\n",
        "        p5 = np.percentile(padded, 5, axis=0)\n",
        "        p95 = np.percentile(padded, 95, axis=0)\n",
        "        x = range(len(median_path))\n",
        "        ax.fill_between(x, p5, p95, alpha=0.15, color=color, label='5th–95th %ile')\n",
        "\n",
        "        ax.axhline(0, color='gray', linewidth=0.5, linestyle='--')\n",
        "        ax.set_title(name, fontsize=14, fontweight='bold')\n",
        "        ax.set_xlabel('Trade #')\n",
        "        ax.set_ylabel('Equity (R)')\n",
        "        ax.legend(fontsize=9, loc='upper left')\n",
        "\n",
        "    plt.suptitle('Monte Carlo V2 — Equity Path Fan Charts', fontsize=16, fontweight='bold', y=1.01)\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 3. Risk Comparison Bar Chart ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 3. Risk Comparison — Side by Side\n",
        "**Grouped bars: 1% DD, 5% DD, and Median Equity for each model.**\n",
        "\n",
        "This is the key chart for capital allocation decisions."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if mc_data is not None:\n",
        "    models = mc_data['models']\n",
        "    names = [m['name'] for m in models]\n",
        "\n",
        "    fig, axes = plt.subplots(1, 3, figsize=(18, 6))\n",
        "\n",
        "    bar_colors = ['#42A5F5', '#66BB6A', '#FFA726', '#EF5350']\n",
        "\n",
        "    # 1% Worst DD\n",
        "    vals = [m['stats']['pct1DD'] for m in models]\n",
        "    bars = axes[0].bar(names, vals, color=bar_colors, edgecolor='white', linewidth=1.5)\n",
        "    axes[0].set_title('1% Worst-Case Drawdown (R)', fontsize=13, fontweight='bold')\n",
        "    axes[0].set_ylabel('Drawdown (R)')\n",
        "    for bar, v in zip(bars, vals):\n",
        "        axes[0].text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,\n",
        "                     f'{v:.1f}R', ha='center', fontweight='bold', fontsize=11)\n",
        "\n",
        "    # 5% Worst DD\n",
        "    vals = [m['stats']['pct5DD'] for m in models]\n",
        "    bars = axes[1].bar(names, vals, color=bar_colors, edgecolor='white', linewidth=1.5)\n",
        "    axes[1].set_title('5% Worst-Case Drawdown (R)', fontsize=13, fontweight='bold')\n",
        "    axes[1].set_ylabel('Drawdown (R)')\n",
        "    for bar, v in zip(bars, vals):\n",
        "        axes[1].text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,\n",
        "                     f'{v:.1f}R', ha='center', fontweight='bold', fontsize=11)\n",
        "\n",
        "    # Median Final Equity\n",
        "    vals = [m['stats']['medianEquity'] for m in models]\n",
        "    bars = axes[2].bar(names, vals, color=bar_colors, edgecolor='white', linewidth=1.5)\n",
        "    axes[2].set_title('Median Final Equity (R)', fontsize=13, fontweight='bold')\n",
        "    axes[2].set_ylabel('Equity (R)')\n",
        "    for bar, v in zip(bars, vals):\n",
        "        axes[2].text(bar.get_x() + bar.get_width()/2, bar.get_height() + 10,\n",
        "                     f'{v:.0f}R', ha='center', fontweight='bold', fontsize=11)\n",
        "\n",
        "    for ax in axes:\n",
        "        ax.tick_params(axis='x', rotation=15)\n",
        "\n",
        "    plt.suptitle('Monte Carlo V2 — Risk Comparison', fontsize=16, fontweight='bold', y=1.02)\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 4. Stress Test Heatmap ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 4. Stress Test Survival Heatmap\n",
        "**Simulates different edge-decay levels vs loss-streak lengths.**\n",
        "\n",
        "Each cell shows what % of simulations survived (final equity > 0) under that stress combination. Green = safe, Red = dangerous."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if mc_data is not None:\n",
        "    # Build stress heatmap from drawdown distributions\n",
        "    # We simulate different capital levels against observed drawdowns\n",
        "    capital_levels = [100, 150, 200, 250, 300]  # in R\n",
        "    model_keys = ['iid', 'block', 'correlated', 'stress']\n",
        "    model_names = ['IID Shuffle', 'Block Bootstrap', 'Correl-Preserve', 'Stress Injected']\n",
        "\n",
        "    survival_data = []\n",
        "    for key in model_keys:\n",
        "        dds = mc_data['drawdowns'][key]\n",
        "        row = []\n",
        "        for cap in capital_levels:\n",
        "            # % of sims where max DD < capital (survived)\n",
        "            survived = sum(1 for d in dds if d < cap) / len(dds) * 100\n",
        "            row.append(survived)\n",
        "        survival_data.append(row)\n",
        "\n",
        "    df_surv = pd.DataFrame(\n",
        "        survival_data,\n",
        "        index=model_names,\n",
        "        columns=[f'{c}R (₹{c*50:,})' for c in capital_levels]\n",
        "    )\n",
        "\n",
        "    fig, ax = plt.subplots(figsize=(14, 5))\n",
        "    sns.heatmap(\n",
        "        df_surv, annot=True, fmt='.1f', cmap='RdYlGn',\n",
        "        vmin=80, vmax=100, linewidths=1, ax=ax,\n",
        "        annot_kws={'fontsize': 13, 'fontweight': 'bold'},\n",
        "        cbar_kws={'label': 'Survival %'}\n",
        "    )\n",
        "    ax.set_title('Survival Probability vs Capital Size (% of sims where DD < Capital)',\n",
        "                 fontsize=14, fontweight='bold')\n",
        "    ax.set_xlabel('Starting Capital', fontsize=12)\n",
        "    ax.set_ylabel('MC Model', fontsize=12)\n",
        "    plt.tight_layout()\n",
        "    plt.show()\n",
        "\n",
        "    print('\\n💡 Interpretation:')\n",
        "    print('   100% = all simulations survived at that capital level')\n",
        "    print('   <99% = real risk of account wipeout under that model')\n",
        "    print('   Your current capital: 200R (₹10,000)')"
    ]
})

# ---------- inject into notebook ----------

with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
    nb = json.load(f)

nb['cells'].extend(new_cells)

with open(NOTEBOOK_PATH, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print(f"Done! Added {len(new_cells)} new cells to {NOTEBOOK_PATH}")
