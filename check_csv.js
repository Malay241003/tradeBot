
import fs from 'fs';

const csvPath = './trades_detailed.csv';
try {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').slice(0, 5);
    console.log("CSV Header:");
    console.log(lines[0]);
    console.log("\nFirst 4 rows:");
    lines.slice(1).forEach(l => console.log(l));
} catch (e) {
    console.error("Error reading CSV:", e);
}
