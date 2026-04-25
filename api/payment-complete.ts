import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Complete — Tbet</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f1f5f9; }
    .card { text-align: center; padding: 2rem; max-width: 400px; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p  { color: #94a3b8; margin-bottom: 1.5rem; }
    a  { display: inline-block; background: #3b82f6; color: white; padding: 0.75rem 1.5rem;
         border-radius: 0.5rem; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🎉</div>
    <h1>Payment Successful!</h1>
    <p>Your Tbet subscription is being activated. You will receive a confirmation message in Telegram shortly.</p>
    <a href="https://t.me">Return to Telegram</a>
  </div>
</body>
</html>`)
}
