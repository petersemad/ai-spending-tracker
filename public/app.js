let allTransactions = [];
let allBudgets = {};
let recurringVendors = {};
let statsChartInstance = null;
let exchangeRates = { USD: 50.0, EUR: 55.0, EGP: 1.0, GBP: 60.0 };
let currentFilteredTransactions = [];
let activeSubs = [];
let incomeSources = [];
let selectedTxIds = new Set();
let txPageSize = 30;
let txCurrentPage = 1;
let searchQuery = '';
let pendingDeleteTimer = null;

// ======= TOAST SYSTEM =======
function showToast(message, type = 'info', duration = 3500, options = {}) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const iconMap = { success: 'ph-check-circle', error: 'ph-warning-circle', warning: 'ph-warning', info: 'ph-info' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let html = `<i class="ph ${iconMap[type] || 'ph-info'}" style="font-size:1.2rem; flex-shrink:0;"></i><span style="flex:1;">${message}</span>`;
    if (options.undoCallback) {
        html += `<button class="toast-undo-btn" onclick="this.dataset.clicked='1'">Undo</button>`;
    }
    toast.innerHTML = html;
    container.appendChild(toast);
    if (options.undoCallback) {
        toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
            options.undoCallback();
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        });
    }
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
    return toast;
}

// ======= THEME TOGGLE =======
function initTheme() {
    const saved = localStorage.getItem('themeMode');
    if (saved === 'light') document.body.classList.add('light-mode');
    updateThemeIcon();
}
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('themeMode', document.body.classList.contains('light-mode') ? 'light' : 'dark');
    updateThemeIcon();
}
function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isLight = document.body.classList.contains('light-mode');
    btn.innerHTML = isLight ? '<i class="ph ph-moon"></i>' : '<i class="ph ph-sun"></i>';
}
initTheme();

window.attemptLogin = async () => {
    const pin = document.getElementById('authPinInput').value;
    if(!pin) return;
    
    const btn = document.getElementById('authLoginBtn');
    const originalBtnHTML = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Verifying Session...';
    
    try {
        const res = await fetch('/api/transactions', { headers: { 'x-admin-pin': pin } });
        if(res.status === 200) {
            sessionStorage.setItem('spendAuth', pin);
            
            // Success Feedback
            btn.classList.add('auth-success-state');
            btn.innerHTML = '<i class="ph ph-lock-key-open"></i> Access Granted';
            const lockIcon = document.querySelector('#loginScreen .ph-lock-key');
            if(lockIcon) {
                lockIcon.classList.remove('ph-lock-key');
                lockIcon.classList.add('ph-lock-key-open');
                lockIcon.style.color = '#34d399';
                lockIcon.style.filter = 'drop-shadow(0 0 16px rgba(52, 211, 153, 0.6))';
            }
            
            // Execute animation sequence natively
            setTimeout(() => {
                document.getElementById('loginScreen').classList.add('login-success-anim');
                
                setTimeout(() => {
                    document.getElementById('loginScreen').style.display = 'none';
                    document.getElementById('loginScreen').classList.remove('login-success-anim');
                    
                    const appWrapper = document.getElementById('appWrapper');
                    appWrapper.style.display = 'block';
                    appWrapper.classList.add('app-reveal-anim');
                    
                    fetchData();
                    
                    setTimeout(() => appWrapper.classList.remove('app-reveal-anim'), 1000);
                }, 500); // Wait for dissolve
            }, 600); // Wait for Success Feedback Readability
            
        } else {
            showToast('Invalid PIN. Dashboard locked.', 'error');
            btn.innerHTML = originalBtnHTML;
        }
    } catch(e) {
        showToast('Network error validating PIN.', 'error');
        btn.innerHTML = originalBtnHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const token = sessionStorage.getItem('spendAuth');
    if(token) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appWrapper').style.display = 'block';
        fetchData();
    } else {
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('appWrapper').style.display = 'none';
    }
});
document.getElementById('refreshBtn').addEventListener('click', () => {
    document.getElementById('refreshBtn').querySelector('i').classList.add('ph-spin');
    fetchData();
    setTimeout(() => {
        document.getElementById('refreshBtn').querySelector('i').classList.remove('ph-spin');
    }, 800);
});

document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

document.getElementById('searchVendor')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    txCurrentPage = 1;
    renderTransactions(currentFilteredTransactions);
});

document.getElementById('selectAllTxsCheckbox')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    currentFilteredTransactions.forEach(tx => {
        const id = String(tx.id);
        if(isChecked) {
            selectedTxIds.add(id);
        } else {
            selectedTxIds.delete(id);
        }
    });
    document.querySelectorAll('.tx-select-checkbox').forEach(cb => {
        cb.checked = isChecked;
    });
    updateBulkDeleteUI();
});

document.getElementById('addBtn')?.addEventListener('click', () => {
    openEditModal(null); // null means "Add New"
});

['filterType', 'filterAccount', 'filterDate', 'customStartDate', 'customEndDate', 'baseCurrency', 'statsCurrency', 'statsChartType', 'statsGroupBy'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
});

document.getElementById('filterDate').addEventListener('change', (e) => {
    document.getElementById('customDateRange').style.display = e.target.value === 'custom' ? 'flex' : 'none';
});

document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    window.promptExportCsv();
});

