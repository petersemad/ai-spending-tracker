fetch("https://ai-spending-tracker-three.vercel.app/api/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Your credit card ending in 1234 was charged 50.00 EGP at Uber." })
}).then(async r => {
    console.log("Status:", r.status);
    console.log(await r.text());
}).catch(console.error);
