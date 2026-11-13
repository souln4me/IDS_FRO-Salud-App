/**
 * Componente: GPS del Dispositivo
 * Casos de uso: CU39.
 */
// Ruta: fro-vista/src/utils/useReporteUbicacion.js
//
// CU39 (correcciones Inc 4): el día de una visita a domicilio, la app del
// paciente envía sola su ubicación mientras está abierta, sin que tenga que
// apretar nada. El servidor la usa cuando el profesional comienza y finaliza
// la atención (vale 30 minutos). Fuera de esa ventana no pregunta nada ni
// pide permisos: primero consulta si hay una visita cercana.
//
// Expo Go no permite ubicación en segundo plano, por eso solo funciona con
// la app abierta; si no llega, el servidor usa la dirección registrada.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import apiClient from '../api/client';
import { ubicacionActual } from './ubicacion';

import { registrar } from './registroApp';
const CADA_MS = 2 * 60 * 1000;

// CU39 — Validando presencialidad mediante coordenadas GPS
export default function useReporteUbicacion(activo = true) {
  const enCurso = useRef(false);

  useEffect(() => {
    if (!activo) return undefined;

    const reportar = async () => {
      if (enCurso.current || AppState.currentState !== 'active') return;
      enCurso.current = true;
      try {
        const { data } = await apiClient.get('/citas/ubicacion-pendiente');
        const citas = data?.citas || [];
        if (citas.length === 0) return;
        const punto = await ubicacionActual();
        if (!punto) {
          registrar('📍 visita a domicilio hoy, pero no se pudo leer el GPS del teléfono');
          return;
        }
        // Registro de actividad: cuántas visitas, nunca las coordenadas.
        registrar(`📍 ubicación del paciente enviada para ${citas.length} visita(s) a domicilio`);
        await Promise.all(
          citas.map((c) => apiClient.post(`/citas/${c.cita_id}/ubicacion`, punto).catch(() => {}))
        );
      } catch {
        // Sin conexión: se reintenta en la próxima vuelta.
      } finally {
        enCurso.current = false;
      }
    };

    reportar();
    const reloj = setInterval(reportar, CADA_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') reportar();
    });
    return () => {
      clearInterval(reloj);
      suscripcion.remove();
    };
  }, [activo]);
}