window.promptExportCsv = () => {
    const existing = document.getElementById('exportModal');
    if (existing) existing.remove();
    
    const countVisible = currentFilteredTransactions.length;
    const countAll = allTransactions.length;
    
    if (countAll === 0 && activeSubs.length === 0) {
        return showToast('No data to export.', 'warning');
    }
    
    const modalHTML = `
        <div class="modal-overlay" onclick="this.remove()" id="exportModal" style="z-index: 10000;">
            <div class="modal-box" onclick="event.stopPropagation()">
                <h3>Export Data</h3>
                <p style="color:var(--text-med); font-size:0.9rem; margin-bottom:1.5rem;">Choose what data you want to export to Excel.</p>
                <div style="display:flex; flex-direction:column; gap:0.75rem;">
                    <button class="btn-glow" style="justify-content:space-between; padding:1rem;" onclick="executeExport('filtered')">
                        <span>Current View (Filtered)</span>
                        <span style="opacity:0.7; font-size:0.8em; background:rgba(255,255,255,0.1); padding:0.2rem 0.5rem; border-radius:12px;">${countVisible} rows</span>
                    </button>
                    <button class="btn-glow" style="justify-content:space-between; padding:1rem; background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1);" onclick="executeExport('all')">
                        <span style="color:var(--text-med);">Entire Database</span>
                        <span style="color:var(--text-med); opacity:0.7; font-size:0.8em; background:rgba(255,255,255,0.05); padding:0.2rem 0.5rem; border-radius:12px;">${countAll} rows</span>
                    </button>
                </div>
                <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button class="modal-btn cancel" style="width:100%; margin:0;" onclick="document.getElementById('exportModal').remove()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

window.executeExport = (type) => {
    const txs = type === 'filtered' && currentFilteredTransactions.length > 0 ? currentFilteredTransactions : allTransactions;
    if (txs.length === 0 && activeSubs.length === 0) return showToast('No data to export.', 'warning');
    
    const m = document.getElementById('exportModal');
    if (m) m.remove();

    try {
        if (typeof XLSX === 'undefined') {
            return showToast("Export library is still loading. Please try again in a moment.", 'warning');
        }
        
        const wb = XLSX.utils.book_new();
        
        if (txs.length > 0) {
            const txData = txs.map(t => ({
                ID: t.id,
                Date: t.date ? new Date(t.date).toISOString() : '',
                Vendor: t.vendor || '',
                Category: t.category || '',
                Type: t.type,
                Amount: t.amount,
                Currency: t.currency || 'EGP',
                'Raw SMS': t.raw_text || ''
            }));
            const txSheet = XLSX.utils.json_to_sheet(txData);
            XLSX.utils.book_append_sheet(wb, txSheet, "Transactions");
        }
        
        if (activeSubs.length > 0) {
            const subData = activeSubs.map(s => ({
                Vendor: s.vendor,
                Category: s.category || '',
                'Monthly Avg Amount': s.avgAmount,
                'Base Config Amount': s.baseAmt,
                Currency: s.currency || 'EGP',
                'Detected Count': s.count
            }));
            const subSheet = XLSX.utils.json_to_sheet(subData);
            XLSX.utils.book_append_sheet(wb, subSheet, "Subscriptions");
        }
        
        XLSX.writeFile(wb, "AI_Spending_Tracker_Export.xlsx");
        showToast('Export successful!', 'success');
    } catch (e) {
        console.error("Export failed:", e);
        showToast("Failed to export Excel file.", 'error');
    }
};

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        
        const target = document.getElementById('tab-' + btn.dataset.tab);
        target.classList.add('active');
        
        // Add skeleton loading
        target.classList.add('tab-loading');
        setTimeout(() => target.classList.remove('tab-loading'), 350);
    });
});

async function fetchData() {
    const auth = sessionStorage.getItem('spendAuth');
    if(!auth) return;
    try {
        const erPromise = fetch('https://open.er-api.com/v6/latest/USD')
            .then(r => r.json())
            .then(data => { 
                if(data?.rates?.EGP) exchangeRates.USD = data.rates.EGP;
                if(data?.rates?.EGP && data?.rates?.EUR) exchangeRates.EUR = data.rates.EGP / data.rates.EUR;
                if(data?.rates?.EGP && data?.rates?.GBP) exchangeRates.GBP = data.rates.EGP / data.rates.GBP;
            })
            .catch(e => console.warn('Exchange API failed.', e));

        const txResponse = fetch(`/api/transactions`, { headers: { 'x-admin-pin': auth } }).then(r => r.json());
        const rawResponse = fetch(`/api/budgets`, { headers: { 'x-admin-pin': auth } }).then(r => r.json().catch(e => ({})));
        const recResponse = fetch(`/api/recurring`, { headers: { 'x-admin-pin': auth } }).then(r => r.json().catch(e => ({})));
        const incResponse = fetch(`/api/income`, { headers: { 'x-admin-pin': auth } }).then(r => r.json().catch(e => ({})));
        
        const [data, budgetData, recurringData, incomeData] = await Promise.all([txResponse, rawResponse, recResponse, incResponse]);
        
        await erPromise;
        
        if (data.transactions) {
            allTransactions = data.transactions;
            if (budgetData?.budgets) {
                budgetData.budgets.forEach(b => {
                    allBudgets[b.category] = { amount: parseFloat(b.amount), currency: b.currency };
                });
            }
            if (recurringData?.vendors) {
                recurringVendors = {};
                recurringData.vendors.forEach(v => {
                    recurringVendors[v.vendor] = {
                        amount: parseFloat(v.amount) || 0,
                        category: v.category || 'Subscription',
                        currency: v.currency || 'EGP'
                    };
                });
            }
            if (incomeData?.income_sources) {
                incomeSources = incomeData.income_sources;
            }
            applyFilters();
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('transactionsList').innerHTML = `
            <div class="loading-state">
                <i class="ph ph-warning-circle" style="font-size: 2rem; color: var(--money-out); margin-bottom: 1rem;"></i>
                <p>Failed to connect to the backend server.</p>
            </div>
        `;
    }
}

function applyFilters() {
    const type = document.getElementById('filterType').value;
    const account = document.getElementById('filterAccount').value;
    const dateFilter = document.getElementById('filterDate').value;
    
    let filtered = allTransactions.filter(tx => {
        if (type !== 'all' && tx.type !== type) return false;
        
        if (account !== 'all') {
            const raw = (tx.raw_text || '').toLowerCase();
            const categoryStr = (tx.category || '').toLowerCase();
            const isCredit = raw.includes('credit') || categoryStr.includes('credit');
            
            if (account === 'Credit' && !isCredit) return false;
            if (account === 'Debit' && isCredit) return false; 
        }
        
        const txDate = new Date(tx.date);
        const now = new Date();
        
        if (dateFilter === 'this_month') {
            if (txDate.getMonth() !== now.getMonth() || txDate.getFullYear() !== now.getFullYear()) return false;
        } else if (dateFilter === 'last_month') {
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            if (txDate.getMonth() !== lastMonth.getMonth() || txDate.getFullYear() !== lastMonth.getFullYear()) return false;
        } else if (dateFilter === 'this_year') {
            if (txDate.getFullYear() !== now.getFullYear()) return false;
        } else if (dateFilter === 'last_year') {
            if (txDate.getFullYear() !== now.getFullYear() - 1) return false;
        } else if (dateFilter.startsWith('last_')) {
            const days = parseInt(dateFilter.split('_')[1]);
            if (!isNaN(days)) {
                const pastDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
                pastDate.setHours(0,0,0,0);
                if (txDate < pastDate || txDate > now) return false;
            }
        } else if (dateFilter === 'custom') {
            const startStr = document.getElementById('customStartDate').value;
            const endStr = document.getElementById('customEndDate').value;
            
            if (startStr) {
                const start = new Date(startStr);
                start.setHours(0,0,0,0);
                if (txDate < start) return false;
            }
            if (endStr) {
                const end = new Date(endStr);
                end.setHours(23,59,59,999);
                if (txDate > end) return false;
            }
        }
        
        return true;
    });

    currentFilteredTransactions = filtered;
    selectedTxIds.clear();
    txCurrentPage = 1;
    renderDashboard(filtered);
    renderTransactions(filtered);
    renderSubscriptions(filtered);
    renderCategories(filtered);
    renderStatistics(filtered);
    renderIncome(filtered);
    renderInsights(filtered);
    updateBulkDeleteUI();
    checkBudgetAlerts(filtered);
}

function formatCcy(amount, currency) {
    const defaultCcy = currency || 'EGP';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: defaultCcy,
        minimumFractionDigits: 2
    }).format(amount);
}

function renderDashboard(transactions) {
    let totals = {
        EGP: { in: 0, out: 0 },
        USD: { in: 0, out: 0 },
        EUR: { in: 0, out: 0 },
        GBP: { in: 0, out: 0 }
    };

    transactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        const ccy = tx.currency || 'EGP';
        
        if (!totals[ccy]) totals[ccy] = { in: 0, out: 0 };
        
        if (tx.type === 'In') {
            totals[ccy].in += amount;
        } else {
            totals[ccy].out += amount;
        }
    });

    const baseCcy = document.getElementById('baseCurrency')?.value || 'EGP';
    const baseRateEgp = exchangeRates[baseCcy] || 1.0;

    const unifiedIn = Object.keys(totals).reduce((sum, ccy) => sum + (totals[ccy].in * (exchangeRates[ccy] || 1.0)), 0) / baseRateEgp;
    const unifiedOut = Object.keys(totals).reduce((sum, ccy) => sum + (totals[ccy].out * (exchangeRates[ccy] || 1.0)), 0) / baseRateEgp;
    const netEGPUnified = unifiedOut - unifiedIn;
    
    const buildUnifiedHTML = (unifiedVal, egpVal, usdVal, eurVal, gbpVal, gradientClass) => {
        let text = `<span class="${gradientClass}">${formatCcy(unifiedVal, baseCcy)}</span>`;
        
        let subText = [];
        if (Math.abs(egpVal) > 0.01) subText.push(formatCcy(egpVal, 'EGP'));
        if (Math.abs(usdVal) > 0.01) subText.push(formatCcy(usdVal, 'USD'));
        if (Math.abs(eurVal) > 0.01) subText.push(formatCcy(eurVal, 'EUR'));
        if (Math.abs(gbpVal) > 0.01) subText.push(formatCcy(gbpVal, 'GBP'));
        
        if (subText.length > 1 || (subText.length === 1 && Math.abs(subText[0].includes(baseCcy) ? 0 : 1) > 0)) {
            text += `<br><span style="font-size: 0.70em; opacity: 0.8; font-weight: 500; display: block; margin-top: 0.35rem; color: var(--text-med);">${subText.join(' • ')}</span>`;
        }
        return text;
    };

    const duration = 800;
    const animateMetric = (elId, finalVals, gradClass) => {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            
            const currentUnified = easeOutQuart * finalVals.un;
            const currentEgp = easeOutQuart * finalVals.egp;
            const currentUsd = easeOutQuart * finalVals.usd;
            const currentEur = easeOutQuart * finalVals.eur;
            const currentGbp = easeOutQuart * finalVals.gbp;
            
            document.getElementById(elId).innerHTML = buildUnifiedHTML(currentUnified, currentEgp, currentUsd, currentEur, currentGbp, gradClass);
            
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    };

    animateMetric('netSpent', { un: netEGPUnified, egp: totals.EGP.out - totals.EGP.in, usd: totals.USD.out - totals.USD.in, eur: totals.EUR.out - totals.EUR.in, gbp: totals.GBP.out - totals.GBP.in }, 'text-gradient');
    animateMetric('totalIncome', { un: unifiedIn, egp: totals.EGP.in, usd: totals.USD.in, eur: totals.EUR.in, gbp: totals.GBP.in }, 'text-gradient-green');
    animateMetric('totalOut', { un: unifiedOut, egp: totals.EGP.out, usd: totals.USD.out, eur: totals.EUR.out, gbp: totals.GBP.out }, 'text-gradient-red');
}

function getCategoryIcon(cat) {
    if (!cat) return { icon: 'ph-receipt', class: 'cat-other' };
    
    const cleanCat = cat.replace(/\s*\((Credit|Debit)\)/i, '').trim();
    const overrides = JSON.parse(localStorage.getItem('categoryUIOverrides') || '{}');
    if (overrides[cleanCat]) {
        return overrides[cleanCat];
    }
    
    const c = cat.toLowerCase();
    
    if (c.includes('food') || c.includes('drink') || c.includes('restaurant') || c.includes('cafe') || c.includes('mcdonald')) return { icon: 'ph-hamburger', class: 'cat-food' };
    if (c.includes('grocer') || c.includes('market') || c.includes('carrefour') || c.includes('seoudi')) return { icon: 'ph-shopping-cart', class: 'cat-groceries' };
    if (c.includes('transport') || c.includes('uber') || c.includes('careem') || c.includes('fuel')) return { icon: 'ph-car', class: 'cat-transport' };
    if (c.includes('shop') || c.includes('amazon') || c.includes('noon') || c.includes('zara')) return { icon: 'ph-bag', class: 'cat-shopping' };
    if (c.includes('entertain') || c.includes('netflix') || c.includes('spotify') || c.includes('cinema')) return { icon: 'ph-film-strip', class: 'cat-entertainment' };
    if (c.includes('health') || c.includes('pharmacy') || c.includes('hospital') || c.includes('clinic')) return { icon: 'ph-heartbeat', class: 'cat-health' };
    if (c.includes('util') || c.includes('vodafone') || c.includes('electric') || c.includes('orange')) return { icon: 'ph-plug', class: 'cat-utilities' };
    if (c.includes('educat') || c.includes('school') || c.includes('udemy') || c.includes('course')) return { icon: 'ph-graduation-cap', class: 'cat-education' };
    if (c.includes('transfer') || c.includes('send') || c.includes('receive')) return { icon: 'ph-arrows-left-right', class: 'cat-transfer' };
    if (c.includes('atm') || c.includes('cash') || c.includes('withdraw')) return { icon: 'ph-money', class: 'cat-atm' };
    if (c.includes('subscript') || c.includes('recur')) return { icon: 'ph-calendar-blank', class: 'cat-subscription' };
    if (c.includes('refund') || c.includes('revers')) return { icon: 'ph-arrow-u-down-left', class: 'cat-refund' };
    
    return { icon: 'ph-receipt', class: 'cat-other' };
}

function detectDuplicates(transactions) {
    const dupes = new Set();
    for (let i = 0; i < transactions.length; i++) {
        for (let j = i + 1; j < transactions.length; j++) {
            const a = transactions[i], b = transactions[j];
            if (a.vendor === b.vendor && parseFloat(a.amount) === parseFloat(b.amount) && a.type === b.type) {
                const timeDiff = Math.abs(new Date(a.date) - new Date(b.date)) / 60000;
                if (timeDiff < 30) {
                    dupes.add(a.id);
                    dupes.add(b.id);
                }
            }
        }
    }
    return dupes;
}

function renderTransactions(transactions) {
    const list = document.getElementById('transactionsList');
    
    // Apply search filter
    let filtered = transactions;
    if (searchQuery) {
        filtered = transactions.filter(tx => 
            (tx.vendor || '').toLowerCase().includes(searchQuery) ||
            (tx.category || '').toLowerCase().includes(searchQuery)
        );
    }
    
    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="loading-state">
                <i class="ph ph-receipt empty-state-icon"></i>
                <p style="font-size:1rem; margin-bottom:0.25rem;">${searchQuery ? 'No matches found' : 'No transactions yet'}</p>
                <p style="font-size:0.85rem; opacity:0.6;">${searchQuery ? 'Try a different search term' : 'Transactions will appear as SMS messages arrive'}</p>
            </div>
        `;
        return;
    }
    
    const duplicateIds = detectDuplicates(filtered);
    
    // Pagination
    const totalPages = Math.ceil(filtered.length / txPageSize);
    const visibleTxs = filtered.slice(0, txCurrentPage * txPageSize);
    const hasMore = filtered.length > visibleTxs.length;

    list.innerHTML = '';

    visibleTxs.forEach(tx => {
        const isIn = tx.type === 'In';
        const amountClass = isIn ? 'text-gradient-green' : 'text-gradient-red';
        const prefix = isIn ? '+' : '-';
        
        const dateObj = new Date(tx.date);
        const dateStr = isNaN(dateObj.getTime()) ? tx.date : dateObj.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
        });

        const safeVendor = (tx.vendor || '').replace(/'/g, "\\'");
        const isRecurring = Object.keys(recurringVendors).includes(tx.vendor);
        const recurringIconStyle = isRecurring ? 'color: var(--money-in); text-shadow: 0 0 10px rgba(52,211,153,0.5);' : '';
        const catMap = getCategoryIcon(tx.category);
        const isDupe = duplicateIds.has(tx.id);

        const txHTML = `
            <div class="transaction-item" data-tx-id="${tx.id}">
                <div class="tx-content" style="display: flex; width: 100%; justify-content: space-between; align-items: center;">
                    <div class="tx-left" style="display: flex; align-items: center; gap: 1rem;">
                        <input type="checkbox" class="tx-select-checkbox" data-id="${tx.id}" ${selectedTxIds.has(String(tx.id)) ? 'checked' : ''} onchange="toggleTxSelection('${tx.id}')">
                        <div class="tx-icon ${catMap.class}">
                            <i class="ph ${catMap.icon}"></i>
                        </div>
                        <div class="tx-details">
                            <h4>${tx.vendor || 'Unknown Vendor'}</h4>
                            <p>
                                <span class="tx-badge">${tx.category || 'Uncategorized'}</span>
                                ${isDupe ? '<span class="tx-duplicate-badge">Possible Dupe</span>' : ''}
                                • 
                                ${dateStr}
                            </p>
                        </div>
                    </div>
                    <div class="tx-bottom-mobile" style="display: flex; align-items: center; justify-content: flex-end; gap: 1rem;">
                        <div class="tx-right">
                            <div class="tx-amount ${amountClass}" style="text-align: right;">
                                ${prefix} ${formatCcy(tx.amount || 0, tx.currency || 'EGP')}
                            </div>
                        </div>
                        <div class="tx-actions" style="display: flex; gap: 0.35rem;">
                            <button class="action-btn" onclick="toggleRecurring('${safeVendor}')" title="Mark as Subscription" style="${recurringIconStyle}">
                                <i class="ph ph-arrows-clockwise"></i>
                            </button>
                            <button class="action-btn edit-btn" onclick="openEditModal(${tx.id})" title="Edit">
                                <i class="ph ph-pencil-simple"></i>
                            </button>
                            <button class="action-btn delete-btn" onclick="deleteTransaction(${tx.id})" title="Delete">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <details class="sms-expand" style="width: 100%;">
                    <summary><i class="ph ph-chat-text" style="vertical-align: middle; margin-right: 4px;"></i> View Raw SMS Data</summary>
                    <div style="padding-top: 0.25rem;">${tx.raw_text || 'Raw SMS not available.'}</div>
                </details>
            </div>
        `;
        
        list.insertAdjacentHTML('beforeend', txHTML);
    });
    
    // Load More button
    if (hasMore) {
        list.insertAdjacentHTML('beforeend', `
            <button class="load-more-btn" onclick="loadMoreTransactions()">
                <i class="ph ph-caret-down"></i>
                Show more (${filtered.length - visibleTxs.length} remaining)
            </button>
        `);
    }
    
    // Mobile swipe-to-delete
    initSwipeToDelete();
}

