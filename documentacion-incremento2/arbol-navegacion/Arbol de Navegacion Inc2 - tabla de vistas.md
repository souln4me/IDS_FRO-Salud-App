# Árbol de Navegación — Incremento 2

Texto y tabla listos para la sección 5.1 del informe. La figura es
`Arbol de Navegacion Inc2.png` (alta resolución) y su fuente editable es
`Arbol de Navegacion Inc2.drawio`.

## Texto propuesto para la sección

A continuación se presenta el Árbol de Navegación correspondiente al Incremento 2 de FRO Salud. Como se detalla en la Figura 5.1, el diagrama extiende el árbol del Incremento 1 con las vistas incorporadas en este incremento y organiza las interfaces autenticadas según el rol (CU79): Paciente, Profesional y Administrador. Las vistas Seguridad de la Cuenta, Evidencia de Sesión y Visor de Documento son compartidas y se representan bajo cada flujo que las utiliza. La Ficha Clínica se descompone en cinco pestañas (Historial, Anamnesis, Episodios, Sesión Clínica y Pautas), cada una con sus propios casos de uso.

Para examinar el diagrama con total claridad, favor consultar el archivo de alta resolución "Árbol de Navegación Inc2.png" adjunto a esta entrega.

## Tabla de vistas y casos de uso

Estado: **Inc 1** = ya existía; **Inc 2** = nueva; **Inc 1 → Inc 2** = existía y ahora suma CU.

### Acceso (sin sesión)

| Vista | CUs | Funcionalidad | Estado |
|---|---|---|---|
| V_Registro | CU01, CU02, CU03 | Registrar paciente, registrar profesional, controlar unicidad | Inc 1 |
| V_Activacion_Cuenta | CU04 | Verificar identidad por OTP | Inc 1 |
| V_Inicio_Sesion | CU05, CU79 | Autenticar usuario y derivar a la pila de su rol | Inc 1 → Inc 2 |
| V_Recuperar_Contrasena | CU06, CU07 | Solicitar restablecimiento y cambiar contraseña con código | Inc 2 |

### Transversales (todos los roles)

| Vista | CUs | Funcionalidad | Estado |
|---|---|---|---|
| V_Seguridad_Cuenta | CU07, CU08, CU09 | Sesiones activas por dispositivo, cambio de contraseña, privacidad de contacto (CU09 solo paciente) | Inc 2 |
| V_Panel_Acceso_Restringido | CU12 | Control de acceso RBAC | Inc 1 |
| V_Consola_Auditoria | CU13 | Bitácora de auditoría | Inc 1 |

### Paciente

| Vista | CUs | Funcionalidad | Estado |
|---|---|---|---|
| V_Inicio_Paciente | — | Panel de entrada del paciente (accesos a citas, entrevista, ejercicios, pagos, documentos y seguridad) | Inc 2 |
| V_Mis_Citas | CU18, CU20, CU22 | Listado de citas, confirmar, cancelar y ver trazabilidad | Inc 2 |
| V_Agendamiento_Cita | CU14, CU15, CU17 | Buscar/seleccionar cita, controlar concurrencia, reprogramar | Inc 1 → Inc 2 |
| V_Evidencia_Sesion | CU39, CU43 | Marca GPS de presencialidad y evidencia de teleconsulta | Inc 2 |
| V_Entrevista_Previa | CU23, CU24, CU27 | Disclaimer legal, triaje automatizado y traspaso a la ficha | Inc 2 |
| V_Mis_Ejercicios | CU48, CU49 | Cumplimiento diario de la pauta y control de vigencia | Inc 2 |
| V_Pagos_Bonos | CU66, CU67, CU68, CU69, CU70 | Bonos, copagos y paquetes, con la capa de proveedor externo | Inc 2 |
| V_Mis_Documentos | CU35 | Repositorio del paciente | Inc 2 |
| V_Visor_Documento | CU35 | Visor embebido (imagen, PDF, DOCX, video) | Inc 2 |

### Profesional

| Vista | CUs | Funcionalidad | Estado |
|---|---|---|---|
| V_Gestion_Profesional | CU11 | Panel del profesional (pacientes asignados) | Inc 1 |
| V_Mi_Jornada | CU11 | Agenda del día con acceso directo a la ficha | Inc 2 |
| V_Gestion_Disponibilidad | CU16 | Restringir disponibilidad | Inc 1 |
| V_Mi_Perfil_Publico | CU10 | Catálogo de perfil profesional | Inc 2 |
| V_Ficha_Clinica | CU28 | Consolidar ficha clínica (contenedor de pestañas) | Inc 1 |
| V_Gestion_Agenda (pestaña Historial) | CU18, CU20, CU22, CU31, CU38, CU41, CU71, CU76 | Transiciones de la cita, marcas temporales, validación multi-factor, correcciones versionadas, cuadratura de coberturas | Inc 1 → Inc 2 |
| V_Anamnesis (pestaña) | CU29, CU77 | Antecedentes con plantilla dinámica | Inc 2 |
| V_Episodios (pestaña) | CU78 | Episodios clínicos (crear, seleccionar, cerrar) | Inc 2 |
| V_Atencion_Clinica (pestaña Sesión Clínica) | CU30, CU32, CU36, CU40 | Intervención, objetivos, inalterabilidad y firma digital | Inc 1 |
| V_Pautas (pestaña) | CU46, CU47, CU49 | Prescripción de pautas con material de biblioteca | Inc 2 |
| V_Evidencia_Sesion | CU39, CU43 | Marca GPS y evidencia de teleconsulta del profesional | Inc 2 |
| V_Firma_Conformidad | CU42 | Firma manuscrita del paciente en el dispositivo del profesional | Inc 2 |
| V_Documentos_Paciente | CU33, CU34, CU35 | Subir, categorizar y abrir documentos del paciente | Inc 2 |
| V_Visor_Documento | CU35 | Visor embebido | Inc 2 |

### Administrador

| Vista | CUs | Funcionalidad | Estado |
|---|---|---|---|
| V_Gestion_Parametros | CU16, CU59 | Parámetros globales y restricción administrativa de disponibilidad | Inc 1 → Inc 2 |
| V_Sesiones_Suspendidas | CU41 | Bandeja de sesiones derivadas por discrepancias multi-factor | Inc 2 |

## Diferencias respecto a la tabla del Incremento 1

- **V_Gestion_Agenda** deja de ser una pantalla propia: en la app es la pestaña Historial de la Ficha Clínica (profesional) y, para el paciente, Mis Citas.
- **V_Atencion_Clinica** es la pestaña Sesión Clínica; CU29 (anamnesis) y CU38 (marcas temporales) se mueven a sus pestañas reales (Anamnesis e Historial).
- **V_Inicio_Sesion** suma CU79 porque es donde la aplicación decide qué pila de pantallas cargar según el rol.
- **V_Gestion_Parametros** suma CU16: el administrador también restringe disponibilidad desde su panel.
- Sin vista propia (se ejecutan en el servidor o en la capa adaptadora): CU03, CU13, CU15, CU24, CU49, CU68, CU69, CU70. Se muestran como funcionalidades de la vista que los dispara, igual que en el Incremento 1.
