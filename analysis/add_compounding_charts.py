"""
Script to add 5-Year Compounding MC visualization cells to trading_analysis.ipynb.
Run this once from the analysis/ directory.
Reads mc_compounding_report.json for equity paths and final capital distributions.
"""
import json, os

NOTEBOOK_PATH = os.path.join(os.path.dirname(__file__), "trading_analysis.ipynb")

new_cells = []

# --- Section header ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "---\n",
        "# 💰 5-Year Compounding Capital Projection\n",
        "**Monte Carlo simulation with compound position sizing (0.5% of current equity per trade).**\n",
        "\n",
        "Three scenarios:\n",
        "- **Conservative** (Block Bootstrap) — preserves losing streaks\n",
        "- **Realistic** (Correlation-Preserving) — preserves cross-pair clustering\n",
        "- **Stress** (Edge Decay + Loss Streaks) — worst-case scenario\n",
        "\n",
        "Data source: `mc_compounding_report.json`"
    ]
})

# --- Load data ---
new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "import json\n",
        "import numpy as np\n",
        "\n",
        "comp_path = os.path.join(os.path.dirname(os.getcwd()), 'mc_compounding_report.json') if 'analysis' in os.getcwd() else 'mc_compounding_report.json'\n",
        "try:\n",
        "    with open(comp_path, 'r') as f:\n",
        "        comp_data = json.load(f)\n",
        "    print(f'✅ Loaded compounding MC data')\n",
        "    print(f'   Config: ₹{comp_data[\"config\"][\"startingCapital\"]:,} capital, {comp_data[\"config\"][\"riskPct\"]*100:.1f}% risk, {comp_data[\"config\"][\"targetTrades\"]} trades over {comp_data[\"config\"][\"projectionYears\"]} years')\n",
        "    for s in comp_data['scenarios']:\n",
        "        print(f'   {s[\"name\"]:15s} | Median: ₹{s[\"stats\"][\"medianFinal\"]:>10,.0f} | CAGR: {s[\"stats\"][\"medianCAGR\"]:.1f}% | Max DD: {s[\"stats\"][\"medianMaxDD\"]:.1f}% | Blown: {s[\"stats\"][\"blownPct\"]}%')\n",
        "except FileNotFoundError:\n",
        "    comp_data = None\n",
        "    print('❌ mc_compounding_report.json not found. Run backtest/run.js first.')"
    ]
})

