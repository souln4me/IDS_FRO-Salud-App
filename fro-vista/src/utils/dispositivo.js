// Ruta: fro-vista/src/utils/dispositivo.js
//
// Identificador estable de esta instalación de la app (CU08). Sin él, cada
// inicio de sesión desde el mismo teléfono creaba una fila nueva en "Sesiones
// activas", y la lista terminaba llena de entradas repetidas con la misma IP.
// Se genera una vez y sobrevive a cierres de sesión; solo cambia si se
// desinstala la app.

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CLAVE = 'dispositivo_id';

let enMemoria = null;

/** Devuelve (creándolo la primera vez) el identificador de este dispositivo. */
export async function obtenerDispositivoId() {
  if (enMemoria) return enMemoria;

  try {
    let id = await SecureStore.getItemAsync(CLAVE);
    if (!id) {
      // randomUUID no está en todos los motores; el respaldo basta porque solo
      // necesita ser único entre los dispositivos de un mismo usuario.
      id =
        globalThis.crypto?.randomUUID?.() ||
        `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      await SecureStore.setItemAsync(CLAVE, id);
    }
    enMemoria = id;
    return id;
  } catch {
    // Sin almacenamiento seguro se sigue adelante sin identificador: el
    // servidor mantiene el comportamiento antiguo en ese caso.
    return null;
  }
}

/** Nombre legible que el usuario ve en "Sesiones activas". */
export function nombreDispositivo() {
  return Platform.OS === 'ios' ? 'iPhone (app móvil)' : 'Android (app móvil)';
}
