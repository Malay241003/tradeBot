"""
Script to update the trading_analysis.ipynb notebook:
- Replace the basic R/MFE/MAE histograms with versions that overlay a normal (bell) curve
- Add a dedicated "Fat-Tail Bell Curve Analysis" section with individual detailed plots
"""
import json, os

NOTEBOOK_PATH = os.path.join(os.path.dirname(__file__), "trading_analysis.ipynb")

with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
    nb = json.load(f)

# --- Find and replace the basic histogram cell ---
# We search for the cell containing "Distribution of R, MFE & MAE"
for i, cell in enumerate(nb['cells']):
    src = ''.join(cell.get('source', []))
    if "Distribution of R, MFE & MAE" in src:
        # Replace this cell with an improved version that includes bell curves
        nb['cells'][i] = {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "from scipy.stats import norm\n",
                "\n",
                "if df_trades is not None:\n",
                "    fig, axes = plt.subplots(1, 3, figsize=(20, 6))\n",
                "\n",
                "    for ax, col, color, label in zip(\n",
                "        axes,\n",
                "        ['R', 'MaxFavorableR', 'MaxAdverseR'],\n",
                "        ['#4FC3F7', '#66BB6A', '#EF5350'],\n",
                "        ['Trade R', 'MFE (MaxFavorableR)', 'MAE (MaxAdverseR)']\n",
                "    ):\n",
                "        data = df_trades[col].dropna()\n",
                "        \n",
                "        # Plot histogram (density=True so we can overlay the bell curve)\n",
                "        n, bins, patches = ax.hist(data, bins=40, density=True,\n",
                "                                   color=color, edgecolor='white', alpha=0.7,\n",
                "                                   label='Actual Distribution')\n",
                "        \n",
                "        # Overlay normal (bell) curve\n",
                "        mu, std = data.mean(), data.std()\n",
                "        x = np.linspace(data.min() - 0.5, data.max() + 0.5, 300)\n",
                "        bell_curve = norm.pdf(x, mu, std)\n",
                "        ax.plot(x, bell_curve, 'k-', linewidth=2.5, label=f'Normal Dist (bell curve)\\n$\\\\mu$={mu:.2f}, $\\\\sigma$={std:.2f}')\n",
                "        \n",
                "        # Mark the median\n",
                "        ax.axvline(data.median(), color='#FF6F00', linestyle='--', linewidth=1.5,\n",
                "                   label=f'Median = {data.median():.2f}')\n",
                "        \n",
                "        ax.set_title(label, fontsize=13, fontweight='bold')\n",
                "        ax.set_xlabel('R-multiple')\n",
                "        ax.set_ylabel('Density')\n",
                "        ax.legend(fontsize=8)\n",
                "\n",
                "    plt.suptitle('Distribution vs Bell Curve — Fat Tail Detection',\n",
                "                 fontsize=16, fontweight='bold', y=1.03)\n",
                "    plt.tight_layout()\n",
                "    plt.show()"
            ]
        }
        print(f"Updated histogram cell at index {i}")
        break

# --- Now add the detailed bell curve section ---
# Find where to insert (after the updated histogram cell)

new_bell_cells = []

# Section header
new_bell_cells.append({
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## Fat-Tail Bell Curve Deep Dive\n",
        "**Each distribution plotted individually with its theoretical normal (bell) curve.**\n",
        "Areas where the actual bars extend beyond the bell curve = **fat tails** (extreme events happening more often than normal models predict).\n",
        "\n",
        "- **R distribution** is capped by TP/SL, so tails are truncated\n",
        "- **MFE (Max Favorable Excursion)** shows how far price runs in your favor — fat right tail = market regularly runs past your TP\n",
        "- **MAE (Max Adverse Excursion)** shows how far price moves against you — fat right tail = outlier adverse moves"
    ]
})

