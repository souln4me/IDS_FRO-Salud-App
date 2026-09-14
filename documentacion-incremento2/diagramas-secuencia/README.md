# Diagramas de secuencia — Incremento 2

Un archivo `.drawio` por caso de uso, con **una página por diagrama**: el flujo
principal y una página por cada excepción de la ficha. Si el CU tiene varios
actores, el juego completo se repite por actor (igual que en el Incremento 1).
Junto a cada `.drawio` están los PNG de cada página, con el mismo nombre que
usó el Incremento 1 (`CUxx-Principal Actor.png`, `CUxx-Excepción n Actor.png`).

Reglas de notación (las de CU01, CU02, CU20 y CU40 del Incremento 1):

- **Orden de las lifelines:** actor, vista, `C_API_REST` y los demás controladores
  (`C_Seguridad_JWT_BCrypt`, `C_API_Adapter` y las APIs externas), `C_Capa_de_Acceso_a_Datos`,
  `C_MYSQL` y, al final a la derecha, las tablas.
- **Ida y vuelta completa.** Cada llamada baja peldaño a peldaño (actor → vista → API REST →
  capa de datos → MySQL → tabla) y la respuesta vuelve por el mismo camino, una flecha por
  componente. Ningún mensaje salta una lifeline ni llega directo al actor.
- **Las lifelines son las mismas en todas las páginas de un CU.** Si una tabla o componente
  aparece en una sola excepción, igual se dibuja en el flujo principal y en el resto.
- **Solo componentes del Diagrama de Componentes** del Incremento 1. Las APIs externas
  (Brevo, Cloudinary, Transacciones, Bonos Electrónicos) son controladores: van junto a
  `C_API_REST` y `C_API_Adapter`, **antes** de la capa de acceso a datos, y solo el adaptador
  habla con ellas. Las tablas cierran el diagrama por la derecha. Los casos de uso que nacen en
  el servidor (CU69) no llevan actor ni vista: su primera lifeline es `C_API_REST`.
- **Toda página de excepción retoma y completa el flujo principal** y termina en el mismo
  mensaje final que su página Principal.
- **SQL** sin marcadores «?» ni WHERE: solo operación, tabla y columnas
  (`UPDATE Cita SET estado, motivo_cancelacion`). Aplica a las tres tandas.
- Flecha continua = llamada `nombre_en_snake_case(argumentos)`; punteada = retorno `return (...)`;
  bucle = operación interna. Nota amarilla = punto donde ocurre la excepción. Las transacciones
  se muestran como `abrir_transaccion` / `confirmar_transaccion` / `revertir_transaccion`
  que llegan hasta `C_MYSQL` (BEGIN, COMMIT, ROLLBACK).
- El generador verifica todas estas reglas y se detiene si alguna página las incumple.

## Tandas

| Tanda | CUs | Páginas | Estado |
|---|---|---|---|
| 1 · Cuenta, seguridad y perfil | CU06, CU07, CU08, CU09, CU10, CU79 | 72 | Entregada |
| 2 · Gestión de citas | CU17, CU18, CU22, CU76 | 35 | Entregada |
| 3 · Triaje y evaluación | CU27, CU23, CU24, CU77 | 19 | Entregada |
| 4 · Pautas de ejercicio | CU46, CU47, CU48, CU49 | 20 | Entregada |
| 5 · Evidencia de atención | CU39, CU41, CU42, CU43 | 40 | Entregada |
| 6 · Documentos y versionado | CU31, CU33, CU34, CU35 | 29 | Entregada |
| 7 · Bonos, copagos e integración externa | CU66, CU67, CU69, CU71 | 19 | Entregada |
| 8 · Episodio clínico | CU78 | 5 | Entregada |

## Cómo se generan

`generador/motor.py` convierte una descripción corta de cada CU (participantes,
mensajes del flujo principal, excepciones) en el `.drawio` y los PNG. Cada tanda es un archivo `tandaN.py`
y `comun.py` reúne los participantes y los atajos de SQL compartidos. Para regenerar: `python3 generador/tanda1.py`
(necesita Python 3 y el Chromium headless de Playwright para los PNG; sin él
solo produce el `.drawio`).

**Total entregado: 31 casos de uso, 239 páginas.**
