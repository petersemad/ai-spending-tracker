import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Dynamically mount Vercel-style api routes
const apiPath = path.join(__dirname, 'api');
const files = fs.readdirSync(apiPath);

for (const file of files) {
    if (file.endsWith('.js') && file !== 'db.js') {
        const route = `/api/${file.replace('.js', '')}`;
        import(`file://${path.join(apiPath, file)}`).then(module => {
            const handler = module.default;
            if (handler) {
                app.all(route, (req, res) => handler(req, res));
                console.log(`Mounted ${route}`);
            }
        }).catch(err => console.error(`Failed to load ${file}:`, err));
    }
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
