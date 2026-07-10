// api/contact.js — Vercel Serverless Function
// Resend: noreply@pan21.com → treuhaender@pan21.com

// Catches bot-generated random tokens like "bhnkoMfKIhFwMnoUuUHhrL" that are short
// enough to slide past a simple length check but look nothing like a real word/name:
// very few vowels AND unnaturally frequent upper/lowercase switching. Both conditions
// are required together (not just one) specifically to avoid flagging real oddly-cased
// words — "McDonald" or "PayPal" fail the case-switch check alone but have a normal
// vowel ratio, so they correctly pass.
function isGibberish(str) {
  if (!str) return false;
  const words = str.split(/\s+/).filter(w => w.length >= 6);
  const vowelChars = 'aeiouyAEIOUYäöüÄÖÜàáâãåèéêëìíîïòóôõùúûýÀÁÂÃÅÈÉÊËÌÍÎÏÒÓÔÕÙÚÛÝ';
  for (const word of words) {
    const letters = word.replace(/[^a-zA-ZäöüÄÖÜßàáâãåèéêëìíîïòóôõùúûýÀÁÂÃÅÈÉÊËÌÍÎÏÒÓÔÕÙÚÛÝ]/g, '');
    if (letters.length < 6) continue;

    let vowels = 0;
    for (const ch of letters) if (vowelChars.includes(ch)) vowels++;
    const vowelRatio = vowels / letters.length;

    let transitions = 0;
    for (let i = 1; i < letters.length; i++) {
      const prevUpper = letters[i - 1] === letters[i - 1].toUpperCase() && letters[i - 1] !== letters[i - 1].toLowerCase();
      const curUpper = letters[i] === letters[i].toUpperCase() && letters[i] !== letters[i].toLowerCase();
      if (prevUpper !== curUpper) transitions++;
    }
    const transitionRatio = transitions / (letters.length - 1);

    if (vowelRatio < 0.2 && transitionRatio > 0.35) return true;
  }
  // A single very long no-space token (however "wordlike") is also a bot tell.
  if (/\S{61,}/.test(str)) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, message, service, elapsed, website } = req.body || {};

  // Honeypot — hidden field must stay empty. Silent success so bots get no signal.
  if (website && website.trim() !== '') {
    return res.status(200).json({ success: true });
  }

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (elapsed < 3) {
    // Silent success rather than an error — an error response teaches a bot to
    // just wait longer next time.
    return res.status(200).json({ success: true });
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
  if (isGibberish(name) || isGibberish(message)) {
    // Silent success, same as honeypot/timing rejection — no hint to the bot that
    // it was specifically the content that got it caught.
    return res.status(200).json({ success: true });
  }
  // A real inquiry message is always at least a few words with spaces.
  // Single unbroken tokens (however "wordlike" their vowel ratio looks) are
  // a bot tell independent of the vowel/case heuristic above — this catches
  // random-string bots that happen to land just above the vowelRatio cutoff
  // (e.g. tokens statistically close to real brand names like "McDonald").
  if (!/\s/.test(message.trim()) && message.trim().length > 12) {
    return res.status(200).json({ success: true });
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
