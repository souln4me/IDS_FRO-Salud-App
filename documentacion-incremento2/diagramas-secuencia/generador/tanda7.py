# Tanda 7 — Bonos, copagos e integracion externa: CU66, CU67, CU69, CU71.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from motor import generar_cu, chrome_path
from comun import *

VPAGOS, VAGENDA = 'V_Pagos_Bonos', 'V_Gestion_Agenda'
BONOS, PASARELA = 'C_API_Bonos_Electronicos', 'C_API_Transacciones'

# ──────────────────────────── CU66 ────────────────────────────
CU66 = dict(id='CU66', nombre='Registrando y validando bonos de cobertura', actores=['Paciente'],
  vistas={'Paciente': VPAGOS},
  participantes=[ACTOR, VISTA, *capa(ADP, BONOS), *T('Cita', 'Financiador', 'Parametro_Global', 'Bono', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: seleccionar_financiador_e_ingresar_folio(financiador_id, folio)',
    'V ->> V: validar_el_formato_del_folio()',
    f'V -> {API}: POST /pagos/citas/:id/bono (financiador_id, folio)',
    *leer('verificar_la_cita_del_paciente(cita_id, usuario_id)', 'Cita', 'cita_id, estado, paciente_id', '1 cita agendada o confirmada', 'return (cita)'),
    *leer('verificar_el_convenio_del_financiador(financiador_id)', 'Financiador',
          'financiador_id, nombre_institucion, rut_institucion, convenio_activo', '1 convenio activo', 'return (financiador)'),
    *leer('leer_parametro(ARANCEL_PRESTACION)', 'Parametro_Global', 'clave, valor', 'arancel vigente', 'return (arancel)'),
    f'{API} ->> {API}: encapsular_las_variables_del_payload(folio, rut_institucion, arancel)',
    *externo('validar_el_bono_ante_el_financiador(payload)', BONOS, 'POST /validar-bono (folio, rut_institucion, monto_prestacion)',
             'return (HTTP 200 OK: cobertura y copago)', 'return (bono validado)'),
    *insertar('persistir_el_bono_validado(folio, monto_cobertura, copago)', 'Bono',
              ' (folio, estado_validacion, monto_cobertura, copago, cita_id, financiador_id)'),
    *insertar('registrar_auditoria(BONO_VALIDADO, cita_id, folio)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 201: bono validado con su cobertura y copago)',
    'V --> A: mostrar_la_cobertura_acreditada_y_el_copago()',
  ],
  excepciones={
    1: dict(cortar='validar_el_formato_del_folio', lineas=[
        '! El folio ingresado incumple el formato exigido',
        'V --> A: detener_el_envio_y_renderizar_el_aviso()',
        'A -> V: corregir_el_formato_del_codigo(folio)'],
        reanudar='validar_el_formato_del_folio'),
    2: dict(cortar='POST /validar-bono', lineas=[
        f'{BONOS} --> {ADP}: return (HTTP 401: discrepancia de autenticacion)',
        f'{ADP} --> {API}: return (bono rechazado)',
        '! El Financiador rechaza el bono por discrepancia de autenticacion',
        *insertar('registrar_el_bono_como_no_validado(folio)', 'Bono', ' (folio, estado_validacion = RECHAZADO, cita_id, financiador_id)'),
        f'{API} --> V: return (HTTP 409: bono no validado)',
        'V --> A: informar_el_rechazo_del_financiador()',
        'A ->> A: verificar_el_folio_con_su_institucion()'],
        reanudar='seleccionar_financiador_e_ingresar_folio'),
    3: dict(cortar='POST /validar-bono', lineas=[
        f'{BONOS} --> {ADP}: sin respuesta (se agota el tiempo de espera tras los reintentos)',
        f'{ADP} --> {API}: return (TIEMPO_AGOTADO)',
        '! El Financiador no responde dentro del limite de espera',
        f'{API} --> V: return (HTTP 504: el bono no pudo registrarse)',
        'V --> A: informar_que_el_bono_no_pudo_registrarse()',
        'A ->> A: reintentar_mas_tarde()'],
        reanudar='seleccionar_financiador_e_ingresar_folio'),
    4: dict(cortar='INSERT INTO Bono (folio, estado_validacion, monto_cobertura', lineas=[
        *fallo_bd('Bono', 'rechazo de escritura por bloqueo de tabla'),
        '! Bloqueo de tabla al persistir el bono: se reintenta con retardo progresivo',
        f'{API} ->> {API}: aplicar_retardo_progresivo_y_reintentar()',
        *insertar('persistir_el_bono_validado(folio, monto_cobertura, copago)', 'Bono',
                  ' (folio, estado_validacion, monto_cobertura, copago, cita_id, financiador_id) en el reintento')],
        reanudar='registrar_auditoria(BONO_VALIDADO'),
  })

# ──────────────────────────── CU67 ────────────────────────────
CU67 = dict(id='CU67', nombre='Registrando transacciones y copagos', actores=['Paciente'],
  vistas={'Paciente': VPAGOS},
  participantes=[ACTOR, VISTA, *capa(ADP, PASARELA), *T('Cita', 'Parametro_Global', 'Bono', 'Transaccion', 'Paquete_Sesiones', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: iniciar_el_pago_de_la_cita(cita_id)',
    f'V -> {API}: GET /pagos/resumen',
    *leer('verificar_la_cita_del_paciente(cita_id, usuario_id)', 'Cita', 'cita_id, estado, paciente_id', '1 cita impaga', 'return (cita)'),
    *leer('leer_parametro(ARANCEL_PRESTACION)', 'Parametro_Global', 'clave, valor', 'arancel vigente', 'return (arancel)'),
    *leer('obtener_el_bono_de_la_cita(cita_id)', 'Bono', 'estado_validacion, monto_cobertura, copago', '1 bono validado', 'return (bono)'),
    f'{API} ->> {API}: deducir_la_cobertura_del_bono_o_aplicar_el_arancel_completo()',
    f'{API} --> V: return (HTTP 200 OK: copago exigible)',
    'V --> A: renderizar_el_copago_exigible()',
    'A -> V: emitir_la_instruccion_de_cargo(metodo_de_pago)',
    f'V -> {API}: POST /pagos/citas/:id/pagar (metodo_de_pago)',
    *leer('verificar_que_la_cita_no_este_pagada(cita_id)', 'Transaccion', 'transaccion_id, estado', 'sin transaccion pagada', 'return (sin pago previo)'),
    *externo('cobrar_el_copago(metodo_de_pago, monto)', PASARELA, 'POST /cargos (monto, metodo_de_pago)',
             'return (HTTP 200 OK: cargo aprobado)', 'return (cargo aprobado)'),
    *actualizar('registrar_la_transaccion_en_el_historial(monto, metodo)', 'Transaccion', 'estado, monto, metodo_pago'),
    *insertar('registrar_auditoria(COPAGO_PAGADO, cita_id, monto)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 200 OK: pago registrado)',
    'V --> A: mostrar_el_pago_en_el_historial()',
    'A -> V: adquirir_un_plan_de_sesiones(4, 8 o 12 sesiones)',
    f'V -> {API}: POST /pagos/paquetes (sesiones, metodo_de_pago)',
    *externo('cobrar_el_plan_con_descuento(precio_total)', PASARELA, 'POST /cargos (precio_total)',
             'return (HTTP 200 OK: cargo aprobado)', 'return (cargo aprobado)'),
    *insertar('registrar_el_paquete_activo(sesiones, precio_total)', 'Paquete_Sesiones',
              ' (sesiones_total, estado, precio_total, paciente_id)'),
    *insertar('registrar_auditoria(PAQUETE_ADQUIRIDO, sesiones)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 201: plan activo para el descuento de sesiones)',
    'V --> A: mostrar_el_inventario_de_sesiones_actualizado()',
  ],
  excepciones={
    1: dict(cortar='GET /pagos/resumen', lineas=[
        '! El Paciente pierde conexion con su proveedor de internet',
        f'{API} --> V: return (HTTP 503: sin conexion)',
        'V ->> V: retener_el_estado_de_la_deuda()',
        'V --> A: informar_que_el_flujo_de_pago_no_esta_disponible()',
        'A -> V: recargar_el_flujo_de_pago()'],
        reanudar='GET /pagos/resumen'),
    2: dict(cortar='deducir_la_cobertura_del_bono_o_aplicar_el_arancel_completo', lineas=[
        '! El aporte previsional informado supera la tarifa de la prestacion',
        *insertar('registrar_la_traza_tecnica(COBERTURA_SOBRE_ARANCEL)', 'Bitacora_Auditoria'),
        f'{API} --> V: return (HTTP 409 FLUJO_CONGELADO)',
        'V --> A: informar_que_el_cobro_quedo_congelado_para_revision()',
        'A ->> A: contactar_a_la_administracion()'],
        reanudar='iniciar_el_pago_de_la_cita'),
    3: dict(cortar='POST /cargos (monto, metodo_de_pago)', lineas=[
        f'{PASARELA} --> {ADP}: return (HTTP 402: credencial rechazada por la entidad bancaria)',
        f'{ADP} --> {API}: return (pago rechazado)',
        '! La entidad bancaria rechaza la credencial del Paciente',
        *insertar('registrar_el_intento_fallido(PAGO_RECHAZADO)', 'Bitacora_Auditoria'),
        f'{API} --> V: return (HTTP 402 PAGO_RECHAZADO)',
        'V --> A: informar_el_rechazo_del_medio_de_pago()',
        'A -> V: emitir_la_instruccion_de_cargo(otro metodo_de_pago)'],
        reanudar='POST /pagos/citas/:id/pagar'),
    4: dict(cortar='UPDATE Transaccion SET estado, monto, metodo_pago', lineas=[
        *fallo_bd('Transaccion', 'sin confirmacion de la pasarela tras el descuento de fondos'),
        '! No llega la confirmacion de la pasarela: la transaccion queda en transito',
        f'{API} ->> {API}: dejar_la_transaccion_en_transito_para_conciliar()',
        *actualizar('conciliar_la_transaccion_sin_volver_a_cobrar()', 'Transaccion', 'estado, monto, metodo_pago')],
        reanudar='registrar_auditoria(COPAGO_PAGADO'),
  })

# ──────────────────────────── CU69 ────────────────────────────
# CU del sistema: no hay actor, el flujo nace en C_API_REST (igual que el CU68
# del Incremento 1) y el Proveedor Externo es la ultima lifeline.
CU69 = dict(id='CU69', nombre='Registrando en bitácora de transacciones externas', actores=['Proveedor Externo'],
  participantes=[*capa(ADP, 'Proveedor_Externo'), *T('Bitacora_Auditoria')],
  principal=[
    f'{API} -> {ADP}: solicitar_transaccion_externa(proveedor, operacion, payload)',
    f'{ADP} ->> {ADP}: capturar_metadatos_e_iniciar_el_cronometro()',
    f'{ADP} -> Proveedor_Externo: POST peticion_adaptada(payload_enviado)',
    'Proveedor_Externo --> C_API_Adapter: return (HTTP 200 OK: payload_recibido)',
    f'{ADP} ->> {ADP}: calcular_la_latencia_y_los_intentos()',
    f'{ADP} -> {DAO}: registrar_el_evento_de_integracion(proveedor, operacion, estado, codigo, latencia, intentos, payloads)',
    *ins('Bitacora_Auditoria', ' (accion = INTEGRACION_EXTERNA, datos_adicionales)'),
    f'{DAO} --> {ADP}: return (registro consolidado)',
    f'{ADP} --> {API}: return (payload interno transformado)',
  ],
  excepciones={
    1: dict(cortar='POST peticion_adaptada', lineas=[
        'Proveedor_Externo --> C_API_Adapter: return (HTTP 401: falta la credencial de seguridad)',
        '! El Proveedor Externo rechaza la peticion por falta de credencial',
        f'{ADP} -> {DAO}: registrar_la_incidencia(CREDENCIAL_AUSENTE)',
        *ins('Bitacora_Auditoria', ' (accion = INTEGRACION_EXTERNA, estado = RECHAZADA)'),
        f'{DAO} --> {ADP}: return (incidencia registrada)',
        f'{ADP} -> {DAO}: alertar_al_administrador_para_actualizar_credenciales()',
        *ins('Notificacion', ' (aviso al administrador)'),
        f'{DAO} --> {ADP}: return (alerta enviada)'],
        reanudar='POST peticion_adaptada'),
    2: dict(cortar='POST peticion_adaptada', lineas=[
        'Proveedor_Externo --> C_API_Adapter: sin respuesta (supera el umbral de tiempo de espera)',
        '! El Proveedor Externo no responde dentro del umbral definido',
        f'{ADP} ->> {ADP}: detener_la_escucha()',
        f'{ADP} -> {DAO}: almacenar_la_incidencia(LATENCIA_CRITICA)',
        *ins('Bitacora_Auditoria', ' (accion = INTEGRACION_EXTERNA, estado = LATENCIA_CRITICA)'),
        f'{DAO} --> {ADP}: return (incidencia registrada)'],
        reanudar='POST peticion_adaptada'),
    3: dict(cortar='INSERT INTO Bitacora_Auditoria (accion = INTEGRACION_EXTERNA, datos_adicionales)', lineas=[
        f'Bitacora_Auditoria --> {SQL}: error de escritura',
        f'{SQL} --> {DAO}: throw (SQLException)',
        f'{DAO} --> {ADP}: return (Fallo_Persistencia)',
        '! Falla la persistencia del registro: la operacion principal continua',
        f'{ADP} ->> {ADP}: informar_el_fallo_en_el_log_del_servidor()',
        f'{ADP} -> {DAO}: notificar_la_inconsistencia_tecnica_al_administrador()',
        *ins('Notificacion', ' (aviso al administrador)'),
        f'{DAO} --> {ADP}: return (alerta enviada)'],
        reanudar='return (payload interno transformado)'),
  })
CU69['participantes'] = [*capa(ADP, 'Proveedor_Externo'), *T('Bitacora_Auditoria', 'Notificacion')]

# ──────────────────────────── CU71 ────────────────────────────
CU71 = dict(id='CU71', nombre='Sincronizando y validando sesiones bonificables', actores=['Profesional'],
  vistas={'Profesional': VAGENDA},
  participantes=[ACTOR, VISTA, *capa(), *T('Paquete_Sesiones', 'Cita', 'Bono')],
  principal=[
    'A -> V: solicitar_la_cuadratura_de_coberturas(paciente_id)',
    f'V -> {API}: GET /pagos/cuadratura/:paciente_id',
    *leer('sumar_las_sesiones_autorizadas(paciente_id)', 'Paquete_Sesiones',
          'SUM(sesiones_total) AS total, SUM(sesiones_usadas) AS usadas', 'sesiones autorizadas', 'return (autorizadas)'),
    *leer('contar_las_sesiones_realizadas(paciente_id, profesional_id)', 'Cita', 'COUNT(*) AS realizadas', 'sesiones realizadas', 'return (realizadas)'),
    *leer('revisar_los_bonos_por_cita(paciente_id)', 'Bono', 'folio, estado_validacion, monto_cobertura, copago', 'bonos por cita', 'return (bonos)'),
    f'{API} ->> {API}: contrastar_lo_ejecutado_con_lo_autorizado()',
    f'{API} --> V: return (HTTP 200 OK: resumen y alertas de cuadratura)',
    'V --> A: mostrar_el_resumen_y_las_alertas()',
  ],
  excepciones={
    1: dict(cortar='contrastar_lo_ejecutado_con_lo_autorizado', lineas=[
        '! Hay sesiones realizadas sin bono electronico registrado',
        f'{API} ->> {API}: listar_las_sesiones_sin_bono_como_alerta()',
        f'{API} --> V: return (HTTP 200 OK: alerta de sesiones sin bono)',
        'V --> A: mostrar_la_alerta_de_sesiones_sin_bono()',
        'A ->> A: solicitar_al_paciente_el_registro_del_bono()'],
        reanudar='solicitar_la_cuadratura_de_coberturas'),
    2: dict(cortar='contrastar_lo_ejecutado_con_lo_autorizado', lineas=[
        '! Las sesiones ejecutadas exceden las autorizadas',
        f'{API} ->> {API}: emitir_la_alerta_por_discrepancia_de_saldo()',
        f'{API} --> V: return (HTTP 200 OK: alerta por discrepancia de saldo)',
        'V --> A: mostrar_la_discrepancia_de_saldo()',
        'A ->> A: solicitar_al_paciente_un_nuevo_plan_o_bono()'],
        reanudar='solicitar_la_cuadratura_de_coberturas'),
    3: dict(cortar='mostrar_el_resumen_y_las_alertas', lineas=[
        '! El Profesional descarta la alerta de cuadratura',
        'A -> V: descartar_la_alerta()',
        'V ->> V: ocultarla_hasta_la_proxima_consulta()',
        'V --> A: continuar_con_la_atencion()'],
        reanudar='solicitar_la_cuadratura_de_coberturas'),
    4: dict(cortar='SELECT SUM(sesiones_total) AS total, SUM(sesiones_usadas) AS usadas', lineas=[
        *fallo_bd('Paquete_Sesiones', 'perdida de conexion con la base de datos'),
        '! Se pierde la conexion con la base de datos durante la sincronizacion',
        f'{API} --> V: return (HTTP 500 SINCRONIZACION_PENDIENTE)',
        'V --> A: informar_que_la_sincronizacion_quedo_pendiente()',
        'A ->> A: reintentar_la_operacion()'],
        reanudar='solicitar_la_cuadratura_de_coberturas'),
  })

if __name__ == '__main__':
    chrome = chrome_path()
    salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'salida')
    total = 0
    for cu in [CU66, CU67, CU69, CU71]:
        ruta, n = generar_cu(cu, os.path.join(salida, cu['id']), chrome=chrome, png=True)
        total += n; print(f"{cu['id']}: {n} paginas")
    print('total paginas', total)
