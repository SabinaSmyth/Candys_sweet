module.exports = (req, res) => {
  // CORS Headers to allow requests
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    return;
  }

  const { password } = req.body || {};
  const correctPassword = process.env.APP_PASSWORD;

  // Si no está configurada la variable en Vercel, bloquear el acceso por seguridad
  if (!correctPassword) {
    res.status(500).json({
      success: false,
      error: "Error de configuración en el servidor. Falta definir la variable APP_PASSWORD."
    });
    return;
  }

  if (password && password === correctPassword) {
    res.status(200).json({
      success: true,
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseKey: process.env.SUPABASE_KEY || ""
    });
  } else {
    res.status(401).json({
      success: false,
      error: "Contraseña incorrecta"
    });
  }
};
