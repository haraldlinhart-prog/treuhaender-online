// api/contact.js — Vercel Serverless Function
// Resend: noreply@pan21.com → treuhaender@pan21.com

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, message, service, elapsed } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (elapsed < 3) {
    return res.status(400).json({ error: 'Too fast' });
  }
  if (name.length > 80) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  const words = message.split(' ');
  for (const w of words) {
    if (w.length > 60) {
      return res.status(400).json({ error: 'Invalid content' });
    }
  }

  const serviceLabels = {
    'nominee-gf-gmbh':         'Nominee-Geschäftsführer GmbH',
    'nominee-gf-ug':           'Nominee-Geschäftsführer UG',
    'treuhand-gesellschafter': 'Treuhand-Gesellschafter',
    'nominee-international':   'Nominee International (UK/LLC/Offshore)',
    'treuhand-ag':             'Treuhänder für AG',
    'beratung':                'Allgemeine Beratung',
  };
  const serviceLabel = serviceLabels[service] || 'Nicht angegeben';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'noreply@pan21.com',
        to: 'treuhaender@pan21.com',
        subject: `Treuhand-Anfrage von ${name}`,
        html: `
          <h2 style="font-family:sans-serif;color:#1a2332">Neue Anfrage – Treuhänder Online</h2>
          <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%">
            <tr><td style="padding:8px 0;color:#6b7d96;width:140px">Name</td><td style="padding:8px 0;color:#1a2332"><strong>${name}</strong></td></tr>
            <tr><td style="padding:8px 0;color:#6b7d96">E-Mail</td><td style="padding:8px 0"><a href="mailto:${email}" style="color:#b8963e">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#6b7d96">Interesse</td><td style="padding:8px 0;color:#1a2332">${serviceLabel}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7d96;vertical-align:top">Nachricht</td><td style="padding:8px 0;color:#1a2332">${message.replace(/\n/g, '<br>')}</td></tr>
          </table>
        `,
        reply_to: email,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Mail send failed' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
