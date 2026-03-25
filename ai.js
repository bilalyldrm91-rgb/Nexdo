export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Bu iş görevi hakkında Türkçe kısa bir özet yaz ve ne yapılması gerektiğine dair 3-4 madde halinde pratik öneriler sun. Görev: "${title}". Yanıtın toplam 150 kelimeyi geçmesin.`
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.map(c => c.text || '').join('') || 'Sonuç alınamadı.';
    res.status(200).json({ result: text });
  } catch (e) {
    res.status(500).json({ error: 'AI bağlantı hatası: ' + e.message });
  }
}
