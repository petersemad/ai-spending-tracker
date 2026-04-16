import { pool, requireAuth } from './db.js';

export default async function handler(request, response) {
    if (!requireAuth(request, response)) return;

    try {
        if (request.method === 'GET') {
            const result = await pool.query(`SELECT * FROM wealth_assets ORDER BY id ASC`);
            let assets = result.rows;

            // Fetch live data for automated assets
            let liveData = null;
            let needsLive = assets.some(a => a.is_automated);

            if (needsLive) {
                try {
                    // Fetch live currency and XAU data from a free CDN API
                    const fetchRes = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
                    if (fetchRes.ok) {
                        const data = await fetchRes.json();
                        liveData = data.usd;
                    }
                } catch (e) {
                    console.error("Failed to fetch live API", e);
                }
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
                            if (asset.currency === 'EGP' && liveData.egp) {
                                currentUnitValue = usdPerGram * liveData.egp;
                            } else if (asset.currency !== 'USD' && liveData[asset.currency.toLowerCase()]) {
                                currentUnitValue = usdPerGram * liveData[asset.currency.toLowerCase()];
                            }
                            return { ...asset, current_manual_value: currentUnitValue, _is_live: true };
                        }
                    } else if (asset.asset_type === 'Currency') {
                        // Attempt to extract currency from name if they put "EUR" or "GBP" in asset_name
                        const fiatCand = asset.asset_name.match(/\b(EUR|GBP|USD|EGP|CAD|AUD)\b/i);
                        if (fiatCand) {
                            const fiat = fiatCand[1].toLowerCase();
                            // Value of 1 unit of fiat in the target valuation currency
                            let fiatInUsd = 1 / (liveData[fiat] || 1); // e.g. 1 EUR in USD
                            if (fiat === 'usd') fiatInUsd = 1;
                            
                            let targetInUsd = 1 / (liveData[asset.currency.toLowerCase()] || 1);
                            if (asset.currency === 'USD') targetInUsd = 1;

                            const fiatInTargetCurrency = fiatInUsd / targetInUsd;
                            return { ...asset, current_manual_value: fiatInTargetCurrency, _is_live: true };
                        }
                    }
                }
                return { ...asset, _is_live: false };
            });

            return response.status(200).json({ wealth_assets: processedAssets });
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
