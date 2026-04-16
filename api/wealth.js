import { pool, requireAuth } from './_db.js';

export default async function handler(request, response) {
    if (!requireAuth(request, response)) return;

    try {
        if (request.method === 'GET') {
            const result = await pool.query(`SELECT * FROM wealth_assets ORDER BY id ASC`);
            let assets = result.rows;

            // Always fetch live data for both automated assets AND the top ticker
            let liveData = null;
            let _liveDataDate = null;
            let realEgpRate = null;
            try {
                // Fetch basic global API
                const fetchRes = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
                if (fetchRes.ok) {
                    const data = await fetchRes.json();
                    liveData = data.usd;
                    _liveDataDate = data.date;
                }
            } catch (e) {
                console.error("Failed to fetch live API", e);
            }

            try {
                // Secondary Scrape: Attempt to pull local Egyptian Premium from RealEGP
                const regpRes = await fetch('https://realegp.com/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }});
                if (regpRes.ok) {
                    const html = await regpRes.text();
                    const match = html.match(/conversion_rate\s*=\s*([\d\.]+);/i);
                    if (match && match[1]) {
                        realEgpRate = parseFloat(match[1]);
                    }
                }
            } catch (e) {
                console.error("Failed to scrape RealEGP, using default.", e);
            }

// Process automated values
            const processedAssets = assets.map(asset => {
                if (asset.is_automated && liveData) {
                    if (['Gold', 'Silver'].includes(asset.commodity_type)) {
                        const metalKey = asset.commodity_type === 'Gold' ? 'xau' : 'xag';
                        if (liveData[metalKey]) {
                            const usdPerOunce = 1 / liveData[metalKey];
                            const usdPerGram = usdPerOunce / 31.1034768;
                            
                            let currentUnitValue = usdPerGram;
                            const currencyStr = (asset.currency || 'USD').toLowerCase();
                            if (asset.currency === 'EGP') {
                                const egpRateToUse = realEgpRate || liveData.egp;
                                if (egpRateToUse) {
                                    currentUnitValue = usdPerGram * egpRateToUse;
                                }
                            } else if (asset.currency !== 'USD' && liveData[currencyStr]) {
                                currentUnitValue = usdPerGram * liveData[currencyStr];
                            }
                            return { ...asset, current_manual_value: currentUnitValue, _is_live: true };
                        }
                    } else if (asset.asset_type === 'Currency') {
                        // Attempt to extract currency from name if they put "EUR" or "GBP" in asset_name
                        const fiatCand = asset.asset_name.match(/\b(EUR|GBP|USD|EGP|CAD|AUD)\b/i);
                        if (fiatCand) {
                            const fiat = fiatCand[1].toLowerCase();
                            let fiatInUsd = 1 / (liveData[fiat] || 1); 
                            if (fiat === 'usd') fiatInUsd = 1;
                            if (fiat === 'egp') fiatInUsd = 1 / (realEgpRate || liveData.egp || 1); // RealEgp Override
                            
                            const targetCurrencyStr = (asset.currency || 'USD').toLowerCase();
                            let targetInUsd = 1 / (liveData[targetCurrencyStr] || 1);
                            if (asset.currency === 'USD') targetInUsd = 1;
                            if (asset.currency === 'EGP') targetInUsd = 1 / (realEgpRate || liveData.egp || 1);

                            const fiatInTargetCurrency = fiatInUsd / targetInUsd;
                            return { ...asset, current_manual_value: fiatInTargetCurrency, _is_live: true };
                        }
                    }
                }
                return { ...asset, _is_live: false };
            });

            let market_rates = null;
            if (liveData) {
                const btc_usd = liveData.btc ? (1 / liveData.btc) : null;
                let gold_egp_gram = null;
                const egpRateToUseForTicker = realEgpRate || liveData.egp;
                if (liveData.xau && egpRateToUseForTicker) {
                    const usdPerOunce = 1 / liveData.xau;
                    const usdPerGram = usdPerOunce / 31.1034768;
                    gold_egp_gram = usdPerGram * egpRateToUseForTicker;
                }
                market_rates = { btc_usd, gold_egp_gram, last_updated: _liveDataDate, source: realEgpRate ? 'RealEGP + jsdelivr' : 'jsdelivr' };
            }

            return response.status(200).json({ wealth_assets: processedAssets, market_rates });
        }
        
        if (request.method === 'POST') {
            const { id, asset_name, asset_type, commodity_type, quantity, purchase_price, fees, currency, is_automated, current_manual_value } = request.body;

            if (!asset_name || isNaN(parseFloat(quantity))) {
                return response.status(400).json({ success: false, error: 'Missing core asset parameters' });
            }

            if (id) {
                // Update
                await pool.query(`
                    UPDATE wealth_assets 
                    SET asset_name=$1, asset_type=$2, commodity_type=$3, quantity=$4, purchase_price=$5, fees=$6, currency=$7, is_automated=$8, current_manual_value=$9
                    WHERE id=$10
                `, [asset_name, asset_type, commodity_type || null, parseFloat(quantity), parseFloat(purchase_price) || 0, parseFloat(fees) || 0, currency || 'USD', is_automated === true, parseFloat(current_manual_value) || 0, id]);
            } else {
                // Insert
                await pool.query(`
                    INSERT INTO wealth_assets (asset_name, asset_type, commodity_type, quantity, purchase_price, fees, currency, is_automated, current_manual_value) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [asset_name, asset_type, commodity_type || null, parseFloat(quantity), parseFloat(purchase_price) || 0, parseFloat(fees) || 0, currency || 'USD', is_automated === true, parseFloat(current_manual_value) || 0]);
            }

            return response.status(200).json({ success: true });
        }

        if (request.method === 'DELETE') {
            const { id } = request.body;

            if (!id) {
                return response.status(400).json({ success: false, error: 'Missing id' });
            }

            await pool.query(`DELETE FROM wealth_assets WHERE id = $1`, [id]);
            return response.status(200).json({ success: true });
        }

        return response.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error("Wealth logic error:", error);
        return response.status(500).json({ error: error.message });
    }
}