# Individual detailed plots for R, MFE, MAE
for col, color, fill_color, title, desc in [
    ('R', '#1565C0', '#4FC3F7', 'Trade R Distribution',
     'R is capped by TP/SL. If tails are thin, your exits are working as expected.'),
    ('MaxFavorableR', '#2E7D32', '#66BB6A', 'MFE Distribution (Maximum Favorable Excursion)',
     'Fat right tail = price regularly runs well past your TP. Consider trailing stops or wider TP.'),
    ('MaxAdverseR', '#C62828', '#EF5350', 'MAE Distribution (Maximum Adverse Excursion)',
     'Fat right tail = some trades dip dramatically before resolving. Check if your SL is well-placed.'),
]:
    new_bell_cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            f"if df_trades is not None:\n",
            f"    data = df_trades['{col}'].dropna()\n",
            f"    mu, std = data.mean(), data.std()\n",
            f"    kurt = data.kurtosis()  # excess kurtosis (Fisher)\n",
            f"    skew = data.skew()\n",
            f"\n",
            f"    fig, ax = plt.subplots(figsize=(14, 6))\n",
            f"\n",
            f"    # Histogram\n",
            f"    n, bins, patches = ax.hist(data, bins=50, density=True,\n",
            f"                               color='{fill_color}', edgecolor='white', alpha=0.7,\n",
            f"                               label='Actual Distribution')\n",
            f"\n",
            f"    # Bell curve overlay\n",
            f"    x = np.linspace(data.min() - 1, data.max() + 1, 500)\n",
            f"    bell = norm.pdf(x, mu, std)\n",
            f"    ax.plot(x, bell, color='{color}', linewidth=3, label='Normal Distribution (Bell Curve)')\n",
            f"\n",
            f"    # Fill the area between to highlight fat tails\n",
            f"    ax.fill_between(x, bell, alpha=0.15, color='{color}')\n",
            f"\n",
            f"    # Annotations\n",
            f"    ax.axvline(mu, color='black', linestyle='-', linewidth=1.2, alpha=0.6, label=f'Mean = {{mu:.2f}}')\n",
            f"    ax.axvline(data.median(), color='#FF6F00', linestyle='--', linewidth=1.5, label=f'Median = {{data.median():.2f}}')\n",
            f"\n",
            f"    # Stats box\n",
            f"    stats_text = f'Excess Kurtosis: {{kurt:.2f}}\\nSkewness: {{skew:.2f}}\\n'\n",
            f"    stats_text += f'Fat-Tailed: {{\"YES\" if kurt > 0 else \"NO\"}}'\n",
            f"    ax.text(0.97, 0.95, stats_text, transform=ax.transAxes,\n",
            f"            fontsize=11, verticalalignment='top', horizontalalignment='right',\n",
            f"            bbox=dict(boxstyle='round,pad=0.5', facecolor='white', alpha=0.9, edgecolor='gray'))\n",
            f"\n",
            f"    ax.set_title('{title}', fontsize=15, fontweight='bold')\n",
            f"    ax.set_xlabel('R-multiple', fontsize=12)\n",
            f"    ax.set_ylabel('Density', fontsize=12)\n",
            f"    ax.legend(loc='upper left', fontsize=10)\n",
            f"\n",
            f"    # Subtitle\n",
            f"    ax.text(0.5, -0.12, '{desc}',\n",
            f"            transform=ax.transAxes, fontsize=10, ha='center', style='italic', color='gray')\n",
            f"\n",
            f"    plt.tight_layout()\n",
            f"    plt.show()"
        ]
    })

# Insert new cells right after the updated histogram cell
insert_idx = i + 1  # right after the combined histogram
for j, cell in enumerate(new_bell_cells):
    nb['cells'].insert(insert_idx + j, cell)

with open(NOTEBOOK_PATH, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print(f"Done! Updated 1 cell and added {len(new_bell_cells)} new bell curve cells to {NOTEBOOK_PATH}")
