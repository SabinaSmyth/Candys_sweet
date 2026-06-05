module.exports = async (req, res) => {
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({
      success: false,
      error: "Error del servidor. Las variables de Supabase no están configuradas en Vercel."
    });
    return;
  }

  const correctUsername = process.env.APP_USERNAME || "admin";
  const correctPassword = process.env.APP_PASSWORD;

  if (!correctPassword) {
    res.status(500).json({
      success: false,
      error: "Error del servidor. La variable APP_PASSWORD no está configurada en Vercel."
    });
    return;
  }

  const { username, password } = req.body || {};

  // Obtener la IP real del cliente
  const ipHeader = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '127.0.0.1';
  const ip = ipHeader.split(',')[0].trim();

  // Obtener geolocalización inyectada por Vercel
  const country = req.headers['x-vercel-ip-country'] || 'Desconocido';
  const region = req.headers['x-vercel-ip-country-region'] || '';
  const city = req.headers['x-vercel-ip-city'] || '';
  const location = `${city}, ${region}, ${country}`.replace(/^,\s*|,\s*$/, '').trim() || 'Ubicación Desconocida';

  const userAgent = req.headers['user-agent'] || 'Desconocido';

  try {
    // 1. Consultar si la IP está bloqueada en Supabase
    const checkRes = await fetch(`${supabaseUrl}/rest/v1/login_attempts?ip_address=eq.${encodeURIComponent(ip)}&select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (!checkRes.ok) {
      throw new Error(`Error al consultar intentos en base de datos: ${checkRes.statusText}`);
    }

    const attemptsData = await checkRes.json();
    const record = attemptsData[0];

    if (record && record.blocked) {
      res.status(403).json({
        success: false,
        error: "Acceso bloqueado debido a múltiples intentos de inicio de sesión fallidos. Contacta al administrador para desbloquear."
      });
      return;
    }

    // 2. Verificar las credenciales
    if (username === correctUsername && password === correctPassword) {
      // Login exitoso: si hay registro, resetear intentos a 0 y asegurar blocked = false
      if (record) {
        await fetch(`${supabaseUrl}/rest/v1/login_attempts?ip_address=eq.${encodeURIComponent(ip)}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            attempts: 0,
            blocked: false,
            last_attempt_at: new Date().toISOString()
          })
        });
      }

      res.status(200).json({
        success: true,
        supabaseUrl,
        supabaseKey
      });
    } else {
      // Login fallido: calcular intentos y ver si bloqueamos
      const currentAttempts = record ? record.attempts : 0;
      const newAttempts = currentAttempts + 1;
      const shouldBlock = newAttempts >= 5;

      const attemptBody = {
        username: username || 'Desconocido',
        user_agent: userAgent,
        location: location,
        attempts: newAttempts,
        blocked: shouldBlock,
        last_attempt_at: new Date().toISOString()
      };

      if (record) {
        // Actualizar registro existente
        await fetch(`${supabaseUrl}/rest/v1/login_attempts?ip_address=eq.${encodeURIComponent(ip)}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(attemptBody)
        });
      } else {
        // Crear nuevo registro
        await fetch(`${supabaseUrl}/rest/v1/login_attempts`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ip_address: ip,
            ...attemptBody
          })
        });
      }

      if (shouldBlock) {
        res.status(403).json({
          success: false,
          error: "Acceso bloqueado debido a múltiples intentos de inicio de sesión fallidos. Contacta al administrador para desbloquear."
        });
      } else {
        res.status(401).json({
          success: false,
          error: `Usuario o contraseña incorrectos. Intentos restantes: ${5 - newAttempts}`
        });
      }
    }
  } catch (error) {
    console.error("Error en el login serverless:", error);
    res.status(500).json({
      success: false,
      error: "Error del servidor al procesar la solicitud de autenticación: " + error.message
    });
  }
};
