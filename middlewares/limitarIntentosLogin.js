const MAX_INTENTOS_FALLIDOS = 10;
const VENTANA_MS = 15 * 60 * 1000;

// Intentos fallidos por IP. Suficiente para un unico servidor; se reinicia al reiniciar el proceso.
const intentosPorIp = new Map();

const limpiarVencidos = (ahora) => {
  for (const [ip, registro] of intentosPorIp) {
    if (ahora - registro.inicio > VENTANA_MS) {
      intentosPorIp.delete(ip);
    }
  }
};

/**
 * Bloquea temporalmente una IP luego de varios inicios de sesion fallidos,
 * para dificultar ataques de fuerza bruta sobre las contrasenas.
 */
const limitarIntentosLogin = (req, res, next) => {
  const ahora = Date.now();
  limpiarVencidos(ahora);

  const ip = req.ip;
  const registro = intentosPorIp.get(ip);

  if (registro && registro.fallidos >= MAX_INTENTOS_FALLIDOS) {
    const minutosRestantes = Math.ceil((VENTANA_MS - (ahora - registro.inicio)) / 60000);
    res.set("Retry-After", String(minutosRestantes * 60));
    return res.status(429).json({
      message: `Demasiados intentos fallidos. Volve a intentar en ${minutosRestantes} minutos`
    });
  }

  res.on("finish", () => {
    if (res.statusCode === 401) {
      const actual = intentosPorIp.get(ip) || { fallidos: 0, inicio: Date.now() };
      actual.fallidos += 1;
      intentosPorIp.set(ip, actual);
    } else if (res.statusCode === 200) {
      intentosPorIp.delete(ip);
    }
  });

  return next();
};

module.exports = limitarIntentosLogin;
