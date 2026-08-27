/**
 * core/validate-fields.js — Validación de campos de cliente (IP, teléfono).
 * v5.11.2 — Validaciones no bloqueantes: avisan al usuario pero no impiden
 * guardar (para no romper datos legítimos raros).
 *
 * API pública:
 *   RN.validateFields.ip(valor)          -> { ok, mensaje }
 *   RN.validateFields.telefono(valor)    -> { ok, valorNormalizado, mensaje }
 */
RN.validateFields = RN.validateFields || {};

/**
 * Valida una dirección IPv4.
 * Acepta X.X.X.X con cada octeto entre 0 y 255.
 * No exige 4 octetos estrictamente si el valor es muy corto (compatibilidad
 * con datos viejos), pero avisa cuando el formato no es de IPv4 estándar.
 * @returns {{ok:boolean, mensaje:string}}
 */
RN.validateFields.ip = function (valor) {
  var v = String(valor == null ? '' : valor).trim();
  if (!v) return { ok: true, mensaje: '' }; // vacío es válido (campo opcional)
  var partes = v.split('.');
  if (partes.length !== 4) {
    return { ok: false, mensaje: 'La IP debería tener 4 grupos separados por puntos (ej: 192.168.1.10). Se guarda igual.' };
  }
  for (var i = 0; i < 4; i++) {
    var p = partes[i];
    if (!/^\d+$/.test(p)) {
      return { ok: false, mensaje: 'El grupo "' + p + '" no es numérico. Se guarda igual.' };
    }
    var n = parseInt(p, 10);
    if (n < 0 || n > 255) {
      return { ok: false, mensaje: 'El grupo "' + p + '" está fuera de rango (0-255). Se guarda igual.' };
    }
  }
  return { ok: true, mensaje: '' };
};

/**
 * Normaliza y valida un número de teléfono (orientado a Cuba: +53).
 * - Quita espacios, guiones y paréntesis.
 * - Si viene como 8 dígitos sin prefijo, asume Cuba y añade +53.
 * - Si viene con +53 y 8 dígitos, lo deja.
 * - Avisa si el resultado no parece un número de teléfono razonable.
 * @returns {{ok:boolean, valorNormalizado:string, mensaje:string}}
 */
RN.validateFields.telefono = function (valor) {
  var v = String(valor == null ? '' : valor).trim();
  if (!v) return { ok: true, valorNormalizado: '', mensaje: '' };

  // Conservar solo dígitos y el signo + inicial.
  var tienePlus = v.charAt(0) === '+';
  var digitos = v.replace(/[^\d]/g, '');
  var resultado;
  var mensaje = '';

  if (digitos.length === 8 && !tienePlus) {
    // 8 dígitos sin prefijo: asumir Cuba (+53)
    resultado = '+53' + digitos;
    mensaje = 'Se agregó el prefijo +53 al teléfono.';
  } else if (digitos.length === 10 && tienePlus) {
    // +53 + 8 dígitos
    resultado = '+53' + digitos.slice(2);
  } else if (digitos.length === 10 && !tienePlus) {
    // 53 + 8 dígitos sin +
    resultado = '+53' + digitos.slice(2);
  } else {
    // Caso raro: dejar como venía pero limpio
    resultado = (tienePlus ? '+' : '') + digitos;
    if (digitos.length < 6) {
      mensaje = 'El teléfono parece demasiado corto. Revisa el número.';
    } else if (digitos.length > 15) {
      mensaje = 'El teléfono parece demasiado largo. Revisa el número.';
    }
  }

  var ok = !mensaje || mensaje.indexOf('demasiado') === -1 ? true : false;
  // Nota: devolvemos ok=true salvo que sea claramente inválido (muy corto/largo).
  // El aviso es informativo; no bloquea el guardado.
  return { ok: ok, valorNormalizado: resultado, mensaje: mensaje };
};
