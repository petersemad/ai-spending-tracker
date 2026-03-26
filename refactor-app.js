import fs from 'fs';

let code = fs.readFileSync('public/app.js', 'utf8');

// 1. GET requests in attemptLogin & fetchData
code = code.replace(
    /fetch\(`\/api\/transactions\?password=\$\{pin\}`\)/g,
    "fetch('/api/transactions', { headers: { 'x-admin-pin': pin } })"
);
code = code.replace(
    /fetch\(`\/api\/(.+?)\?password=\$\{auth\}`\)/g,
    "fetch(`/api/$1`, { headers: { 'x-admin-pin': auth } })"
);

// 2. Add x-admin-pin header to any JSON API request
code = code.replace(
    /headers:\s*\{\s*'Content-Type':\s*'application\/json'\s*\}/g,
    "headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') }"
);

// 3. Strip 'password: auth' and 'password' from bodies
code = code.replace(/password:\s*(?:auth|password)/g, ''); // leaves a trailing comma or orphaned key, need to be careful

// To be safe and surgical with the body strings:
code = code.replace(/ids:\s*Array\.from\(selectedTxIds\)\.map\(Number\),\s*(?:password:\s*)?auth/g, 'ids: Array.from(selectedTxIds).map(Number)');
code = code.replace(/vendor,\s*amount:\s*parseFloat\(amount\)\s*\|\|\s*0,\s*category,\s*currency,\s*(?:password:\s*)?password/g, 'vendor, amount: parseFloat(amount) || 0, category, currency');
code = code.replace(/vendor,\s*(?:password:\s*)?password/g, 'vendor');
code = code.replace(/id,\s*(?:password:\s*)?password/g, 'id');
code = code.replace(/amount,\s*currency,\s*type,\s*vendor,\s*category:\s*finalCategory,\s*(?:password:\s*)?password/g, 'amount, currency, type, vendor, category: finalCategory');
code = code.replace(/category,\s*amount:\s*limit\s*\|\|\s*0,\s*currency,\s*(?:password:\s*)?password/g, 'category, amount: limit || 0, currency');
code = code.replace(/query:\s*query,\s*(?:password:\s*)?auth/g, 'query: query');
code = code.replace(/source_name,\s*amount:\s*parseFloat\(amount\)\s*\|\|\s*0,\s*currency,\s*(?:password:\s*)?password/g, 'source_name, amount: parseFloat(amount) || 0, currency');
code = code.replace(/source_name,\s*(?:password:\s*)?password/g, 'source_name');

fs.writeFileSync('public/app.js', code);
console.log("Refactor complete.");
