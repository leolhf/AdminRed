// crypto.js
// Cifrado/descifrado de datos con PIN (Web Crypto API - AES-GCM + PBKDF2).
// No depende de otros módulos. Usado por: storage-file.js

// ═══════════════════════════════════════════════════════════
//  CIFRADO DE DATOS CON PIN
// ═══════════════════════════════════════════════════════════
const ENCRYPTION_VERSION = ENCRYPTION.VERSION;

// Derivar clave criptográfica desde el PIN usando PBKDF2
async function deriveKeyFromPin(pin, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Cifrar datos JSON
async function encryptData(jsonData, pin) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonData);
    
    // Salt aleatoria para cada archivo
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKeyFromPin(pin, salt);
    
    // IV aleatorio para cada cifrado
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    
    // Combinar versión + salt + IV + datos cifrados en formato base64
    const versionBytes = encoder.encode(ENCRYPTION_VERSION);
    const combined = new Uint8Array(versionBytes.length + salt.length + iv.length + encrypted.byteLength);
    combined.set(versionBytes, 0);
    combined.set(salt, versionBytes.length);
    combined.set(iv, versionBytes.length + salt.length);
    combined.set(new Uint8Array(encrypted), versionBytes.length + salt.length + iv.length);
    
    // Convertir a base64
    const base64 = btoa(String.fromCharCode(...combined));
    return base64;
  } catch (e) {
    console.error('Error cifrando datos:', e);
    throw new Error('Error al cifrar datos');
  }
}

// Descifrar datos
async function decryptData(base64Data, pin) {
  try {
    // Decodificar base64
    const binaryString = atob(base64Data);
    const combined = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      combined[i] = binaryString.charCodeAt(i);
    }
    
    // Extraer versión, salt, IV y datos cifrados
    const versionLength = ENCRYPTION_VERSION.length;
    const saltLength = 16;
    const ivLength = 12;
    
    const version = new TextDecoder().decode(combined.slice(0, versionLength));
    if (version !== ENCRYPTION_VERSION) {
      throw new Error('Versión de cifrado no compatible');
    }
    
    const salt = combined.slice(versionLength, versionLength + saltLength);
    const iv = combined.slice(versionLength + saltLength, versionLength + saltLength + ivLength);
    const encrypted = combined.slice(versionLength + saltLength + ivLength);
    
    const key = await deriveKeyFromPin(pin, salt);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (e) {
    console.error('Error descifrando datos:', e);
    throw new Error('PIN incorrecto o datos corruptos');
  }
}

// Verificar si un archivo está cifrado
function isEncryptedData(data) {
  try {
    const binaryString = atob(data.substring(0, 50)); // Solo verificar inicio
    const combined = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      combined[i] = binaryString.charCodeAt(i);
    }
    const version = new TextDecoder().decode(combined.slice(0, ENCRYPTION_VERSION.length));
    return version === ENCRYPTION_VERSION;
  } catch {
    return false;
  }
}