# --- 1. Capital Growth Fan Chart ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 1. Capital Growth Fan Chart (₹)\n",
        "**50 sample equity paths per scenario.** Shows how ₹10,000 compounds over 608 trades (~5 years).\n",
        "\n",
        "Shaded band = 5th–95th percentile. Solid line = median path."
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if comp_data is not None:\n",
        "    fig, axes = plt.subplots(1, 3, figsize=(22, 7))\n",
        "\n",
        "    scenario_keys = ['conservative', 'realistic', 'stress']\n",
        "    scenario_names = ['Conservative', 'Realistic', 'Stress']\n",
        "    colors = ['#66BB6A', '#42A5F5', '#EF5350']\n",
        "\n",
        "    for ax, key, name, color in zip(axes, scenario_keys, scenario_names, colors):\n",
        "        paths = comp_data['paths'][key]\n",
        "\n",
        "        for path in paths:\n",
        "            ax.plot(path, color=color, alpha=0.06, linewidth=0.4)\n",
        "\n",
        "        # Compute percentile bands\n",
        "        max_len = max(len(p) for p in paths)\n",
        "        padded = [p + [p[-1]] * (max_len - len(p)) for p in paths]\n",
        "        median_path = np.median(padded, axis=0)\n",
        "        p5 = np.percentile(padded, 5, axis=0)\n",
        "        p95 = np.percentile(padded, 95, axis=0)\n",
        "\n",
        "        x = range(len(median_path))\n",
        "        ax.plot(median_path, color=color, linewidth=2.5, label='Median')\n",
        "        ax.fill_between(x, p5, p95, alpha=0.12, color=color, label='5th–95th %ile')\n",
        "\n",
        "        ax.axhline(10000, color='gray', linewidth=0.8, linestyle='--', alpha=0.5)\n",
        "        ax.axhline(20000, color='green', linewidth=0.6, linestyle=':', alpha=0.4, label='2× capital')\n",
        "\n",
        "        # Format y-axis as ₹\n",
        "        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x:,.0f}'))\n",
        "        ax.set_title(name, fontsize=14, fontweight='bold')\n",
        "        ax.set_xlabel('Trade #')\n",
        "        ax.set_ylabel('Account Value (₹)')\n",
        "        ax.legend(fontsize=9, loc='upper left')\n",
        "\n",
        "    plt.suptitle('5-Year Compounding — Capital Growth Paths', fontsize=16, fontweight='bold', y=1.02)\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 2. Final Capital Distribution ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 2. Final Capital Distribution\n",
        "**Histogram of final account values after 5 years (608 trades).** Vertical lines show median.\n",
        "\n",
        "Key question: What's the realistic range of outcomes?"
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if comp_data is not None:\n",
        "    fig, axes = plt.subplots(1, 3, figsize=(22, 6))\n",
        "\n",
        "    scenario_keys = ['conservative', 'realistic', 'stress']\n",
        "    scenario_names = ['Conservative', 'Realistic', 'Stress']\n",
        "    colors = ['#66BB6A', '#42A5F5', '#EF5350']\n",
        "\n",
        "    for ax, key, name, color, scenario_data in zip(\n",
        "        axes, scenario_keys, scenario_names, colors, comp_data['scenarios']\n",
        "    ):\n",
        "        finals = comp_data['finalEquities'][key]\n",
        "        stats = scenario_data['stats']\n",
        "\n",
        "        ax.hist(finals, bins=60, color=color, edgecolor='white', alpha=0.75, linewidth=0.3)\n",
        "        ax.axvline(stats['medianFinal'], color='black', linestyle='--', linewidth=2,\n",
        "                   label=f'Median: ₹{stats[\"medianFinal\"]:,.0f}')\n",
        "        ax.axvline(stats['pct5Final'], color=color, linestyle=':', linewidth=1.5,\n",
        "                   label=f'5th %ile: ₹{stats[\"pct5Final\"]:,.0f}')\n",
        "        ax.axvline(10000, color='red', linestyle='-', linewidth=1, alpha=0.5,\n",
        "                   label='Starting capital')\n",
        "\n",
        "        ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x/1000:.0f}K'))\n",
        "        ax.set_title(f'{name}\\nCAGR: {stats[\"medianCAGR\"]:.1f}%', fontsize=13, fontweight='bold')\n",
        "        ax.set_xlabel('Final Account Value')\n",
        "        ax.set_ylabel('Frequency')\n",
        "        ax.legend(fontsize=9)\n",
        "\n",
        "    plt.suptitle('5-Year Compounding — Final Capital Distribution (5,000 sims each)',\n",
        "                 fontsize=16, fontweight='bold', y=1.03)\n",
        "    plt.tight_layout()\n",
        "    plt.show()"
    ]
})

# --- 3. Summary metrics table ---
new_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## 3. Compounding Projection Summary\n",
        "**All key metrics in one table.**"
    ]
})

new_cells.append({
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "if comp_data is not None:\n",
        "    rows = []\n",
        "    for s in comp_data['scenarios']:\n",
        "        st = s['stats']\n",
        "        rows.append({\n",
        "            'Scenario': s['name'],\n",
        "            'Median Final (₹)': f\"₹{st['medianFinal']:,.0f}\",\n",
        "            '5th %ile (₹)': f\"₹{st['pct5Final']:,.0f}\",\n",
        "            '95th %ile (₹)': f\"₹{st['pct95Final']:,.0f}\",\n",
        "            'Growth (×)': f\"{st['medianFinal']/10000:.1f}×\",\n",
        "            'CAGR': f\"{st['medianCAGR']:.1f}%\",\n",
        "            'Max DD%': f\"{st['medianMaxDD']:.1f}%\",\n",
        "            '1% Worst DD%': f\"{st['pct1MaxDD']:.1f}%\",\n",
        "            'Blown': st['blownPct'] + '%',\n",
        "            'Reached 2×': st['pctReaching2x'] + '%'\n",
        "        })\n",
        "    df_summary = pd.DataFrame(rows).set_index('Scenario')\n",
        "    display(df_summary.style.set_properties(**{'text-align': 'right'}))"
    ]
})

# ---------- inject into notebook ----------

with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
    nb = json.load(f)

nb['cells'].extend(new_cells)

with open(NOTEBOOK_PATH, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print(f"Done! Added {len(new_cells)} new cells to {NOTEBOOK_PATH}")
