const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const geoip = require('geoip-lite');   // <-- AJOUT : géolocalisation IP

const app = express();
const port = process.env.PORT || 3000;
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}
const MON_UTILISATEUR = process.env.MON_UTILISATEUR || "admin";
const MON_MOT_DE_PASSE = process.env.MON_MOT_DE_PASSE || "monMotDePasseSecret123";
const SECRET = process.env.SECRET || "changezCettePhraseSecretePourLaSecurite";

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, 'uploads/'); },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});
const upload = multer({ storage: storage });

app.use(express.static('public'));

// ============ AUTHENTIFICATION ADMIN ============
function verifierAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) { res.set('WWW-Authenticate', 'Basic'); return res.status(401).send('Auth requise.'); }
  const a = Buffer.from(h.split(' ')[1], 'base64').toString().split(':');
  if (a[0] === MON_UTILISATEUR && a[1] === MON_MOT_DE_PASSE) return next();
  res.set('WWW-Authenticate', 'Basic');
  return res.status(401).send('Identifiants incorrects.');
}

// ============ GÉNÉRATION DE LA CLÉ SECRÈTE ============
function genererCle(filename) {
  return crypto.createHash('sha256').update(filename + SECRET).digest('hex').substring(0, 16);
}

// ============ NOUVELLE FONCTION : BLOCAGE GÉOGRAPHIQUE ============
function verifierPays(req, res, next) {
  // Récupérer l'IP du visiteur
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

  // On autorise toujours l'accès local (votre machine)
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '::ffff:127.0.0.1') {
    return next();
  }

  const geo = geoip.lookup(ip);

  // On autorise uniquement la France (FR)
  if (geo && geo.country === 'FR') {
    return next();
  }

  // Sinon, on bloque
  return res.status(403).send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Accès refusé</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea, #764ba2); margin: 0; padding: 20px; }
        .c { background: white; padding: 60px 48px; border-radius: 20px; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,0.3); max-width: 500px; }
        h1 { font-weight: 900; color: #17181A; margin-bottom: 16px; letter-spacing: -1px; font-size: 32px; }
        p { color: #6B7280; font-size: 16px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="c">
        <h1>⛔ Accès refusé</h1>
        <p>Ce service est uniquement accessible depuis la France.</p>
      </div>
    </body>
    </html>
  `);
}
// =================================================================

// ============ ROUTE UPLOAD ============
app.post('/upload', verifierAuth, upload.single('file'), (req, res) => {
  const cle = genererCle(req.file.filename);
  res.redirect('/file/' + req.file.filename + '?key=' + cle);
});

// ============ ROUTE PAGE DE TÉLÉCHARGEMENT ============
app.get('/file/:filename', (req, res) => {
  const f = req.params.filename;
  const key = req.query.key;
  const bonneCle = genererCle(f);
  const estAdmin = (key === bonneCle);
  
  const urlPartage = req.protocol + '://' + req.get('host') + '/file/' + f;
  
  let boutonSuppr = '';
  if (estAdmin) {
    boutonSuppr = `
      <button onclick="if(confirm('Supprimer ce fichier ?')) window.location='/delete/${f}?key=${key}'" class="btn-delete">Supprimer ce fichier</button>
      <div class="share-box">
        <div class="share-label">🔗 Lien à partager</div>
        <div class="share-url" onclick="navigator.clipboard.writeText('${urlPartage}'); this.textContent='✅ Copié !'; setTimeout(()=>this.textContent='${urlPartage}', 1500);">${urlPartage}</div>
      </div>
    `;
  }
  
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${f} - Téléchargement</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #17181A;
      padding: 20px;
      -webkit-font-smoothing: antialiased;
    }
    
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
      z-index: -1;
      opacity: 0.95;
      animation: gradientShift 15s ease infinite;
      background-size: 300% 300%;
    }
    
    @keyframes gradientShift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    
    .auth-buttons {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ffffff;
      border-radius: 999px;
      padding: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 1000;
    }
    
    .btn-connexion {
      color: #17181A;
      text-decoration: none;
      font-family: 'Inter', sans-serif;
      font-size: 15px;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: 999px;
      transition: background 0.2s ease;
    }
    
    .btn-connexion:hover { background: #F3F4F6; }
    
    .btn-inscription {
      background: #2E2E2E;
      color: #ffffff;
      text-decoration: none;
      font-family: 'Inter', sans-serif;
      font-size: 15px;
      font-weight: 700;
      padding: 10px 22px;
      border-radius: 999px;
      transition: background 0.2s ease;
    }
    
    .btn-inscription:hover { background: #17181A; }
    
    .card {
      background: #ffffff;
      border-radius: 20px;
      padding: 56px 48px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 30px 80px rgba(0,0,0,0.35);
      text-align: center;
      animation: cardIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    @keyframes cardIn {
      from { opacity: 0; transform: translateY(30px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    
    .logo {
      width: 200px;
      height: 80px;
      margin: 0 auto 32px;
      background-image: url('/logo.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }
    
    h1 {
      font-size: 32px;
      font-weight: 900;
      color: #17181A;
      letter-spacing: -1px;
      line-height: 1.15;
      margin-bottom: 12px;
    }
    
    .subtitle {
      font-size: 16px;
      color: #6B7280;
      line-height: 1.5;
      margin-bottom: 36px;
      font-weight: 400;
    }
    
    .filename {
      font-weight: 600;
      color: #17181A;
      word-break: break-all;
      background: #F3F4F6;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
      margin-bottom: 28px;
      display: block;
    }
    
    .btn {
      display: block;
      width: 100%;
      padding: 18px 28px;
      background: #17181A;
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      letter-spacing: -0.2px;
    }
    
    .btn:hover {
      background: #000;
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(23,24,26,0.25);
    }
    
    .btn:active { transform: translateY(0); }
    
    .btn-delete {
      display: block;
      width: 100%;
      padding: 14px 28px;
      background: transparent;
      color: #EF4444;
      border: 1.5px solid #EF4444;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 12px;
      transition: all 0.2s ease;
      font-family: inherit;
    }
    
    .btn-delete:hover {
      background: #EF4444;
      color: white;
    }
    
    .share-box {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #E5E7EB;
      text-align: left;
    }
    
    .share-label {
      font-size: 12px;
      font-weight: 600;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    
    .share-url {
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 12px;
      color: #374151;
      word-break: break-all;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'SF Mono', Monaco, monospace;
    }
    
    .share-url:hover {
      background: #F3F4F6;
      border-color: #17181A;
    }
    
    .footer {
      font-size: 12px;
      color: #9CA3AF;
      margin-top: 24px;
    }
    
    @media (max-width: 480px) {
      .card { padding: 40px 28px; border-radius: 16px; }
      h1 { font-size: 26px; }
      .auth-buttons { top: 12px; right: 12px; padding: 4px; }
      .btn-connexion { padding: 8px 14px; font-size: 13px; }
      .btn-inscription { padding: 8px 16px; font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="auth-buttons">
    <a href="https://auth.wetransfer.com/login" class="btn-connexion">Connexion</a>
    <a href="https://auth.wetransfer.com/login" class="btn-inscription">S'inscrire</a>
  </div>
  
  <div class="card">
    <div class="logo"></div>
    <h1>Votre fichier est prêt</h1>
    <p class="subtitle">Cliquez ci-dessous pour le télécharger.</p>
    <span class="filename">${f}</span>
    <a href="/download/${f}" class="btn">Télécharger le fichier</a>
    ${boutonSuppr}
    <div class="footer">Partage sécurisé • Lien unique</div>
  </div>
</body>
</html>`);
});

