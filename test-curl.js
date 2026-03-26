async function run() {
    try {
        const resp = await fetch('https://ai-spending-tracker-three.vercel.app/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': '7412' },
            body: JSON.stringify({ action: 'generate-reg' })
        });
        console.log("STATUS:", resp.status);
        const text = await resp.text();
        console.log("RESPONSE:", text);
    } catch(e) {
        console.log("ERR:", e);
    }
}
run();