window.loadMoreTransactions = () => {
    txCurrentPage++;
    renderTransactions(currentFilteredTransactions);
};

window.toggleTxSelection = (id) => {
    id = String(id);
    if(selectedTxIds.has(id)) {
        selectedTxIds.delete(id);
    } else {
        selectedTxIds.add(id);
    }
    updateBulkDeleteUI();
};

window.bulkDeleteTransactions = async () => {
    if(selectedTxIds.size === 0) return;
    if(!confirm(`Are you sure you want to delete ${selectedTxIds.size} transaction(s)?`)) return;
    
    const auth = sessionStorage.getItem('spendAuth');
    if(!auth) return;
    
    const btn = document.getElementById('bulkDeleteBtn');
    const originalBtn = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
    
    try {
        const res = await fetch('/api/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
            body: JSON.stringify({ ids: Array.from(selectedTxIds).map(Number),  })
        });
        
        if (res.ok) {
            const count = selectedTxIds.size;
            selectedTxIds.clear();
            updateBulkDeleteUI();
            fetchData();
            showToast(`${count} transaction(s) deleted`, 'success');
        } else {
            showToast('Failed to delete transactions.', 'error');
            btn.innerHTML = originalBtn;
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
        btn.innerHTML = originalBtn;
    }
};

function updateBulkDeleteUI() {
    const btn = document.getElementById('bulkDeleteBtn');
    const countSpan = document.getElementById('bulkDeleteCount');
    const selectAllCheck = document.getElementById('selectAllTxsCheckbox');
    if (!btn || !countSpan || !selectAllCheck) return;
    
    if(selectedTxIds.size > 0) {
        btn.style.display = 'inline-flex';
        countSpan.textContent = `Delete (${selectedTxIds.size})`;
    } else {
        btn.style.display = 'none';
        countSpan.textContent = 'Delete';
    }
    
    if (currentFilteredTransactions.length > 0) {
        const allVisibleSelected = currentFilteredTransactions.every(tx => selectedTxIds.has(String(tx.id)));
        selectAllCheck.checked = allVisibleSelected;
    } else {
        selectAllCheck.checked = false;
    }
}

