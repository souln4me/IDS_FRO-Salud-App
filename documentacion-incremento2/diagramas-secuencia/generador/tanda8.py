# Tanda 8 — Episodio clinico: CU78.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from motor import generar_cu, chrome_path
from comun import *

CU78 = dict(id='CU78', nombre='Agrupando registros bajo entidad episodio clínico', actores=['Profesional'],
  vistas={'Profesional': 'V_Episodios'},
  participantes=[ACTOR, VISTA, *capa(), *T('Episodio_Clinico', 'Profesional', 'Cita', 'Evolucion_Clinica', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: generar_la_peticion_de_guardado(sesion, pauta o documento)',
    'V ->> V: validar_el_formato_del_archivo_adjunto()',
    'V ->> V: exigir_la_asociacion_con_un_episodio_clinico()',
    f'V -> {API}: GET /clinica/episodio (paciente_id)',
    *leer('obtener_los_episodios_del_paciente(paciente_id)', 'Episodio_Clinico',
          'episodio_clinico_id, motivo_consulta, estado, profesional_id', 'N episodios', 'return (episodios)'),
    f'{API} --> V: return (HTTP 200 OK: episodios disponibles)',
    'V --> A: desplegar_el_selector_de_episodios_de_la_ficha()',
    'A -> V: seleccionar_el_episodio_del_motivo_de_consulta(episodio_clinico_id)',
    f'V -> {API}: POST /clinica/evolucion (episodio_clinico_id, registro)',
    *begin(),
    *leer('verificar_que_el_episodio_sea_propio_y_este_abierto(episodio_clinico_id, usuario_id)', 'Episodio_Clinico',
          'episodio_clinico_id, estado, profesional_id', '1 episodio ABIERTO y propio', 'return (episodio valido)'),
    *actualizar('vincular_la_cita_en_curso_al_episodio(cita_id)', 'Cita', 'episodio_clinico_id'),
    *insertar('persistir_el_registro_bajo_el_episodio(episodio_clinico_id)', 'Evolucion_Clinica',
              ' (contenido, episodio_clinico_id, cita_id, profesional_id)'),
    *insertar('registrar_auditoria(REGISTRO_VINCULADO_A_EPISODIO, episodio_clinico_id)', 'Bitacora_Auditoria'),
    *commit(),
    f'{API} --> V: return (HTTP 201: registro vinculado al episodio)',
    'V --> A: mostrar_el_registro_agrupado_bajo_su_tratamiento()',
  ],
  excepciones={
    1: dict(cortar='validar_el_formato_del_archivo_adjunto', lineas=[
        '! El Profesional adjunta un formato de archivo no soportado',
        'V --> A: rechazar_la_peticion_en_la_vista()',
        'A -> V: convertir_el_archivo_a_un_formato_permitido()'],
        reanudar='validar_el_formato_del_archivo_adjunto'),
    2: dict(cortar='SELECT episodio_clinico_id, motivo_consulta, estado, profesional_id', lineas=[
        *vacio('Episodio_Clinico', '0 episodios del paciente', 'sin episodio clinico'),
        '! El paciente carece de un Episodio Clinico',
        f'{API} --> V: return (HTTP 200 OK: sin episodios)',
        'V --> A: guiar_a_la_creacion_del_episodio_en_la_pestana()',
        'A -> V: instanciar_la_entidad_agrupadora(motivo_consulta)',
        f'V -> {API}: POST /clinica/episodio (motivo_consulta, paciente_id)',
        *leer('verificar_el_perfil_del_profesional(usuario_id)', 'Profesional', 'profesional_id, usuario_id', '1 profesional', 'return (profesional_id)'),
        *insertar('crear_el_episodio_en_estado_abierto(motivo_consulta)', 'Episodio_Clinico',
                  ' (motivo_consulta, estado = ABIERTO, paciente_id, profesional_id)'),
        f'{API} --> V: return (HTTP 201: episodio clinico creado)'],
        reanudar='desplegar_el_selector_de_episodios_de_la_ficha'),
    3: dict(cortar='SELECT episodio_clinico_id, estado, profesional_id', lineas=[
        *vacio('Episodio_Clinico', '1 episodio CERRADO o de otro profesional', 'episodio no vinculable'),
        '! El episodio seleccionado esta cerrado o pertenece a otro profesional',
        *rollback(),
        f'{API} --> V: return (HTTP 409 EPISODIO_CERRADO | 403 EPISODIO_AJENO)',
        'V --> A: bloquear_la_vinculacion_de_nuevos_registros()',
        'A -> V: seleccionar_el_episodio_del_motivo_de_consulta(episodio propio y abierto)'],
        reanudar='POST /clinica/evolucion'),
    4: dict(cortar='INSERT INTO Evolucion_Clinica', lineas=[
        *fallo_bd('Evolucion_Clinica', 'fallo al vincular el registro'),
        '! Fallo de persistencia al vincular el registro con el episodio',
        *rollback(),
        f'{API} --> V: return (HTTP 500: escritura denegada)',
        'V --> A: informar_que_el_registro_no_pudo_vincularse()'],
        reanudar='seleccionar_el_episodio_del_motivo_de_consulta'),
  })

if __name__ == '__main__':
    chrome = chrome_path()
    salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'salida')
    ruta, n = generar_cu(CU78, os.path.join(salida, 'CU78'), chrome=chrome, png=True)
    print(f'CU78: {n} paginas')