// ============ ROUTE DE TÉLÉCHARGEMENT (PROTÉGÉE PAR PAYS) ============
app.get('/download/:filename', verifierPays, (req, res) => {
  res.download(path.join(__dirname, 'uploads', req.params.filename));
});

// ============ ROUTE SUPPRESSION ============
app.get('/delete/:filename', (req, res) => {
  const f = req.params.filename;
  const key = req.query.key;
  if (key !== genererCle(f)) {
    return res.status(403).send('<h1>Acces refuse</h1><p>Pas la bonne cle.</p>');
  }
  fs.unlink(path.join(__dirname, 'uploads', f), (err) => {
    if (err) return res.status(500).send("Erreur : " + err.message);
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Supprimé</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
      <style>body{font-family:Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);margin:0}
      .c{background:white;padding:60px 48px;border-radius:20px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,0.3)}
      h1{font-weight:900;color:#17181A;margin-bottom:16px;letter-spacing:-1px}
      a{color:#667eea;text-decoration:none;font-weight:600}</style></head>
      <body><div class="c"><h1>✅ Fichier supprimé</h1><p style="color:#6B7280;margin-bottom:24px">Le fichier a été retiré du serveur.</p><a href="/">← Retour à l'accueil</a></div></body></html>`);
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur demarre sur le port ${port}`);
});