function renderSubscriptions(transactions) {
    const list = document.getElementById('subscriptionsList');
    if (!list) return;

    // Detect recurring by grouping by vendor for 'Out' transactions
    const vendorMap = {};
    transactions.filter(tx => tx.type === 'Out').forEach(tx => {
        const vendor = (tx.vendor || 'Unknown').trim();
        const cat = (tx.category || '').toLowerCase();
        
        if (!vendorMap[vendor]) vendorMap[vendor] = { amounts: [], dates: [], cat: tx.category };
        
        const amt = parseFloat(tx.amount) || 0;
        let unifiedAmt = amt * (exchangeRates[tx.currency || 'EGP'] || 1.0);
        
        vendorMap[vendor].amounts.push(unifiedAmt);
        if (tx.date) vendorMap[vendor].dates.push(new Date(tx.date));
    });    activeSubs = [];
    let monthlyBurn = 0;

    Object.keys(recurringVendors).forEach(v => {
        const dbSub = recurringVendors[v];
        
        let avg = 0;
        let count = 0;
        
        // If DB has an explicit amount recorded > 0, use it mathematically as source of truth
        if (dbSub.amount > 0) {
            avg = dbSub.amount * (exchangeRates[dbSub.currency || 'EGP'] || 1.0);
            count = vendorMap[v] ? vendorMap[v].amounts.length : 0;
        } else if (vendorMap[v]) {
            // Otherwise, dynamically compute the mathematical average from actual chronological history
            avg = vendorMap[v].amounts.reduce((a,b) => a+b, 0) / vendorMap[v].amounts.length;
            count = vendorMap[v].amounts.length;
        }
        
        const cat = dbSub.category !== 'Subscription' && dbSub.category ? dbSub.category : (vendorMap[v] ? vendorMap[v].cat : 'Manual Addition');
        
        activeSubs.push({ vendor: v, avgAmount: avg, count: count, category: cat, currency: dbSub.currency || 'EGP', baseAmt: dbSub.amount || 0 });
        monthlyBurn += avg;
    });

    activeSubs.sort((a,b) => b.avgAmount - a.avgAmount);

    const baseCcy = document.getElementById('baseCurrency')?.value || 'EGP';
    const baseRateEgp = exchangeRates[baseCcy] || 1.0;

    document.getElementById('burnRate').innerHTML = formatCcy(monthlyBurn / baseRateEgp, baseCcy) + `<div style="font-size:0.55em; color:var(--text-med); font-weight:normal; letter-spacing:0.02em;">UNIFIED TOTAL</div>`;

    if (activeSubs.length === 0) {
        list.innerHTML = `<div class="loading-state"><i class="ph ph-calendar-blank empty-state-icon"></i><p style="font-size:1rem;">No recurring subscriptions detected</p><p style="font-size:0.85rem; opacity:0.6;">Mark vendors as recurring from the Transactions tab</p></div>`;
        return;
    }

    let html = '';
    activeSubs.forEach(sub => {
        const safeVendor = sub.vendor.replace(/'/g, "\\'");
        const catMap = getCategoryIcon(sub.category);
        
        const unifiedAvgBase = sub.avgAmount / baseRateEgp;
        const isForeignToDisplay = (sub.currency !== baseCcy) && (sub.baseAmt > 0);
        const originalStr = isForeignToDisplay ? `≈ ${formatCcy(sub.baseAmt, sub.currency)} • ` : '';

        html += `
            <div class="transaction-item sub-item">
                <div class="tx-content" style="display: flex; width: 100%; justify-content: space-between; align-items: center;">
                    <div class="tx-left" style="flex:1;">
                        <div class="tx-icon ${catMap.class}"><i class="ph ${catMap.icon}"></i></div>
                        <div class="tx-details">
                            <h4>${sub.vendor}</h4>
                            <p><span class="tx-badge">${sub.category}</span> • Seen ${sub.count} times</p>
                        </div>
                    </div>
                    <div class="tx-bottom-mobile" style="display: flex; align-items: center; justify-content: flex-end; gap: 1rem;">
                        <div class="tx-right text-right">
                            <div class="tx-amount text-gradient-red">${sub.avgAmount > 0 ? formatCcy(unifiedAvgBase, baseCcy) : formatCcy(0, baseCcy)}</div>
                            <span style="font-size:0.7em; color:var(--text-med); display:block;">${originalStr}/mo avg</span>
                        </div>
                        <div class="tx-actions" style="display: flex; gap: 0.35rem;">
                            <button class="action-btn edit-btn" onclick="openSubscriptionModal('${safeVendor}', '${sub.baseAmt}', '${sub.category}', '${sub.currency}')" title="Edit details">
                                <i class="ph ph-pencil-simple"></i>
                            </button>
                            <button class="action-btn delete-btn" onclick="toggleRecurring('${safeVendor}', false, true)" title="Remove Subscription">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

function renderCategories(transactions) {
    const container = document.getElementById('categoriesList');
    const baseCcy = document.getElementById('baseCurrency')?.value || 'EGP';
    const baseRateEgp = exchangeRates[baseCcy] || 1.0;
    
    // Group strictly by base category and natively unify math into active baseCcy
    const categoryMap = {};
    let grandUnifiedTotal = 0;
    const catOptions = new Set();
    
    transactions.forEach(tx => {
        const amt = parseFloat(tx.amount) || 0;
        const signedAmt = tx.type === 'Out' ? amt : -amt;
        const unifiedSignedAmt = (signedAmt * (exchangeRates[tx.currency || 'EGP'] || 1.0)) / baseRateEgp;
        
        const baseCategory = (tx.category || 'Other').replace(/\s*\((Credit|Debit)\)/i, '').trim();
        catOptions.add(baseCategory);
        
        if (!categoryMap[baseCategory]) {
            categoryMap[baseCategory] = { cat: baseCategory, amount: 0 };
        }
        categoryMap[baseCategory].amount += unifiedSignedAmt;
    });
    
    // Wipe out categories that perfectly offset (amount <= 0.01)
    const validMap = Object.values(categoryMap).filter(item => item.amount > 0.01);
    
    validMap.forEach(item => {
        grandUnifiedTotal += item.amount;
    });
    
    // Repopulate statistics category filter dynamically
    const statsFilterObj = document.getElementById('statsCategoryFilter');
    if (statsFilterObj) {
        const currFilterVal = statsFilterObj.value;
        let opts = `<option value="all">All Categories</option>`;
        Array.from(catOptions).sort().forEach(cat => opts += `<option value="${cat}">${cat}</option>`);
        statsFilterObj.innerHTML = opts;
        statsFilterObj.value = Array.from(catOptions).includes(currFilterVal) ? currFilterVal : 'all';
    }
    
    if (validMap.length === 0) {
        container.innerHTML = `
            <div class="loading-state">
                <i class="ph ph-chart-pie-slice empty-state-icon"></i>
                <p style="font-size:1rem;">No net spending data to categorize</p>
                <p style="font-size:0.85rem; opacity:0.6;">Spending breakdowns will appear as transactions come in</p>
            </div>
        `;
        return;
    }
    
    const sorted = validMap.sort((a, b) => b.amount - a.amount);
    const colors = ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9', '#94a3b8', '#f472b6', '#60a5fa', '#4ade80'];
    
    let html = '';
    sorted.forEach((item, i) => {
        let color = colors[i % colors.length];
        const catBudget = allBudgets[item.cat];
        let defaultPct = grandUnifiedTotal > 0 ? ((item.amount / grandUnifiedTotal) * 100) : 0;
        let pct = defaultPct.toFixed(1);
        
        let limitText = '';
        let isOverBudget = false;

        if (catBudget) {
            const budgetAmt = parseFloat(catBudget.amount) || 0;
            if (budgetAmt > 0) {
                const unifiedBudgetLimit = (budgetAmt * (exchangeRates[catBudget.currency || 'EGP'] || 1.0)) / baseRateEgp;
                
                pct = Math.min(100, (item.amount / unifiedBudgetLimit) * 100).toFixed(1);
                isOverBudget = item.amount > unifiedBudgetLimit;
                // Keep the visual limit exactly as requested by user in their specific budget currency config
                limitText = `<span style="font-size: 0.7em; opacity: 0.7;"> / ${formatCcy(budgetAmt, catBudget.currency)}</span>`;
                if (isOverBudget) color = '#ef4444';
            }
        }
        
        html += `
            <div class="category-item" style="cursor: pointer;" onclick="openBudgetModal('${item.cat}', '${catBudget ? catBudget.amount : ''}', '${catBudget ? catBudget.currency : baseCcy}')" title="Tap to set monthly limit">
                <div class="category-bar-bg">
                    <div class="category-bar" style="width: ${pct}%; background: ${color};"></div>
                </div>
                <div class="category-info">
                    <div class="category-left">
                        <div class="category-dot" style="background: ${color};"></div>
                        <span class="category-name">${item.cat} ${isOverBudget ? '⚠️' : ''}</span>
                    </div>
                    <div class="category-right">
                        <span class="category-amount">${formatCcy(item.amount, baseCcy)}${limitText}</span>
                        <span class="category-pct">${pct}%</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderStatistics(transactions) {
    const canvas = document.getElementById('statsChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const currency = document.getElementById('statsCurrency')?.value || 'EGP';
    const dateFilter = document.getElementById('filterDate').value;
    const catFilter = document.getElementById('statsCategoryFilter')?.value || 'all';

    const baseCcy = document.getElementById('statsCurrency')?.value || 'EGP';
    const baseRateEgp = exchangeRates[baseCcy] || 1.0;

    let currencyTxs = transactions;
    if (catFilter !== 'all') {
        currencyTxs = currencyTxs.filter(tx => {
            const baseCategory = (tx.category || 'Other').replace(/\s*\((Credit|Debit)\)/i, '').trim();
            return baseCategory === catFilter;
        });
    }

    const userGroupBy = document.getElementById('statsGroupBy')?.value || 'auto';
    const chartType = document.getElementById('statsChartType')?.value || 'bar';
    const isLine = chartType === 'line';

    let groupBy = 'Day';
    if (userGroupBy !== 'auto') {
        groupBy = userGroupBy;
    } else {
        if (['all', 'this_year', 'last_year'].includes(dateFilter)) {
            groupBy = 'Month';
        } else if (dateFilter === 'custom') {
            const startStr = document.getElementById('customStartDate').value;
            const endStr = document.getElementById('customEndDate').value;
            if (startStr && endStr) {
                const daysDiff = (new Date(endStr) - new Date(startStr)) / (1000 * 60 * 60 * 24);
                if (daysDiff > 45) groupBy = 'Month';
            }
        }
    }

    const grouped = {};
    currencyTxs.forEach(tx => {
        const dateObj = new Date(tx.date);
        let key = '';
        let sortTime = 0;
        
        if (groupBy === 'Month') {
            sortTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getTime();
            const yearStr = dateObj.getFullYear() !== new Date().getFullYear() ? ` ${dateObj.getFullYear()}` : '';
            key = dateObj.toLocaleString('en-US', { month: 'short' }) + yearStr;
        } else if (groupBy === 'Week') {
            const d = new Date(dateObj);
            const day = d.getDay() || 7;  // 1=Mon, 7=Sun
            d.setHours(0,0,0,0);
            d.setDate(d.getDate() - day + 1); // Monday
            sortTime = d.getTime();
            key = `Week of ${d.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;
        } else {
            sortTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
            key = dateObj.toLocaleString('en-US', { month: 'short', day: 'numeric' });
        }
        
        if (!grouped[key]) {
            grouped[key] = { timestamp: sortTime, in: 0, out: 0 };
        }
        
        const rawAmount = parseFloat(tx.amount) || 0;
        const unifiedAmount = (rawAmount * (exchangeRates[tx.currency || 'EGP'] || 1.0)) / baseRateEgp;
        
        if (tx.type === 'In') {
            grouped[key].in += unifiedAmount;
        } else {
            grouped[key].out += unifiedAmount;
        }
    });

    const sortedKeys = Object.keys(grouped).sort((a, b) => grouped[a].timestamp - grouped[b].timestamp);
    const labels = sortedKeys;
    const dataIn = sortedKeys.map(k => grouped[k].in);
    const dataOut = sortedKeys.map(k => grouped[k].out);

    if (statsChartInstance) {
        statsChartInstance.destroy();
    }

    try {
        Chart.defaults.color = '#fff';
        Chart.defaults.font.family = 'Outfit';
        
        const gradientIn = ctx.createLinearGradient(0, 0, 0, 400);
        gradientIn.addColorStop(0, 'rgba(52, 211, 153, 0.4)');
        gradientIn.addColorStop(1, 'rgba(52, 211, 153, 0.0)');
        
        const gradientOut = ctx.createLinearGradient(0, 0, 0, 400);
        gradientOut.addColorStop(0, 'rgba(248, 113, 113, 0.4)');
        gradientOut.addColorStop(1, 'rgba(248, 113, 113, 0.0)');

        const gradientInBar = ctx.createLinearGradient(0, 0, 0, 400);
        gradientInBar.addColorStop(0, 'rgba(52, 211, 153, 0.95)');
        gradientInBar.addColorStop(1, 'rgba(5, 150, 105, 0.6)');
        
        const gradientOutBar = ctx.createLinearGradient(0, 0, 0, 400);
        gradientOutBar.addColorStop(0, 'rgba(248, 113, 113, 0.95)');
        gradientOutBar.addColorStop(1, 'rgba(225, 29, 72, 0.6)');

        statsChartInstance = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Money In',
                        data: dataIn,
                        backgroundColor: isLine ? gradientIn : gradientInBar,
                        borderColor: isLine ? 'rgba(52, 211, 153, 1)' : 'transparent',
                        borderWidth: isLine ? 4 : 0,
                        tension: 0.4,
                        fill: isLine,
                        borderRadius: isLine ? 0 : 16,
                        barPercentage: 0.65,
                        categoryPercentage: 0.8,
                        pointBackgroundColor: isLine ? '#101116' : 'transparent',
                        pointBorderColor: isLine ? 'rgba(52, 211, 153, 1)' : 'transparent',
                        pointBorderWidth: 3,
                        pointRadius: isLine ? 5 : 0,
                        pointHoverRadius: isLine ? 8 : 0,
                        hoverBackgroundColor: 'rgba(52, 211, 153, 1)'
                    },
                    {
                        label: 'Money Out',
                        data: dataOut,
                        backgroundColor: isLine ? gradientOut : gradientOutBar,
                        borderColor: isLine ? 'rgba(248, 113, 113, 1)' : 'transparent',
                        borderWidth: isLine ? 4 : 0,
                        tension: 0.4,
                        fill: isLine,
                        borderRadius: isLine ? 0 : 16,
                        barPercentage: 0.65,
                        categoryPercentage: 0.8,
                        pointBackgroundColor: isLine ? '#101116' : 'transparent',
                        pointBorderColor: isLine ? 'rgba(248, 113, 113, 1)' : 'transparent',
                        pointBorderWidth: 3,
                        pointRadius: isLine ? 5 : 0,
                        pointHoverRadius: isLine ? 8 : 0,
                        hoverBackgroundColor: 'rgba(248, 113, 113, 1)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [5, 5] },
                        border: { display: false }
                    },
                    x: { 
                        grid: { display: false },
                        border: { display: false }
                    }
                },
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 20 } },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: 'rgba(255,255,255,0.7)',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        usePointStyle: true,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) {
                                    label += formatCcy(context.parsed.y, currency);
                                }
                                return label;
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    } catch(e) {
        console.warn("Chart.js failed to render or was not loaded yet.");
    }
}

window.promptAddSubscription = () => {
    openSubscriptionModal();
};

window.openSubscriptionModal = (vendor = '', amount = '', category = '', currency = 'EGP') => {
    const existing = document.getElementById('subModal');
    if (existing) existing.remove();
    
    const isEdit = vendor !== '';
    const title = isEdit ? 'Edit Subscription' : 'Add Subscription';
    
    const modal = document.createElement('div');
    modal.id = 'subModal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="window.closeSubModal()">
            <div class="modal-box" onclick="event.stopPropagation()">
                <h3>${title}</h3>
                <div style="margin-bottom: 0.75rem;">
                    <label>Vendor / Merchant Name</label>
                    <input type="text" id="subVendor" class="glass-input" value="${vendor}" ${isEdit ? 'disabled style="opacity:0.6"' : ''} placeholder="e.g. Netflix">
                </div>
                <div style="margin-bottom: 0.75rem;">
                    <label>Monthly Amount (0 to compute automatically)</label>
                    <div style="display:flex; gap:0.5rem;">
                        <input type="number" id="subAmount" class="glass-input" value="${amount}" placeholder="e.g. 500">
                        <select id="subCcy" class="glass-select" style="width: 80px;">
                            <option value="EGP" ${currency === 'EGP' ? 'selected' : ''}>EGP</option>
                            <option value="USD" ${currency === 'USD' ? 'selected' : ''}>USD</option>
                        </select>
                    </div>
                </div>
                <div style="margin-bottom: 0.75rem;">
                    <label>Category Label</label>
                    <input type="text" id="subCategory" class="glass-input" value="${category}" placeholder="e.g. Entertainment">
                </div>
                <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button class="modal-btn cancel" onclick="window.closeSubModal()">Cancel</button>
                    <button class="modal-btn confirm" onclick="window.saveSubscription()">Save</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.closeSubModal = () => {
    const m = document.getElementById('subModal');
    if (m) m.remove();
};

window.saveSubscription = async () => {
    const vendor = document.getElementById('subVendor').value.trim();
    const amount = document.getElementById('subAmount').value;
    const category = document.getElementById('subCategory').value.trim();
    const currency = document.getElementById('subCcy').value;
    const password = sessionStorage.getItem('spendAuth');
    
    if (!vendor) return showToast('Vendor name required', 'warning');
    if (!password) return showToast('Session expired. Please reload.', 'error');
    
    try {
        const response = await fetch('/api/recurring', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
            body: JSON.stringify({ vendor, amount: parseFloat(amount) || 0, category, currency })
        });
        const result = await response.json();
        if (result.success) {
            window.closeSubModal();
            fetchData();
        } else {
            showToast(result.error || 'Failed to update subscription.', 'error');
        }
    } catch (e) {
        showToast('Failed to connect to the server.', 'error');
    }
};

window.toggleRecurring = async (vendor, forceAdd = false, forceDelete = false) => {
    const isCurrentlyRecurring = Object.keys(recurringVendors).includes(vendor);
    
    if (forceAdd && isCurrentlyRecurring) {
        showToast("Vendor is already tracked as a subscription.", 'info');
        return;
    }
    
    if (forceAdd) {
        // From transactions pane explicitly adding a vendor directly
        openSubscriptionModal(vendor);
        return;
    }
    
    const method = (isCurrentlyRecurring && !forceAdd) || forceDelete ? 'DELETE' : 'POST';
    const action = method === 'POST' ? 'add' : 'remove';

    if (!confirm(`Are you sure you want to ${action} explicit subscription tracking for "${vendor}"?`)) return;
    const password = sessionStorage.getItem('spendAuth');

    try {
        const response = await fetch('/api/recurring', {
            method,
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
            body: JSON.stringify({ vendor })
        });
        const result = await response.json();
        if (result.success) {
            fetchData();
        } else {
            showToast(result.error || 'Failed to update subscription status.', 'error');
        }
    } catch (error) {
        showToast('Failed to connect to the server.', 'error');
    }
};

window.deleteTransaction = async (id) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;
    const password = sessionStorage.getItem('spendAuth');
    const txBackup = allTransactions.find(tx => tx.id === id);
    
    // Optimistic removal
    allTransactions = allTransactions.filter(tx => tx.id !== id);
    applyFilters();
    
    // Show undo toast
    let undone = false;
    showToast('Transaction deleted', 'success', 5000, {
        undoCallback: () => {
            undone = true;
            if (txBackup) {
                allTransactions.push(txBackup);
                allTransactions.sort((a, b) => b.id - a.id);
                applyFilters();
                showToast('Deletion undone', 'info', 2000);
            }
        }
    });
    
    // Delay actual server deletion by 5s to allow undo
    setTimeout(async () => {
        if (undone) return;
        try {
            const response = await fetch('/api/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
                body: JSON.stringify({ id })
            });
            const result = await response.json();
            if (!result.success) {
                // Restore on failure
                if (txBackup) {
                    allTransactions.push(txBackup);
                    allTransactions.sort((a, b) => b.id - a.id);
                    applyFilters();
                }
                showToast(result.error || 'Failed to delete from database.', 'error');
            }
        } catch (error) {
            if (txBackup) {
                allTransactions.push(txBackup);
                allTransactions.sort((a, b) => b.id - a.id);
                applyFilters();
            }
            showToast('Failed to connect to the server.', 'error');
        }
    }, 5000);
};

window.openEditModal = (id) => {
    const isEdit = id !== null;
    const tx = isEdit ? allTransactions.find(t => t.id === id) : {};
    
    // Default values
    const currentCat = isEdit ? (tx.category || '').replace(/\s*\((Credit|Debit)\)/i, '').trim() : 'Other';
    const amount = isEdit ? (tx.amount || '') : '';
    const currency = isEdit ? (tx.currency || 'EGP') : 'EGP';
    const vendor = isEdit ? (tx.vendor || '') : '';
    const type = isEdit ? (tx.type || 'Out') : 'Out';
    
    let dateStr = '';
    if (isEdit && tx.date) {
        const d = new Date(tx.date);
        if (!isNaN(d.getTime())) {
            // pad with correct time block, local time
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            dateStr = d.toISOString().slice(0, 16);
        }
    }
    
    const existing = document.getElementById('editModal');
    if (existing) existing.remove();
    
    const defaultCategories = [
        'Transport', 'Food & Drink', 'Groceries', 'Shopping', 
        'Entertainment', 'Utilities', 'Health', 'Education', 
        'Transfer', 'ATM', 'Subscription', 'Refund', 'Other'
    ];
    const customCats = JSON.parse(localStorage.getItem('customCategories') || '[]');
    const allCategories = [...defaultCategories, ...customCats];
    
    const options = allCategories.map(c => 
        `<option value="${c}" ${c === currentCat ? 'selected' : ''}>${c}</option>`
    ).join('');
    
    const modal = document.createElement('div');
    modal.id = 'editModal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="window.closeModal()">
            <div class="modal-box" onclick="event.stopPropagation()">
                <h3>${isEdit ? 'Edit Transaction' : 'Add New Transaction'}</h3>
                
                <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <div style="flex:1;">
                        <label>Amount</label>
                        <input type="number" step="0.01" id="editAmount" class="glass-input" value="${amount}">
                    </div>
                    <div style="width: 80px;">
                        <label>Currency</label>
                        <select id="editCurrency" class="glass-select">
                            <option value="EGP" ${currency === 'EGP' ? 'selected' : ''}>EGP</option>
                            <option value="USD" ${currency === 'USD' ? 'selected' : ''}>USD</option>
                        </select>
                    </div>
                </div>

                <div style="margin-bottom: 0.75rem;">
                    <label>Vendor</label>
                    <input type="text" id="editVendor" class="glass-input" value="${vendor}">
                </div>

                <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <div style="flex:1;">
                        <label>Type</label>
                        <select id="editType" class="glass-select">
                            <option value="Out" ${type === 'Out' ? 'selected' : ''}>Money Out</option>
                            <option value="In" ${type === 'In' ? 'selected' : ''}>Money In</option>
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label>Category</label>
                        <select id="editCategory" class="glass-select">
                            ${options}
                        </select>
                    </div>
                </div>
                
                <div id="customCatRow" style="display:none; margin-bottom: 0.75rem;">
                    <input type="text" id="customCatInput" class="glass-input" placeholder="Type custom category...">
                </div>
                <button class="modal-link" style="margin-bottom:0.75rem;" id="toggleCustomBtn" onclick="window.toggleCustomCategory()">+ Create custom category</button>

                <div style="margin-bottom: 0.75rem;">
                    <label>Date (leave empty for now)</label>
                    <input type="datetime-local" id="editDate" class="glass-input" value="${dateStr}">
                </div>
                
                <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button class="modal-btn cancel" onclick="window.closeModal()">Cancel</button>
                    <button class="modal-btn confirm" onclick="submitEdit(${id})">${isEdit ? 'Save Changes' : 'Add Transaction'}</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.toggleCustomCategory = () => {
    const row = document.getElementById('customCatRow');
    const select = document.getElementById('editCategory');
    const btn = document.getElementById('toggleCustomBtn');
    
    if (row.style.display === 'none') {
        row.style.display = 'block';
        select.style.display = 'none';
        btn.textContent = '← Back to list';
        document.getElementById('customCatInput').focus();
    } else {
        row.style.display = 'none';
        select.style.display = 'block';
        btn.textContent = '+ Create custom category';
    }
};

window.closeModal = () => {
    const modal = document.getElementById('editModal');
    if (modal) modal.remove();
};

window.submitEdit = async (id) => {
    const isEdit = id !== null;
    const customRow = document.getElementById('customCatRow');
    const isCustom = customRow.style.display !== 'none';
    
    let selectedCategory = isCustom ? document.getElementById('customCatInput').value.trim() : document.getElementById('editCategory').value;
    if (isCustom) {
        if (!selectedCategory) { showToast('Please type a category name.', 'warning'); return; }
        const customCats = JSON.parse(localStorage.getItem('customCategories') || '[]');
        if (!customCats.includes(selectedCategory)) {
            customCats.push(selectedCategory);
            localStorage.setItem('customCategories', JSON.stringify(customCats));
        }
    }
    
    const amountStr = document.getElementById('editAmount').value;
    const parsedAmount = parseFloat(amountStr);
    const currency = document.getElementById('editCurrency').value;
    const vendor = document.getElementById('editVendor').value.trim();
    const type = document.getElementById('editType').value;
    const dateStr = document.getElementById('editDate').value;
    
    if (isNaN(parsedAmount) || parsedAmount < 0) {
        showToast('Amount must be a valid positive number.', 'warning'); return;
    }
    if (!vendor) { 
        showToast('Please specify a vendor or description.', 'warning'); return; 
    }
    
    const amount = parsedAmount;
    
    // We retain the Credit/Debit suffix if it existed in the edit case
    let finalCategory = selectedCategory;
    if (isEdit) {
        const tx = allTransactions.find(t => t.id === id);
        const suffix = (tx?.category || '').match(/\((Credit|Debit)\)/i);
        if (suffix) finalCategory = `${selectedCategory} (${suffix[1]})`;
    }

    const payload = {
        amount, currency, type, vendor, category: finalCategory
    };
    if (dateStr) {
        payload.date = new Date(dateStr).toISOString();
    }
    
    const url = isEdit ? '/api/update' : '/api/add';
    const method = isEdit ? 'PATCH' : 'POST';
    if (isEdit) payload.id = id;

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.success) {
            closeModal();
            fetchData(); 
        } else {
            showToast(result.error || 'Failed to save.', 'error');
        }
    } catch (error) {
        showToast('Failed to connect to the server.', 'error');
    }
};

window.openBudgetModal = (category, currentAmt, currentCcy) => {
    const existing = document.getElementById('budgetModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'budgetModal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="window.closeBudgetModal()">
            <div class="modal-box" onclick="event.stopPropagation()">
                <h3>Set Budget Pace</h3>
                <p style="font-size:0.85rem; color:var(--text-med); margin-bottom:1rem;">Cap your monthly spend for <strong>${category}</strong></p>
                <div style="margin-bottom: 0.75rem;">
                    <label>Monthly Limit Limit (0 to clear)</label>
                    <div style="display:flex; gap:0.5rem;">
                        <input type="number" id="budgetLimit" class="glass-input" value="${currentAmt}" placeholder="e.g. 5000">
                        <select id="budgetCcy" class="glass-select" style="width: 80px;">
                            <option value="EGP" ${currentCcy === 'EGP' ? 'selected' : ''}>EGP</option>
                            <option value="USD" ${currentCcy === 'USD' ? 'selected' : ''}>USD</option>
                        </select>
                    </div>
                </div>
                <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button class="modal-btn cancel" onclick="window.closeBudgetModal()">Cancel</button>
                    <button class="modal-btn confirm" onclick="window.saveBudget('${category}')">Save Limit</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.closeBudgetModal = () => {
    const m = document.getElementById('budgetModal');
    if (m) m.remove();
};

window.saveBudget = async (category) => {
    const limitStr = document.getElementById('budgetLimit').value;
    const parsedLimit = parseFloat(limitStr);
    const currency = document.getElementById('budgetCcy').value;
    
    if (isNaN(parsedLimit) || parsedLimit < 0) {
        return showToast('Limit must be a valid positive number.', 'warning');
    }
    
    const limit = parsedLimit;
    const password = sessionStorage.getItem('spendAuth');
    if (!password) return showToast('Session expired.', 'error');
    
    try {
        const res = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
            body: JSON.stringify({ category, amount: limit || 0, currency })
        });
        const data = await res.json();
        if (data.success) {
            window.closeBudgetModal();
            fetchData();
        } else {
            showToast(data.error, 'error');
        }
    } catch(e) {
        showToast('Failed to save budget constraint.', 'error');
    }
};

document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleChatSubmit();
});
document.getElementById('chatSendBtn').addEventListener('click', handleChatSubmit);

async function handleChatSubmit() {
    const input = document.getElementById('chatInput');
    const query = input.value.trim();
    if (!query) return;
    
    input.value = '';
    
    const history = document.getElementById('chatHistory');
    
    // Render User Bubble
    history.insertAdjacentHTML('beforeend', `
        <div style="background: var(--btn-glow); color:var(--bg-dark); padding: 1rem; border-radius: 12px; max-width: 85%; align-self: flex-end; box-shadow: 0 4px 15px rgba(52,211,153,0.3); font-weight: 500;">
            ${query.replace(/</g, "&lt;")}
        </div>
    `);
    
    history.scrollTop = history.scrollHeight;
    // Render Loading Bubble
    const auth = sessionStorage.getItem('spendAuth');
    
    history.insertAdjacentHTML('beforeend', `
        <div id="typingIndicator" style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; max-width: 85%; align-self: flex-start; opacity:0.6; border: 1px solid rgba(255,255,255,0.05);">
            <i class="ph ph-spinner ph-spin" style="margin-right:0.5rem;"></i> Analyzing records...
        </div>
    `);
    
    history.scrollTop = history.scrollHeight;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
            body: JSON.stringify({ query: query,  })
        });
        const data = await response.json();
        
        document.getElementById('typingIndicator')?.remove(); // Changed from loaderId to typingIndicator
        
        if (data.answer) {
            history.insertAdjacentHTML('beforeend', `
                <div class="chat-bubble ai" style="background: rgba(255,255,255,0.08); padding: 1.25rem; border-radius: 12px; max-width: 85%; align-self: flex-start; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem; opacity:0.8;">
                        <i class="ph ph-robot" style="color:var(--text-med); font-size:1.2rem;"></i>
                        <span style="font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-med);">AI Assistant</span>
                    </div>
                    <div class="chat-markdown">
                        ${marked.parse(data.answer)}
                    </div>
                </div>
            `);
        } else {
            history.insertAdjacentHTML('beforeend', `
                <div style="background: rgba(248, 113, 113, 0.2); padding: 1rem; border-radius: 12px; max-width: 85%; align-self: flex-start;">
                    ⚠️ ${data.error || 'Failed to process inquiry.'}
                </div>
            `);
        }
    } catch (error) {
        document.getElementById('typingIndicator')?.remove();
        history.insertAdjacentHTML('beforeend', `
            <div style="background: rgba(248, 113, 113, 0.2); padding: 1rem; border-radius: 12px; max-width: 85%; align-self: flex-start;">
                ⚠️ Failed to connect to AI server.
            </div>
        `);
    }
    history.scrollTop = history.scrollHeight;
}

function renderIncome(filteredTxs) {
    const list = document.getElementById('incomeList');
    if (!list) return;

    const baseCcy = document.getElementById('baseCurrency')?.value || 'EGP';
    const baseRateEgp = exchangeRates[baseCcy] || 1.0;

    let totalMonthlyIncomeUnified = 0;
    incomeSources.forEach(inc => {
        const amt = parseFloat(inc.amount) || 0;
        totalMonthlyIncomeUnified += (amt * (exchangeRates[inc.currency || 'EGP'] || 1.0)) / baseRateEgp;
    });

    let totalSpentUnified = 0;
    filteredTxs.filter(tx => tx.type === 'Out').forEach(tx => {
        const amt = parseFloat(tx.amount) || 0;
        totalSpentUnified += (amt * (exchangeRates[tx.currency || 'EGP'] || 1.0)) / baseRateEgp;
    });
    
    // Refunds
    filteredTxs.filter(tx => tx.type === 'In').forEach(tx => {
        const amt = parseFloat(tx.amount) || 0;
        totalSpentUnified -= (amt * (exchangeRates[tx.currency || 'EGP'] || 1.0)) / baseRateEgp;
    });

    const netSaved = totalMonthlyIncomeUnified - totalSpentUnified;
    let trueBurnEgp = 0;
    if (typeof activeSubs !== 'undefined') {
        activeSubs.forEach(sub => trueBurnEgp += (sub.avgAmount || 0));
    }
    const cleanBurn = trueBurnEgp / baseRateEgp;

    let pctSpent = 0;
    let pctSubs = 0;
    if (totalMonthlyIncomeUnified > 0) {
        pctSpent = ((Math.max(0, totalSpentUnified) / totalMonthlyIncomeUnified) * 100).toFixed(1);
        pctSubs = ((cleanBurn / totalMonthlyIncomeUnified) * 100).toFixed(1);
    }
    
    const isOverspent = (pctSpent > 100) || (netSaved < 0);

    document.getElementById('totalIncomeMetric').innerHTML = formatCcy(totalMonthlyIncomeUnified, baseCcy);
    document.getElementById('percentSpent').innerHTML = `${pctSpent}%`;
    document.getElementById('percentSubs').innerHTML = `${pctSubs}%`;
    
    const savedElem = document.getElementById('netSaved');
    if (savedElem) {
        savedElem.innerHTML = formatCcy(netSaved, baseCcy);
        savedElem.style.color = isOverspent ? 'var(--money-out)' : 'var(--money-in)';
    }

    if (incomeSources.length === 0) {
        list.innerHTML = `<div class="loading-state"><i class="ph ph-wallet empty-state-icon"></i><p style="font-size:1rem;">No income sources added yet</p><p style="font-size:0.85rem; opacity:0.6;">Add your salary or other income to track savings</p></div>`;
        return;
    }

    let html = '';
    incomeSources.sort((a,b) => b.amount - a.amount).forEach(inc => {
        const safeName = inc.source_name.replace(/'/g, "\\'");
        const amt = parseFloat(inc.amount) || 0;
        const ccy = inc.currency || 'EGP';
        const unifiedIncEgp = amt * (exchangeRates[ccy] || 1.0);
        
        const isForeign = ccy !== baseCcy;
        const baseUnified = unifiedIncEgp / baseRateEgp;
        const egpStr = isForeign ? `≈ ${formatCcy(baseUnified, baseCcy)} • ` : '';

        html += `
            <div class="transaction-item sub-item">
                <div class="tx-content" style="display: flex; width: 100%; justify-content: space-between; align-items: center;">
                    <div class="tx-left" style="flex:1;">
                        <div class="tx-icon cat-transfer"><i class="ph ph-trend-up"></i></div>
                        <div class="tx-details">
                            <h4>${inc.source_name}</h4>
                            <p><span class="tx-badge">Income</span> • Fixed Source</p>
                        </div>
                    </div>
                    <div class="tx-bottom-mobile" style="display: flex; align-items: center; justify-content: flex-end; gap: 1rem;">
                        <div class="tx-right text-right">
                            <div class="tx-amount text-gradient-green">+ ${formatCcy(inc.amount, inc.currency)}</div>
                            <span style="font-size:0.7em; color:var(--text-med); display:block;">${egpStr}per month</span>
                        </div>
                        <div class="tx-actions" style="display: flex; gap: 0.35rem;">
                            <button class="action-btn edit-btn" onclick="openIncomeModal('${safeName}', '${inc.amount}', '${inc.currency}')" title="Edit details">
                                <i class="ph ph-pencil-simple"></i>
                            </button>
                            <button class="action-btn delete-btn" onclick="deleteIncomeSource('${safeName}')" title="Delete Income">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

window.promptAddIncome = () => openIncomeModal();

window.openIncomeModal = (sourceName = '', amount = '', currency = 'EGP') => {
    const existing = document.getElementById('incomeModalObj');
    if (existing) existing.remove();
    
    const isEdit = sourceName !== '';
    const title = isEdit ? 'Edit Income Source' : 'Add Income Source';
    
    const modal = document.createElement('div');
    modal.id = 'incomeModalObj';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="document.getElementById('incomeModalObj').remove()">
            <div class="modal-box" onclick="event.stopPropagation()">
                <h3>${title}</h3>
                <div style="margin-bottom: 0.75rem;">
                    <label>Income Source Name</label>
                    <input type="text" id="incName" class="glass-input" value="${sourceName}" ${isEdit ? 'disabled style="opacity:0.6"' : ''} placeholder="e.g. Salary, Rent">
                </div>
                <div style="margin-bottom: 0.75rem;">
                    <label>Monthly Amount</label>
                    <div style="display:flex; gap:0.5rem;">
                        <input type="number" id="incAmount" class="glass-input" value="${amount}" placeholder="e.g. 5000">
                        <select id="incCcy" class="glass-select" style="width: 80px;">
                            <option value="EGP" ${currency === 'EGP' ? 'selected' : ''}>EGP</option>
                            <option value="USD" ${currency === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="EUR" ${currency === 'EUR' ? 'selected' : ''}>EUR</option>
                        </select>
                    </div>
                </div>
                <div class="modal-actions" style="margin-top: 1.5rem;">
                    <button class="modal-btn cancel" onclick="document.getElementById('incomeModalObj').remove()">Cancel</button>
                    <button class="modal-btn confirm" onclick="saveIncomeSource()">Save</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.saveIncomeSource = async () => {
    const source_name = document.getElementById('incName').value.trim();
    const amountStr = document.getElementById('incAmount').value;
    const parsedAmount = parseFloat(amountStr);
    const currency = document.getElementById('incCcy').value;
    const password = sessionStorage.getItem('spendAuth');
    
    if (!source_name) return showToast('Source name required', 'warning');
    if (isNaN(parsedAmount) || parsedAmount <= 0) return showToast('Amount must be a valid positive number.', 'warning');
    if (!password) return showToast('Session expired.', 'error');
    
    const amount = parsedAmount;
    
    try {
        const response = await fetch('/api/income', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
            body: JSON.stringify({ source_name, amount: parseFloat(amount) || 0, currency })
        });
        const result = await response.json();
        if (result.success) {
            document.getElementById('incomeModalObj').remove();
            fetchData();
        } else {
            showToast(result.error || 'Failed to update income.', 'error');
        }
    } catch (e) {
        showToast('Failed to connect to backend.', 'error');
    }
};

window.deleteIncomeSource = async (source_name) => {
    if(!confirm("Are you sure you want to remove this Income Source?")) return;
    const password = sessionStorage.getItem('spendAuth');
    
    try {
        const response = await fetch('/api/income', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': sessionStorage.getItem('spendAuth') },
            body: JSON.stringify({ source_name })
        });
        const result = await response.json();
        if (result.success) {
            fetchData();
        } else {
            showToast(result.error || 'Failed to delete income.', 'error');
        }
    } catch (error) {
        showToast('Server error.', 'error');
    }
};

window.openCategorySettings = () => {
    const existing = document.getElementById('catSettingsModal');
    if (existing) existing.remove();
    
    const defaultCategories = [
        'Transport', 'Food & Drink', 'Groceries', 'Shopping', 
        'Entertainment', 'Utilities', 'Health', 'Education', 
        'Transfer', 'ATM', 'Subscription', 'Refund', 'Other'
    ];
    const customCats = JSON.parse(localStorage.getItem('customCategories') || '[]');
    let allCats = new Set([...defaultCategories, ...customCats]);
    
    allTransactions.forEach(tx => {
        if(tx.category) {
            allCats.add(tx.category.replace(/\s*\((Credit|Debit)\)/i, '').trim());
        }
    });
    
    const sortedCats = Array.from(allCats).sort();
    
    const colorOptions = [
        {val: 'cat-transport', label: 'Blue Gradient'},
        {val: 'cat-food', label: 'Orange Gradient'},
        {val: 'cat-groceries', label: 'Yellow Gradient'},
        {val: 'cat-shopping', label: 'Pink Gradient'},
        {val: 'cat-entertainment', label: 'Purple Gradient'},
        {val: 'cat-health', label: 'Green Gradient'},
        {val: 'cat-utilities', label: 'Slate Gray'},
        {val: 'cat-education', label: 'Indigo Gradient'},
        {val: 'cat-transfer', label: 'Teal Gradient'},
        {val: 'cat-atm', label: 'Neutral Gray'},
        {val: 'cat-subscription', label: 'Rose Red Gradient'},
        {val: 'cat-refund', label: 'Emerald Gradient'},
        {val: 'cat-other', label: 'Dark Gray'}
    ];
    
    let listHTML = '';
    
    sortedCats.forEach((cat, idx) => {
        const currentMapping = getCategoryIcon(cat);
        const safeID = 'catRow_' + idx;
        
        let iconBtn = `
            <button id="icon-btn-${safeID}" class="action-btn" style="width:42px; height:42px; font-size:1.4rem; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); flex-shrink:0;" onclick="openIconPicker('${safeID}')" title="Change Icon">
                <i class="ph ${currentMapping.icon}"></i>
            </button>
            <input type="hidden" class="ui-icon-val" data-cat="${cat.replace(/"/g, '&quot;')}" id="icon-val-${safeID}" value="${currentMapping.icon}">
        `;
        
        let colorBtn = `
            <button id="color-btn-${safeID}" class="action-btn ${currentMapping.class}" style="width:130px; height:42px; border-radius:10px; border:1px solid currentColor; flex-shrink:0; font-size:0.8rem; font-weight:600;" onclick="openColorPicker('${safeID}')" title="Change Color">
                ${colorOptions.find(co => co.val === currentMapping.class)?.label || 'Color'}
            </button>
            <input type="hidden" class="ui-color-val" id="color-val-${safeID}" value="${currentMapping.class}">
        `;
        
        listHTML += `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; padding-bottom:0.75rem; border-bottom:1px solid rgba(255,255,255,0.05); gap:1rem;">
                <div style="font-weight:500; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${cat}</div>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    ${iconBtn}
                    ${colorBtn}
                </div>
            </div>
        `;
    });
    
    const modal = document.createElement('div');
    modal.id = 'catSettingsModal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="window.closeCategorySettings()">
            <div class="modal-box" onclick="event.stopPropagation()" style="display:flex; flex-direction:column; max-height: 85vh; max-width: 500px; padding:0; overflow:hidden;">
                
                <div style="padding: 1.5rem 1.5rem 0.5rem 1.5rem; flex-shrink:0;">
                    <h3 style="margin-top:0; margin-bottom:0.25rem;">Appearance Settings</h3>
                    <p style="font-size:0.85rem; color:var(--text-med); margin-bottom:0;">Override icons and gradients mapped natively across lists.</p>
                </div>
                
                <div id="uiOverridesList" style="flex:1; overflow-y:auto; padding: 1rem 1.5rem;">
                    ${listHTML}
                </div>
                
                <div class="modal-actions" style="padding: 1.25rem 1.5rem; border-top: 1px solid rgba(255,255,255,0.05); margin-top:0; flex-shrink:0; background:rgba(0,0,0,0.2);">
                    <button class="modal-btn cancel" onclick="window.closeCategorySettings()">Cancel</button>
                    <button class="modal-btn confirm" onclick="window.saveCategoryConfigurations()">Save Settings</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.openIconPicker = (safeID) => {
    const iconOptions = [
        'ph-receipt', 'ph-car', 'ph-shopping-cart', 'ph-hamburger', 'ph-bag', 
        'ph-film-strip', 'ph-heartbeat', 'ph-plug', 'ph-graduation-cap', 
        'ph-arrows-left-right', 'ph-money', 'ph-calendar-blank', 'ph-airplane',
        'ph-lightning', 'ph-game-controller', 'ph-basketball', 'ph-drop', 
        'ph-fork-knife', 'ph-house', 'ph-paw-print', 'ph-scissors', 'ph-shirt', 
        'ph-toolbox', 'ph-trend-up', 'ph-trend-down', 'ph-star', 'ph-books',
        'ph-coffee', 'ph-train', 'ph-pizza', 'ph-monitor', 'ph-music-note',
        'ph-gift', 'ph-camera', 'ph-device-mobile', 'ph-ticket', 'ph-bank'
    ];
    
    let gridHTML = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr)); gap:0.5rem; margin-top:1rem;">';
    iconOptions.forEach(ic => {
        gridHTML += `<button class="action-btn" style="height:46px; font-size:1.5rem; border-radius:12px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1);" onclick="selectIcon('${safeID}', '${ic}')"><i class="ph ${ic}"></i></button>`;
    });
    gridHTML += '</div>';
    
    const modal = document.createElement('div');
    modal.id = 'iconPickerModal';
    modal.style.position = 'relative';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal-overlay" style="background:rgba(0,0,0,0.8); backdrop-filter:blur(10px);" onclick="this.parentElement.remove()">
            <div class="modal-box" onclick="event.stopPropagation()" style="max-width: 380px; padding: 1.5rem; background:#111; border:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">Pick an Icon</h3>
                    <button class="action-btn" style="width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:8px;" onclick="document.getElementById('iconPickerModal').remove()"><i class="ph ph-x"></i></button>
                </div>
                ${gridHTML}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.selectIcon = (safeID, icon) => {
    document.getElementById(`icon-val-${safeID}`).value = icon;
    document.getElementById(`icon-btn-${safeID}`).innerHTML = `<i class="ph ${icon}"></i>`;
    document.getElementById('iconPickerModal').remove();
}

window.openColorPicker = (safeID) => {
    const colorOptions = [
        {val: 'cat-transport', label: 'Blue Gradient'},
        {val: 'cat-food', label: 'Orange Gradient'},
        {val: 'cat-groceries', label: 'Yellow Gradient'},
        {val: 'cat-shopping', label: 'Pink Gradient'},
        {val: 'cat-entertainment', label: 'Purple Gradient'},
        {val: 'cat-health', label: 'Green Gradient'},
        {val: 'cat-utilities', label: 'Slate Gray'},
        {val: 'cat-education', label: 'Indigo Gradient'},
        {val: 'cat-transfer', label: 'Teal Gradient'},
        {val: 'cat-atm', label: 'Neutral Gray'},
        {val: 'cat-subscription', label: 'Rose Red Gradient'},
        {val: 'cat-refund', label: 'Emerald Gradient'},
        {val: 'cat-other', label: 'Dark Gray'}
    ];
    
    let gridHTML = '<div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:1rem;">';
    colorOptions.forEach(co => {
        gridHTML += `<button class="action-btn ${co.val}" style="height:46px; border-radius:12px; display:flex; align-items:center; justify-content:center; border:1px solid currentColor; font-weight:600; font-size:0.9rem;" onclick="selectColor('${safeID}', '${co.val}', '${co.label}')">${co.label}</button>`;
    });
    gridHTML += '</div>';
    
    const modal = document.createElement('div');
    modal.id = 'colorPickerModal';
    modal.style.position = 'relative';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal-overlay" style="background:rgba(0,0,0,0.8); backdrop-filter:blur(10px);" onclick="this.parentElement.remove()">
            <div class="modal-box" onclick="event.stopPropagation()" style="width: 100%; max-width: 320px; max-height: 80vh; overflow-y:auto; padding: 1.5rem; background:#111; border:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:center; position:sticky; top:-1.5rem; background:rgba(17,17,17,0.95); backdrop-filter:blur(10px); padding-top:1.5rem; padding-bottom:1rem; z-index:10; margin-top:-1.5rem;">
                    <h3 style="margin:0;">Pick a Color</h3>
                    <button class="action-btn" style="width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:8px;" onclick="document.getElementById('colorPickerModal').remove()"><i class="ph ph-x"></i></button>
                </div>
                ${gridHTML}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.selectColor = (safeID, colorVal, colorLabel) => {
    document.getElementById(`color-val-${safeID}`).value = colorVal;
    const btn = document.getElementById(`color-btn-${safeID}`);
    btn.className = `action-btn ${colorVal}`;
    btn.innerHTML = colorLabel;
    document.getElementById('colorPickerModal').remove();
}

window.closeCategorySettings = () => {
    const m = document.getElementById('catSettingsModal');
    if (m) m.remove();
};

window.saveCategoryConfigurations = () => {
    const iconInputs = document.querySelectorAll('.ui-icon-val');
    const colorSelects = document.querySelectorAll('[id^="color-val-"]');
    
    let overrides = JSON.parse(localStorage.getItem('categoryUIOverrides') || '{}');
    
    iconInputs.forEach((inp, i) => {
        const cat = inp.dataset.cat;
        const icon = inp.value;
        const color = colorSelects[i].value;
        
        overrides[cat] = { icon: icon, class: color };
    });
    
    localStorage.setItem('categoryUIOverrides', JSON.stringify(overrides));
    window.closeCategorySettings();
    applyFilters();
};

// ======= INSIGHTS TAB =======
function renderInsights(transactions) {
    const grid = document.getElementById('analyticsGrid');
    const heatmapDiv = document.getElementById('heatmapWidget');
    if (!grid || !heatmapDiv) return;

    const baseCcy = document.getElementById('baseCurrency')?.value || 'EGP';
    const baseRateEgp = exchangeRates[baseCcy] || 1.0;

    // --- TOP 5 MERCHANTS ---
    const merchantTotals = {};
    transactions.filter(tx => tx.type === 'Out').forEach(tx => {
        const vendor = tx.vendor || 'Unknown';
        const amt = (parseFloat(tx.amount) || 0) * (exchangeRates[tx.currency || 'EGP'] || 1.0) / baseRateEgp;
        merchantTotals[vendor] = (merchantTotals[vendor] || 0) + amt;
    });
    const topMerchants = Object.entries(merchantTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    let top5HTML = `<h4><i class="ph ph-storefront"></i> Top 5 Merchants</h4>`;
    if (topMerchants.length === 0) {
        top5HTML += `<p style="font-size:0.85rem; color:var(--text-low);">No spending data yet</p>`;
    } else {
        topMerchants.forEach(([name, amt], i) => {
            top5HTML += `<div class="merchant-row">
                <span class="merchant-rank">${i + 1}</span>
                <span class="merchant-name">${name}</span>
                <span class="merchant-amount">${formatCcy(amt, baseCcy)}</span>
            </div>`;
        });
    }

    // --- MONTH-OVER-MONTH ---
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);

    let thisMonthOut = 0, lastMonthOut = 0, thisMonthIn = 0, lastMonthIn = 0;
    transactions.forEach(tx => {
        const d = new Date(tx.date);
        const amt = (parseFloat(tx.amount) || 0) * (exchangeRates[tx.currency || 'EGP'] || 1.0) / baseRateEgp;
        if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
            if (tx.type === 'Out') thisMonthOut += amt; else thisMonthIn += amt;
        } else if (d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear()) {
            if (tx.type === 'Out') lastMonthOut += amt; else lastMonthIn += amt;
        }
    });

    const spendDiff = lastMonthOut > 0 ? ((thisMonthOut - lastMonthOut) / lastMonthOut * 100) : 0;
    const inDiff = lastMonthIn > 0 ? ((thisMonthIn - lastMonthIn) / lastMonthIn * 100) : 0;
    const spendClass = spendDiff > 0 ? 'mom-up' : spendDiff < 0 ? 'mom-down' : 'mom-neutral';
    const inClass = inDiff > 0 ? 'mom-down' : inDiff < 0 ? 'mom-up' : 'mom-neutral';

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let momHTML = `<h4><i class="ph ph-trend-up"></i> Month-over-Month</h4>`;
    momHTML += `<div class="mom-row"><span class="mom-label">Spending</span><span class="mom-value ${spendClass}">${spendDiff > 0 ? '↑' : spendDiff < 0 ? '↓' : '—'} ${Math.abs(spendDiff).toFixed(1)}%</span></div>`;
    momHTML += `<div class="mom-row"><span class="mom-label">This month out</span><span class="mom-value">${formatCcy(thisMonthOut, baseCcy)}</span></div>`;
    momHTML += `<div class="mom-row"><span class="mom-label">${monthNames[lastMonthDate.getMonth()]} out</span><span class="mom-value" style="opacity:0.7;">${formatCcy(lastMonthOut, baseCcy)}</span></div>`;

    // --- RECURRING FORECAST ---
    let forecastMonthly = 0;
    activeSubs.forEach(sub => forecastMonthly += (sub.avgAmount || 0));
    forecastMonthly = forecastMonthly / baseRateEgp;

    // Average variable spend (non-subscription Out txs this month)
    const subVendors = new Set(Object.keys(recurringVendors));
    let variableSpend = 0;
    let variableCount = 0;
    transactions.filter(tx => tx.type === 'Out' && !subVendors.has(tx.vendor)).forEach(tx => {
        const d = new Date(tx.date);
        if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
            variableSpend += (parseFloat(tx.amount) || 0) * (exchangeRates[tx.currency || 'EGP'] || 1.0) / baseRateEgp;
            variableCount++;
        }
    });

    const daysElapsed = now.getDate();
    const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    const projectedVariable = daysElapsed > 0 ? (variableSpend / daysElapsed) * daysInMonth : 0;
    const totalForecast = forecastMonthly + projectedVariable;

    let forecastHTML = `<h4><i class="ph ph-chart-line-up"></i> Spend Forecast</h4>`;
    forecastHTML += `<div class="mom-row"><span class="mom-label">Subscriptions</span><span class="mom-value">${formatCcy(forecastMonthly, baseCcy)}</span></div>`;
    forecastHTML += `<div class="mom-row"><span class="mom-label">Projected variable</span><span class="mom-value">${formatCcy(projectedVariable, baseCcy)}</span></div>`;
    forecastHTML += `<div class="mom-row" style="border-top:1px solid rgba(255,255,255,0.05); margin-top:0.25rem; padding-top:0.5rem;"><span class="mom-label" style="font-weight:600;">Total forecast</span><span class="mom-value mom-up" style="font-size:1.1rem;">${formatCcy(totalForecast, baseCcy)}</span></div>`;

    grid.innerHTML = `
        <div class="analytics-widget">${top5HTML}</div>
        <div class="analytics-widget">${momHTML}</div>
        <div class="analytics-widget">${forecastHTML}</div>
    `;

    // --- HEATMAP ---
    const heatmapData = {};
    let maxSpend = 0;
    transactions.filter(tx => tx.type === 'Out').forEach(tx => {
        const d = new Date(tx.date);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const amt = (parseFloat(tx.amount) || 0) * (exchangeRates[tx.currency || 'EGP'] || 1.0) / baseRateEgp;
        heatmapData[key] = (heatmapData[key] || 0) + amt;
        if (heatmapData[key] > maxSpend) maxSpend = heatmapData[key];
    });

    // Build 90-day heatmap
    let heatHTML = `<h4><i class="ph ph-calendar-dots"></i> Spending Heatmap (Last 90 Days)</h4><div class="heatmap-container">`;
    for (let i = 89; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const val = heatmapData[key] || 0;
        const intensity = maxSpend > 0 ? val / maxSpend : 0;
        let color;
        if (intensity === 0) color = 'rgba(255,255,255,0.03)';
        else if (intensity < 0.25) color = 'rgba(129,140,248,0.2)';
        else if (intensity < 0.5) color = 'rgba(129,140,248,0.4)';
        else if (intensity < 0.75) color = 'rgba(129,140,248,0.65)';
        else color = 'rgba(129,140,248,0.9)';
        const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        heatHTML += `<div class="heatmap-cell" style="background:${color};" data-label="${dateLabel}" data-val="${formatCcy(val, baseCcy)}"></div>`;
    }
    heatHTML += `</div>`;
    heatmapDiv.innerHTML = heatHTML;
    
    let tooltip = document.getElementById('heatmapTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'heatmapTooltip';
        tooltip.className = 'custom-tooltip';
        document.body.appendChild(tooltip);
    }
    
    document.querySelectorAll('.heatmap-cell').forEach(cell => {
        cell.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `<span style="color:var(--text-med); font-size:0.75rem; letter-spacing:0.02em;">${cell.dataset.label}</span><br><span style="font-size:0.95rem; font-weight:700;">${cell.dataset.val}</span>`;
            tooltip.classList.add('visible');
            const rect = cell.getBoundingClientRect();
            tooltip.style.left = rect.left + (rect.width / 2) + window.scrollX + 'px';
            tooltip.style.top = rect.top + window.scrollY - 10 + 'px';
        });
        cell.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    });
}

// ======= SWIPE TO DELETE (mobile) =======
function initSwipeToDelete() {
    if (window.innerWidth > 580) return;
    document.querySelectorAll('.transaction-item[data-tx-id]').forEach(item => {
        let startX = 0;
        let currentX = 0;
        let isSwiping = false;

        item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = false;
        }, { passive: true });

        item.addEventListener('touchmove', (e) => {
            currentX = e.touches[0].clientX;
            const diff = startX - currentX;
            if (diff > 30) {
                isSwiping = true;
                item.classList.add('swiping');
                item.style.transform = `translateX(${Math.max(-80, -diff)}px)`;
            }
        }, { passive: true });

        item.addEventListener('touchend', () => {
            const diff = startX - currentX;
            if (diff > 80) {
                const id = parseInt(item.dataset.txId);
                if (id) deleteTransaction(id);
            }
            item.classList.remove('swiping');
            item.style.transform = '';
        });
    });
}

// ======= BUDGET ALERTS =======
let budgetAlertsShown = new Set();
function checkBudgetAlerts(transactions) {
    const baseCcy = document.getElementById('baseCurrency')?.value || 'EGP';
    const baseRateEgp = exchangeRates[baseCcy] || 1.0;

    const categorySpend = {};
    transactions.filter(tx => tx.type === 'Out').forEach(tx => {
        const baseCategory = (tx.category || 'Other').replace(/\s*\((Credit|Debit)\)/i, '').trim();
        const amt = (parseFloat(tx.amount) || 0) * (exchangeRates[tx.currency || 'EGP'] || 1.0) / baseRateEgp;
        categorySpend[baseCategory] = (categorySpend[baseCategory] || 0) + amt;
    });

    Object.keys(allBudgets).forEach(cat => {
        const budget = allBudgets[cat];
        const budgetAmt = parseFloat(budget.amount) || 0;
        if (budgetAmt <= 0) return;

        const unifiedBudget = (budgetAmt * (exchangeRates[budget.currency || 'EGP'] || 1.0)) / baseRateEgp;
        const spent = categorySpend[cat] || 0;
        const alertKey = `${cat}_${Math.floor(spent / unifiedBudget * 10)}`;

        if (spent > unifiedBudget && !budgetAlertsShown.has(alertKey)) {
            budgetAlertsShown.add(alertKey);
            showToast(`⚠️ ${cat} is over budget! ${formatCcy(spent, baseCcy)} / ${formatCcy(unifiedBudget, baseCcy)}`, 'warning', 6000);
        } else if (spent > unifiedBudget * 0.8 && spent <= unifiedBudget && !budgetAlertsShown.has(alertKey)) {
            budgetAlertsShown.add(alertKey);
            showToast(`${cat} is at ${((spent/unifiedBudget)*100).toFixed(0)}% of budget`, 'info', 4000);
        }
    });
}
