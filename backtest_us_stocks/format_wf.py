import os
import re

def parse_log(filename, direction):
    if not os.path.exists(filename): return []
    with open(filename, 'r', encoding='utf-16') as f:
        data = f.read()
    
    # We want to find each block:
    # WF VERDICT (B-BTCUSDT): {
    #   windows: 28,
    #   positivePct: 75,
    #   zeroTradePct: 3.571428571428571,
    #   maxConsecLossWindows: 3,
    #   medianWindowExpectancy: '1.24',
    #   overallExpectancy: '0.97',
    #   ACCEPT: true
    # }
    
    results = []
    pattern = r"WF VERDICT \(([^)]+)\):\s*\{([^}]+)\}"
    matches = re.finditer(pattern, data)
    for match in matches:
        pair = match.group(1)
        block = match.group(2)
        
        accept_match = re.search(r"ACCEPT:\s*(true|false)", block)
        accept = accept_match.group(1) if accept_match else "unknown"
        
        pos_pct = re.search(r"positivePct:\s*([0-9.]+)", block)
        pos = float(pos_pct.group(1)) if pos_pct else 0.0
        
        med_exp = re.search(r"medianWindowExpectancy:\s*'([^']+)'", block)
        med = med_exp.group(1) if med_exp else "0.0"
        
        ovr_exp = re.search(r"overallExpectancy:\s*'([^']+)'", block)
        ovr = ovr_exp.group(1) if ovr_exp else "0.0"
        
        results.append({
            "pair": pair,
            "direction": direction,
            "accept": accept,
            "positivePct": pos,
            "medianWindowExpectancy": med,
            "overallExpectancy": ovr
        })
    return results

long_res = parse_log("wf_long.log", "Long")
short_res = parse_log("wf_short.log", "Short")

all_res = long_res + short_res

# Group by pair
pairs = {}
for r in all_res:
    p = r['pair']
    if p not in pairs:
        pairs[p] = {}
    pairs[p][r['direction']] = r

# Write to walkthrough
with open('c:/Users/KIIT/.gemini/antigravity/brain/34f7a2f0-16fb-4d8a-9228-830c213d5fc4/walkthrough.md', 'a', encoding='utf-8') as f:
    f.write("\n\n## Walk-Forward Validation Results\n\n")
    f.write("The walk-forward validation applies a rigorous out-of-sample testing approach to ensure the strategy is robust across different market regimes and isn't just curve-fit to the whole dataset.\n\n")
    f.write("| Pair | Direction | Verdict | Positive Windows | Median Expectancy | Overall Expectancy |\n")
    f.write("| --- | --- | --- | --- | --- | --- |\n")
    
    for p in sorted(pairs.keys()):
        for d in ["Long", "Short"]:
            if d in pairs[p]:
                r = pairs[p][d]
                icon = "✅ Pass" if r['accept'] == 'true' else "❌ Fail"
                f.write(f"| {p} | {d} | {icon} | {r['positivePct']:.1f}% | {r['medianWindowExpectancy']}R | {r['overallExpectancy']}R |\n")
    
print("Walkthrough update complete")
