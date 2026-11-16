CREATE DATABASE  IF NOT EXISTS "defaultdb" /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `defaultdb`;
-- MySQL dump 10.13  Distrib 8.0.31, for Win64 (x86_64)
--
-- Host: frosalud-app-frosalud-app.i.aivencloud.com    Database: defaultdb
-- ------------------------------------------------------
-- Server version	8.4.8

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '2921da0c-9e8a-11f1-9984-865b45931b3e:1-192,
a8b332f6-bb59-11f1-b5e3-9e3d656a0dbb:1-2344,
e1e233db-a020-11f1-9951-225b575a4f73:1-3584';

--
-- Table structure for table `Alerta_Clinica`
--

DROP TABLE IF EXISTS `Alerta_Clinica`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Alerta_Clinica` (
  `alerta_clinica_id` int NOT NULL AUTO_INCREMENT,
  `tipo` varchar(40) NOT NULL,
  `severidad` varchar(20) NOT NULL,
  `motivo` varchar(255) NOT NULL,
  `datos` json DEFAULT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'ABIERTA',
  `momento_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `momento_revision` timestamp NULL DEFAULT NULL,
  `paciente_id` int NOT NULL,
  `profesional_id` int DEFAULT NULL,
  `reporte_sintoma_id` int DEFAULT NULL,
  PRIMARY KEY (`alerta_clinica_id`),
  KEY `paciente_id` (`paciente_id`),
  KEY `profesional_id` (`profesional_id`),
  KEY `reporte_sintoma_id` (`reporte_sintoma_id`),
  CONSTRAINT `Alerta_Clinica_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `Alerta_Clinica_ibfk_2` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`),
  CONSTRAINT `Alerta_Clinica_ibfk_3` FOREIGN KEY (`reporte_sintoma_id`) REFERENCES `Reporte_Sintoma` (`reporte_sintoma_id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Area_Soporte_Operador`
--

DROP TABLE IF EXISTS `Area_Soporte_Operador`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Area_Soporte_Operador` (
  `usuario_id` int NOT NULL,
  `categoria` varchar(50) NOT NULL,
  PRIMARY KEY (`usuario_id`,`categoria`),
  CONSTRAINT `Area_Soporte_Operador_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Bitacora_Auditoria`
--

DROP TABLE IF EXISTS `Bitacora_Auditoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Bitacora_Auditoria` (
  `bitacora_auditoria_id` int NOT NULL AUTO_INCREMENT,
  `accion` varchar(50) NOT NULL,
  `entidad_afectada` varchar(50) DEFAULT NULL,
  `ip_origen` varchar(45) DEFAULT NULL,
  `momento_evento` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `datos_adicionales` json DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  PRIMARY KEY (`bitacora_auditoria_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `Bitacora_Auditoria_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2221 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Bloqueo_Agenda`
--

DROP TABLE IF EXISTS `Bloqueo_Agenda`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Bloqueo_Agenda` (
  `bloqueo_id` int NOT NULL AUTO_INCREMENT,
  `fecha_inicio` datetime NOT NULL,
  `fecha_fin` datetime NOT NULL,
  `motivo` text NOT NULL,
  `profesional_id` int NOT NULL,
  PRIMARY KEY (`bloqueo_id`),
  KEY `profesional_id` (`profesional_id`),
  CONSTRAINT `Bloqueo_Agenda_ibfk_1` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Bono`
--

DROP TABLE IF EXISTS `Bono`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Bono` (
  `bono_id` int NOT NULL AUTO_INCREMENT,
  `folio` varchar(50) DEFAULT NULL,
  `monto_cobertura` int NOT NULL,
  `copago` int NOT NULL,
  `estado_validacion` varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  `payload_respuesta` json DEFAULT NULL,
  `cita_id` int NOT NULL,
  `financiador_id` int DEFAULT NULL,
  `financiador_manual` varchar(100) DEFAULT NULL,
  `registrado_por_usuario_id` int DEFAULT NULL,
  `momento_registro_manual` timestamp NULL DEFAULT NULL,
  `regularizado_en` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`bono_id`),
  UNIQUE KEY `cita_id` (`cita_id`),
  UNIQUE KEY `folio` (`folio`),
  KEY `financiador_id` (`financiador_id`),
  KEY `fk_bono_registrado_por` (`registrado_por_usuario_id`),
  CONSTRAINT `Bono_ibfk_1` FOREIGN KEY (`cita_id`) REFERENCES `Cita` (`cita_id`),
  CONSTRAINT `Bono_ibfk_2` FOREIGN KEY (`financiador_id`) REFERENCES `Financiador` (`financiador_id`),
  CONSTRAINT `fk_bono_registrado_por` FOREIGN KEY (`registrado_por_usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Cita`
--

DROP TABLE IF EXISTS `Cita`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Cita` (
  `cita_id` int NOT NULL AUTO_INCREMENT,
  `fecha_hora_inicio` timestamp NOT NULL,
  `fecha_hora_fin` timestamp NOT NULL,
  `checkin_profesional` timestamp NULL DEFAULT NULL,
  `checkin_paciente` timestamp NULL DEFAULT NULL,
  `estado` varchar(30) NOT NULL DEFAULT 'AGENDADA',
  `motivo_cancelacion` varchar(255) DEFAULT NULL,
  `coordenadas_gps_paciente` varchar(100) DEFAULT NULL,
  `coordenadas_gps_profesional` varchar(100) DEFAULT NULL,
  `firma_conformidad_url` varchar(255) DEFAULT NULL,
  `metadatos_teleconsulta` json DEFAULT NULL,
  `paciente_id` int NOT NULL,
  `profesional_id` int NOT NULL,
  `sede_id` int NOT NULL,
  `modalidad` enum('DOMICILIO','ONLINE') DEFAULT NULL,
  `evidencia_presencial` json DEFAULT NULL,
  `firma_conformidad_datos` json DEFAULT NULL,
  `sesion_certificada_en` datetime DEFAULT NULL,
  `certificacion_tipo` varchar(20) DEFAULT NULL,
  `episodio_clinico_id` int DEFAULT NULL,
  `sesion_suspendida_en` datetime DEFAULT NULL,
  `motivo_suspension` json DEFAULT NULL,
  `documentacion_pendiente` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`cita_id`),
  KEY `paciente_id` (`paciente_id`),
  KEY `profesional_id` (`profesional_id`),
  KEY `sede_id` (`sede_id`),
  KEY `fk_cita_episodio` (`episodio_clinico_id`),
  CONSTRAINT `Cita_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `Cita_ibfk_2` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`),
  CONSTRAINT `Cita_ibfk_3` FOREIGN KEY (`sede_id`) REFERENCES `Sede` (`sede_id`),
  CONSTRAINT `fk_cita_episodio` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`)
) ENGINE=InnoDB AUTO_INCREMENT=94 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Comuna`
--

DROP TABLE IF EXISTS `Comuna`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Comuna` (
  `comuna_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  PRIMARY KEY (`comuna_id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Contacto_Emergencia`
--

DROP TABLE IF EXISTS `Contacto_Emergencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Contacto_Emergencia` (
  `contacto_emergencia_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `telefono` varchar(20) NOT NULL,
  `parentesco` varchar(50) NOT NULL,
  PRIMARY KEY (`contacto_emergencia_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Derivacion_Interna`
--

DROP TABLE IF EXISTS `Derivacion_Interna`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Derivacion_Interna` (
  `derivacion_interna_id` int NOT NULL AUTO_INCREMENT,
  `estado` varchar(20) NOT NULL,
  `justificacion` varchar(255) NOT NULL,
  `momento_creacion` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `episodio_clinico_id` int NOT NULL,
  `profesional_origen_id` int NOT NULL,
  `profesional_destino_id` int NOT NULL,
  `momento_respuesta` timestamp NULL DEFAULT NULL,
  `comentario_respuesta` varchar(255) DEFAULT NULL,
  `momento_cierre` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`derivacion_interna_id`),
  KEY `episodio_clinico_id` (`episodio_clinico_id`),
  KEY `profesional_origen_id` (`profesional_origen_id`),
  KEY `profesional_destino_id` (`profesional_destino_id`),
  CONSTRAINT `Derivacion_Interna_ibfk_1` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`),
  CONSTRAINT `Derivacion_Interna_ibfk_2` FOREIGN KEY (`profesional_origen_id`) REFERENCES `Profesional` (`profesional_id`),
  CONSTRAINT `Derivacion_Interna_ibfk_3` FOREIGN KEY (`profesional_destino_id`) REFERENCES `Profesional` (`profesional_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Disclaimer`
--

DROP TABLE IF EXISTS `Disclaimer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Disclaimer` (
  `disclaimer_id` int NOT NULL AUTO_INCREMENT,
  `momento_aceptacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `version_disclaimer` varchar(20) NOT NULL,
  `paciente_id` int NOT NULL,
  PRIMARY KEY (`disclaimer_id`),
  KEY `paciente_id` (`paciente_id`),
  CONSTRAINT `Disclaimer_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`)
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Dispositivo_Push`
--

DROP TABLE IF EXISTS `Dispositivo_Push`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Dispositivo_Push` (
  `dispositivo_push_id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(255) NOT NULL,
  `plataforma` varchar(20) NOT NULL DEFAULT 'DESCONOCIDA',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `momento_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int NOT NULL,
  PRIMARY KEY (`dispositivo_push_id`),
  UNIQUE KEY `token` (`token`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `Dispositivo_Push_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Documento_Clinico`
--

DROP TABLE IF EXISTS `Documento_Clinico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Documento_Clinico` (
  `documento_id` int NOT NULL AUTO_INCREMENT,
  `nombre_original` varchar(255) NOT NULL,
  `categoria` varchar(40) NOT NULL DEFAULT 'SIN_CLASIFICAR',
  `formato` varchar(10) NOT NULL,
  `tamano_bytes` int NOT NULL,
  `tipo_recurso` varchar(10) NOT NULL,
  `url_publica` varchar(500) NOT NULL,
  `public_id_cloud` varchar(255) NOT NULL,
  `fecha_carga` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `paciente_id` int NOT NULL,
  `episodio_clinico_id` int DEFAULT NULL,
  `profesional_id` int NOT NULL,
  `paginas` int DEFAULT NULL,
  PRIMARY KEY (`documento_id`),
  KEY `paciente_id` (`paciente_id`),
  KEY `episodio_clinico_id` (`episodio_clinico_id`),
  KEY `profesional_id` (`profesional_id`),
  CONSTRAINT `Documento_Clinico_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `Documento_Clinico_ibfk_2` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`),
  CONSTRAINT `Documento_Clinico_ibfk_3` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Episodio_Clinico`
--

DROP TABLE IF EXISTS `Episodio_Clinico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Episodio_Clinico` (
  `episodio_clinico_id` int NOT NULL AUTO_INCREMENT,
  `motivo_consulta` varchar(255) NOT NULL,
  `fecha_inicio` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_terminado` timestamp NULL DEFAULT NULL,
  `estado` varchar(255) DEFAULT 'ABIERTO',
  `paciente_id` int DEFAULT NULL,
  `profesional_id` int DEFAULT NULL,
  `preparacion_alta_en` timestamp NULL DEFAULT NULL,
  `pautas_continuidad` text,
  `informe_alta_documento_id` int DEFAULT NULL,
  `informe_alta_emitido_en` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`episodio_clinico_id`),
  KEY `paciente_id` (`paciente_id`),
  KEY `profesional_id` (`profesional_id`),
  KEY `fk_episodio_informe_alta` (`informe_alta_documento_id`),
  CONSTRAINT `Episodio_Clinico_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `Episodio_Clinico_ibfk_2` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`),
  CONSTRAINT `fk_episodio_informe_alta` FOREIGN KEY (`informe_alta_documento_id`) REFERENCES `Documento_Clinico` (`documento_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Especialidad`
--

DROP TABLE IF EXISTS `Especialidad`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Especialidad` (
  `especialidad_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text NOT NULL,
  PRIMARY KEY (`especialidad_id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Evaluacion_Satisfaccion`
--

DROP TABLE IF EXISTS `Evaluacion_Satisfaccion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Evaluacion_Satisfaccion` (
  `evaluacion_satisfaccion_id` int NOT NULL AUTO_INCREMENT,
  `puntuacion` tinyint DEFAULT NULL,
  `resena` varchar(300) DEFAULT NULL,
  `estado_moderacion` varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  `motivo_rechazo` varchar(255) DEFAULT NULL,
  `moderador_id` int DEFAULT NULL,
  `momento_moderacion` timestamp NULL DEFAULT NULL,
  `momento_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cita_id` int DEFAULT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'SESION',
  `satisfecho` tinyint(1) DEFAULT NULL,
  `episodio_clinico_id` int DEFAULT NULL,
  `profesional_id` int DEFAULT NULL,
  PRIMARY KEY (`evaluacion_satisfaccion_id`),
  UNIQUE KEY `cita_id` (`cita_id`),
  UNIQUE KEY `uq_eval_episodio` (`episodio_clinico_id`),
  KEY `fk_evaluacion_moderador` (`moderador_id`),
  KEY `fk_eval_profesional` (`profesional_id`),
  CONSTRAINT `Evaluacion_Satisfaccion_ibfk_1` FOREIGN KEY (`cita_id`) REFERENCES `Cita` (`cita_id`),
  CONSTRAINT `fk_eval_episodio` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`),
  CONSTRAINT `fk_eval_profesional` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`),
  CONSTRAINT `fk_evaluacion_moderador` FOREIGN KEY (`moderador_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Evento_Critico`
--

DROP TABLE IF EXISTS `Evento_Critico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Evento_Critico` (
  `evento_critico_id` int NOT NULL AUTO_INCREMENT,
  `origen` varchar(20) NOT NULL,
  `entidad` varchar(50) NOT NULL,
  `entidad_id` int DEFAULT NULL,
  `termino` varchar(80) NOT NULL,
  `terminos` json DEFAULT NULL,
  `extracto` varchar(300) DEFAULT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  `momento_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `momento_acuse` timestamp NULL DEFAULT NULL,
  `usuario_origen_id` int DEFAULT NULL,
  `paciente_id` int DEFAULT NULL,
  `acusado_por` int DEFAULT NULL,
  PRIMARY KEY (`evento_critico_id`),
  KEY `usuario_origen_id` (`usuario_origen_id`),
  KEY `paciente_id` (`paciente_id`),
  KEY `acusado_por` (`acusado_por`),
  KEY `idx_evento_critico_estado` (`estado`,`momento_creacion`),
  CONSTRAINT `Evento_Critico_ibfk_1` FOREIGN KEY (`usuario_origen_id`) REFERENCES `Usuario` (`usuario_id`),
  CONSTRAINT `Evento_Critico_ibfk_2` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `Evento_Critico_ibfk_3` FOREIGN KEY (`acusado_por`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Evolucion_Clinica`
--

DROP TABLE IF EXISTS `Evolucion_Clinica`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Evolucion_Clinica` (
  `Evolucion_clinica_id` int NOT NULL AUTO_INCREMENT,
  `inalterable` tinyint(1) DEFAULT '0',
  `hora_firma_digital` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `firma_digital` varchar(255) DEFAULT NULL,
  `porcentaje_objetivo` tinyint DEFAULT NULL,
  `respuesta_fisiologica` text,
  `tecnicas_aplicadas` text,
  `episodio_clinico_id` int NOT NULL,
  `profesional_id` int NOT NULL,
  PRIMARY KEY (`Evolucion_clinica_id`),
  KEY `episodio_clinico_id` (`episodio_clinico_id`),
  KEY `profesional_id` (`profesional_id`),
  CONSTRAINT `Evolucion_Clinica_ibfk_1` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`),
  CONSTRAINT `Evolucion_Clinica_ibfk_2` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Evolucion_Version`
--

DROP TABLE IF EXISTS `Evolucion_Version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Evolucion_Version` (
  `version_id` int NOT NULL AUTO_INCREMENT,
  `numero_version` int NOT NULL,
  `texto_correccion` text NOT NULL,
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `evolucion_clinica_id` int NOT NULL,
  `profesional_id` int NOT NULL,
  PRIMARY KEY (`version_id`),
  KEY `evolucion_clinica_id` (`evolucion_clinica_id`),
  KEY `profesional_id` (`profesional_id`),
  CONSTRAINT `Evolucion_Version_ibfk_1` FOREIGN KEY (`evolucion_clinica_id`) REFERENCES `Evolucion_Clinica` (`Evolucion_clinica_id`),
  CONSTRAINT `Evolucion_Version_ibfk_2` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Ficha_Alergia`
--

DROP TABLE IF EXISTS `Ficha_Alergia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Ficha_Alergia` (
  `ficha_clinica_id` int NOT NULL,
  `alergia` varchar(100) NOT NULL,
  PRIMARY KEY (`ficha_clinica_id`,`alergia`),
  CONSTRAINT `Ficha_Alergia_ibfk_1` FOREIGN KEY (`ficha_clinica_id`) REFERENCES `Ficha_Clinica` (`ficha_clinica_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Ficha_Antecedente_Patologico`
--

DROP TABLE IF EXISTS `Ficha_Antecedente_Patologico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Ficha_Antecedente_Patologico` (
  `ficha_clinica_id` int NOT NULL,
  `antecedente` varchar(255) NOT NULL,
  PRIMARY KEY (`ficha_clinica_id`,`antecedente`),
  CONSTRAINT `Ficha_Antecedente_Patologico_ibfk_1` FOREIGN KEY (`ficha_clinica_id`) REFERENCES `Ficha_Clinica` (`ficha_clinica_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Ficha_Antecedente_Quirurgico`
--

DROP TABLE IF EXISTS `Ficha_Antecedente_Quirurgico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Ficha_Antecedente_Quirurgico` (
  `ficha_clinica_id` int NOT NULL,
  `antecedente` varchar(255) NOT NULL,
  PRIMARY KEY (`ficha_clinica_id`,`antecedente`),
  CONSTRAINT `Ficha_Antecedente_Quirurgico_ibfk_1` FOREIGN KEY (`ficha_clinica_id`) REFERENCES `Ficha_Clinica` (`ficha_clinica_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Ficha_Clinica`
--

DROP TABLE IF EXISTS `Ficha_Clinica`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Ficha_Clinica` (
  `ficha_clinica_id` int NOT NULL AUTO_INCREMENT,
  `ultima_actualizacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `anamnesis` text NOT NULL,
  `plantilla_especialidad` varchar(100) NOT NULL,
  `paciente_id` int NOT NULL,
  PRIMARY KEY (`ficha_clinica_id`),
  UNIQUE KEY `paciente_id` (`paciente_id`),
  CONSTRAINT `Ficha_Clinica_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Financiador`
--

DROP TABLE IF EXISTS `Financiador`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Financiador` (
  `financiador_id` int NOT NULL AUTO_INCREMENT,
  `nombre_institucion` varchar(100) NOT NULL,
  `rut_institucion` varchar(12) NOT NULL,
  `convenio_activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`financiador_id`),
  UNIQUE KEY `nombre_institucion` (`nombre_institucion`),
  UNIQUE KEY `rut_institucion` (`rut_institucion`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Indicador_Adherencia`
--

DROP TABLE IF EXISTS `Indicador_Adherencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Indicador_Adherencia` (
  `indicador_adherencia_id` int NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `porcentaje` tinyint NOT NULL,
  `tareas_programadas` int NOT NULL,
  `tareas_cumplidas` int NOT NULL,
  `momento_calculo` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `paciente_id` int NOT NULL,
  PRIMARY KEY (`indicador_adherencia_id`),
  UNIQUE KEY `uq_adherencia_dia` (`paciente_id`,`fecha`),
  CONSTRAINT `Indicador_Adherencia_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`)
) ENGINE=InnoDB AUTO_INCREMENT=430 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Liquidacion`
--

DROP TABLE IF EXISTS `Liquidacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Liquidacion` (
  `liquidacion_id` int NOT NULL AUTO_INCREMENT,
  `anio` smallint NOT NULL,
  `mes` tinyint NOT NULL,
  `sesiones_validadas` int NOT NULL DEFAULT '0',
  `monto_prestaciones` int NOT NULL DEFAULT '0',
  `bonificacion` int NOT NULL DEFAULT '0',
  `monto_total` int NOT NULL DEFAULT '0',
  `observacion` varchar(255) DEFAULT NULL,
  `momento_emision` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `profesional_id` int NOT NULL,
  `emitida_por` int NOT NULL,
  PRIMARY KEY (`liquidacion_id`),
  UNIQUE KEY `uq_liquidacion_periodo` (`profesional_id`,`anio`,`mes`),
  KEY `emitida_por` (`emitida_por`),
  CONSTRAINT `Liquidacion_ibfk_1` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`),
  CONSTRAINT `Liquidacion_ibfk_2` FOREIGN KEY (`emitida_por`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Lista_Espera`
--

DROP TABLE IF EXISTS `Lista_Espera`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Lista_Espera` (
  `lista_espera_id` int NOT NULL AUTO_INCREMENT,
  `momento_inscripcion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `posicion` int NOT NULL,
  `notificado` tinyint(1) DEFAULT '0',
  `estado` varchar(20) NOT NULL DEFAULT 'ESPERANDO',
  `momento_notificacion` timestamp NULL DEFAULT NULL,
  `momento_expira` timestamp NULL DEFAULT NULL,
  `paciente_id` int NOT NULL,
  `cita_id` int NOT NULL,
  `token_cupo` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`lista_espera_id`),
  UNIQUE KEY `uq_espera_cita_paciente` (`cita_id`,`paciente_id`),
  UNIQUE KEY `uq_lista_espera_token` (`token_cupo`),
  KEY `paciente_id` (`paciente_id`),
  CONSTRAINT `Lista_Espera_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `Lista_Espera_ibfk_2` FOREIGN KEY (`cita_id`) REFERENCES `Cita` (`cita_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Material_Terapeutico`
--

DROP TABLE IF EXISTS `Material_Terapeutico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Material_Terapeutico` (
  `material_terapeutico_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `url_archivo` varchar(255) DEFAULT NULL,
  `categoria` varchar(50) NOT NULL,
  `formato` varchar(20) NOT NULL,
  `disponibilidad` tinyint(1) NOT NULL DEFAULT '1',
  `proposito` varchar(20) NOT NULL DEFAULT 'TRATAMIENTO',
  `imagen_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`material_terapeutico_id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Mensaje_Chat`
--

DROP TABLE IF EXISTS `Mensaje_Chat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Mensaje_Chat` (
  `mensaje_id` int NOT NULL AUTO_INCREMENT,
  `contenido_cifrado` text NOT NULL,
  `bloqueado` tinyint(1) DEFAULT '0',
  `momento_envio` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `remitente_usuario_id` int NOT NULL,
  `leido` tinyint(1) NOT NULL DEFAULT '0',
  `episodio_clinico_id` int DEFAULT NULL,
  `paciente_id` int DEFAULT NULL,
  `profesional_id` int DEFAULT NULL,
  `adjunto_url` varchar(500) DEFAULT NULL,
  `adjunto_public_id` varchar(255) DEFAULT NULL,
  `adjunto_nombre` varchar(255) DEFAULT NULL,
  `adjunto_formato` varchar(10) DEFAULT NULL,
  `adjunto_tipo_recurso` varchar(10) DEFAULT NULL,
  `adjunto_bytes` int DEFAULT NULL,
  `adjunto_paginas` int DEFAULT NULL,
  `documento_id` int DEFAULT NULL,
  PRIMARY KEY (`mensaje_id`),
  KEY `idx_chat_episodio` (`episodio_clinico_id`,`mensaje_id`),
  KEY `fk_chat_remitente` (`remitente_usuario_id`),
  KEY `idx_chat_pareja` (`paciente_id`,`profesional_id`,`mensaje_id`),
  KEY `fk_chat_profesional` (`profesional_id`),
  KEY `fk_chat_documento` (`documento_id`),
  CONSTRAINT `fk_chat_documento` FOREIGN KEY (`documento_id`) REFERENCES `Documento_Clinico` (`documento_id`),
  CONSTRAINT `fk_chat_paciente` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `fk_chat_profesional` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`),
  CONSTRAINT `fk_chat_remitente` FOREIGN KEY (`remitente_usuario_id`) REFERENCES `Usuario` (`usuario_id`),
  CONSTRAINT `Mensaje_Chat_ibfk_1` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`)
) ENGINE=InnoDB AUTO_INCREMENT=92 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Notificacion`
--

DROP TABLE IF EXISTS `Notificacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Notificacion` (
  `notificacion_id` int NOT NULL AUTO_INCREMENT,
  `canal` varchar(50) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `titulo` varchar(120) DEFAULT NULL,
  `contenido` text NOT NULL,
  `datos` json DEFAULT NULL,
  `momento_envio` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `leida` tinyint(1) DEFAULT '0',
  `usuario_id` int NOT NULL,
  PRIMARY KEY (`notificacion_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `Notificacion_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=440 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Objetivo_Terapeutico`
--

DROP TABLE IF EXISTS `Objetivo_Terapeutico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Objetivo_Terapeutico` (
  `objetivo_terapeutico_id` int NOT NULL AUTO_INCREMENT,
  `descripcion` varchar(255) NOT NULL,
  `meta_valor` decimal(6,2) NOT NULL,
  `valor_actual` decimal(6,2) NOT NULL,
  `unidad` varchar(20) NOT NULL,
  `episodio_clinico_id` int NOT NULL,
  PRIMARY KEY (`objetivo_terapeutico_id`),
  KEY `episodio_clinico_id` (`episodio_clinico_id`),
  CONSTRAINT `Objetivo_Terapeutico_ibfk_1` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Paciente`
--

DROP TABLE IF EXISTS `Paciente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Paciente` (
  `paciente_id` int NOT NULL AUTO_INCREMENT,
  `sexo_clinico` varchar(20) NOT NULL,
  `calle` varchar(100) NOT NULL,
  `numero_calle` varchar(10) NOT NULL,
  `departamento` varchar(10) DEFAULT NULL,
  `contacto_emergencia_id` int DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `comuna_id` int NOT NULL,
  `privacidad_contacto` json DEFAULT NULL,
  `resena_anonima` tinyint(1) NOT NULL DEFAULT '0',
  `foto_url` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`paciente_id`),
  UNIQUE KEY `usuario_id` (`usuario_id`),
  KEY `contacto_emergencia_id` (`contacto_emergencia_id`),
  KEY `comuna_id` (`comuna_id`),
  CONSTRAINT `Paciente_ibfk_1` FOREIGN KEY (`contacto_emergencia_id`) REFERENCES `Contacto_Emergencia` (`contacto_emergencia_id`),
  CONSTRAINT `Paciente_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`),
  CONSTRAINT `Paciente_ibfk_3` FOREIGN KEY (`comuna_id`) REFERENCES `Comuna` (`comuna_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Palabra_Restringida`
--

DROP TABLE IF EXISTS `Palabra_Restringida`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Palabra_Restringida` (
  `palabra_restringida_id` int NOT NULL AUTO_INCREMENT,
  `termino` varchar(80) NOT NULL,
  `categoria` varchar(40) NOT NULL DEFAULT 'GENERAL',
  `activa` tinyint(1) NOT NULL DEFAULT '1',
  `momento_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `administrador_id` int DEFAULT NULL,
  PRIMARY KEY (`palabra_restringida_id`),
  UNIQUE KEY `termino` (`termino`),
  KEY `administrador_id` (`administrador_id`),
  CONSTRAINT `Palabra_Restringida_ibfk_1` FOREIGN KEY (`administrador_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Paquete_Sesiones`
--

DROP TABLE IF EXISTS `Paquete_Sesiones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Paquete_Sesiones` (
  `paquete_sesiones_id` int NOT NULL AUTO_INCREMENT,
  `sesiones_total` tinyint NOT NULL,
  `sesiones_usadas` tinyint NOT NULL DEFAULT '0',
  `estado` varchar(20) NOT NULL,
  `precio_total` int NOT NULL,
  `momento_adquisicion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `paciente_id` int NOT NULL,
  PRIMARY KEY (`paquete_sesiones_id`),
  KEY `paciente_id` (`paciente_id`),
  CONSTRAINT `Paquete_Sesiones_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Parametro_Global`
--

DROP TABLE IF EXISTS `Parametro_Global`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Parametro_Global` (
  `parametro_id` int NOT NULL AUTO_INCREMENT,
  `clave` varchar(50) NOT NULL,
  `valor` varchar(255) NOT NULL,
  `descripcion` text,
  `ultima_modificacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `administrador_id` int NOT NULL,
  PRIMARY KEY (`parametro_id`),
  UNIQUE KEY `clave` (`clave`),
  KEY `administrador_id` (`administrador_id`),
  CONSTRAINT `Parametro_Global_ibfk_1` FOREIGN KEY (`administrador_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Pauta_Cumplimiento`
--

DROP TABLE IF EXISTS `Pauta_Cumplimiento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Pauta_Cumplimiento` (
  `pauta_cumplimiento_id` int NOT NULL AUTO_INCREMENT,
  `pauta_ejercicio_id` int NOT NULL,
  `fecha` date NOT NULL,
  `momento_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pauta_cumplimiento_id`),
  UNIQUE KEY `uq_ejercicio_dia` (`pauta_ejercicio_id`,`fecha`),
  CONSTRAINT `Pauta_Cumplimiento_ibfk_1` FOREIGN KEY (`pauta_ejercicio_id`) REFERENCES `Pauta_Ejercicio` (`pauta_ejercicio_id`)
) ENGINE=InnoDB AUTO_INCREMENT=81 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Pauta_Ejercicio`
--

DROP TABLE IF EXISTS `Pauta_Ejercicio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Pauta_Ejercicio` (
  `pauta_ejercicio_id` int NOT NULL AUTO_INCREMENT,
  `pauta_tratamiento_id` int NOT NULL,
  `nombre_ejercicio` varchar(255) NOT NULL,
  `series` int NOT NULL DEFAULT '1',
  `repeticiones` int NOT NULL DEFAULT '1',
  `frecuencia` varchar(20) NOT NULL DEFAULT 'DIARIA',
  `material_terapeutico_id` int DEFAULT NULL,
  `dias_semana` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`pauta_ejercicio_id`),
  UNIQUE KEY `uq_pauta_nombre` (`pauta_tratamiento_id`,`nombre_ejercicio`),
  KEY `fk_pauta_ejercicio_material` (`material_terapeutico_id`),
  CONSTRAINT `fk_pauta_ejercicio_material` FOREIGN KEY (`material_terapeutico_id`) REFERENCES `Material_Terapeutico` (`material_terapeutico_id`),
  CONSTRAINT `Pauta_Ejercicio_ibfk_1` FOREIGN KEY (`pauta_tratamiento_id`) REFERENCES `Pauta_Tratamiento` (`pauta_tratamiento_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Pauta_Ejercicio_Material`
--

DROP TABLE IF EXISTS `Pauta_Ejercicio_Material`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Pauta_Ejercicio_Material` (
  `pauta_ejercicio_material_id` int NOT NULL AUTO_INCREMENT,
  `pauta_ejercicio_id` int NOT NULL,
  `nombre_original` varchar(255) NOT NULL,
  `formato` varchar(10) NOT NULL,
  `tipo_recurso` varchar(10) NOT NULL,
  `url_publica` varchar(500) NOT NULL,
  `public_id_cloud` varchar(255) NOT NULL,
  `tamano_bytes` int NOT NULL,
  `paginas` int DEFAULT NULL,
  `momento_carga` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int NOT NULL,
  PRIMARY KEY (`pauta_ejercicio_material_id`),
  KEY `pauta_ejercicio_id` (`pauta_ejercicio_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `Pauta_Ejercicio_Material_ibfk_1` FOREIGN KEY (`pauta_ejercicio_id`) REFERENCES `Pauta_Ejercicio` (`pauta_ejercicio_id`),
  CONSTRAINT `Pauta_Ejercicio_Material_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Pauta_Tratamiento`
--

DROP TABLE IF EXISTS `Pauta_Tratamiento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Pauta_Tratamiento` (
  `pauta_tratamiento_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `estado` varchar(20) NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_expiracion` date NOT NULL,
  `episodio_clinico_id` int NOT NULL,
  PRIMARY KEY (`pauta_tratamiento_id`),
  KEY `episodio_clinico_id` (`episodio_clinico_id`),
  CONSTRAINT `Pauta_Tratamiento_ibfk_1` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Preferencia_Notificacion`
--

DROP TABLE IF EXISTS `Preferencia_Notificacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Preferencia_Notificacion` (
  `usuario_id` int NOT NULL,
  `canal_push` tinyint(1) NOT NULL DEFAULT '1',
  `canal_email` tinyint(1) NOT NULL DEFAULT '1',
  `ultima_modificacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `refuerzos` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `Preferencia_Notificacion_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Profesional`
--

DROP TABLE IF EXISTS `Profesional`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Profesional` (
  `profesional_id` int NOT NULL AUTO_INCREMENT,
  `num_registro_salud` varchar(30) NOT NULL,
  `reseña_curricular` text NOT NULL,
  `calificacion_promedio` decimal(3,2) NOT NULL,
  `foto_url` varchar(255) NOT NULL,
  `tipo_sede` enum('DOMICILIO','ONLINE','AMBOS') NOT NULL,
  `usuario_id` int NOT NULL,
  `especialidad_id` int NOT NULL,
  `areas_experticia` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`profesional_id`),
  UNIQUE KEY `num_registro_salud` (`num_registro_salud`),
  KEY `usuario_id` (`usuario_id`),
  KEY `especialidad_id` (`especialidad_id`),
  CONSTRAINT `Profesional_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`),
  CONSTRAINT `Profesional_ibfk_2` FOREIGN KEY (`especialidad_id`) REFERENCES `Especialidad` (`especialidad_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Profesional_Autorizado`
--

DROP TABLE IF EXISTS `Profesional_Autorizado`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Profesional_Autorizado` (
  `rut_autorizado` varchar(10) NOT NULL,
  `habilitado` tinyint(1) DEFAULT '0',
  `administrador_id` int NOT NULL,
  PRIMARY KEY (`rut_autorizado`),
  KEY `administrador_id` (`administrador_id`),
  CONSTRAINT `Profesional_Autorizado_ibfk_1` FOREIGN KEY (`administrador_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Profesional_Comuna`
--

DROP TABLE IF EXISTS `Profesional_Comuna`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Profesional_Comuna` (
  `profesional_id` int NOT NULL,
  `comuna_id` int NOT NULL,
  PRIMARY KEY (`profesional_id`,`comuna_id`),
  KEY `comuna_id` (`comuna_id`),
  CONSTRAINT `Profesional_Comuna_ibfk_1` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`),
  CONSTRAINT `Profesional_Comuna_ibfk_2` FOREIGN KEY (`comuna_id`) REFERENCES `Comuna` (`comuna_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Profesional_Disponibilidad`
--

DROP TABLE IF EXISTS `Profesional_Disponibilidad`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Profesional_Disponibilidad` (
  `profesional_id` int NOT NULL,
  `dia_semana` tinyint NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  `modalidad` enum('DOMICILIO','ONLINE','AMBOS') NOT NULL DEFAULT 'DOMICILIO',
  PRIMARY KEY (`profesional_id`,`dia_semana`,`hora_inicio`),
  CONSTRAINT `Profesional_Disponibilidad_ibfk_1` FOREIGN KEY (`profesional_id`) REFERENCES `Profesional` (`profesional_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Reporte_Preclinico`
--

DROP TABLE IF EXISTS `Reporte_Preclinico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Reporte_Preclinico` (
  `reporte_preclinico_id` int NOT NULL AUTO_INCREMENT,
  `resumen` text NOT NULL,
  `banderas` json DEFAULT NULL,
  `etiquetas` json DEFAULT NULL,
  `suficiente` tinyint(1) NOT NULL DEFAULT '1',
  `especialidad_sugerida_id` int DEFAULT NULL,
  `momento_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `triaje_id` int NOT NULL,
  `paciente_id` int NOT NULL,
  PRIMARY KEY (`reporte_preclinico_id`),
  UNIQUE KEY `triaje_id` (`triaje_id`),
  KEY `paciente_id` (`paciente_id`),
  KEY `especialidad_sugerida_id` (`especialidad_sugerida_id`),
  CONSTRAINT `Reporte_Preclinico_ibfk_1` FOREIGN KEY (`triaje_id`) REFERENCES `Triaje` (`triaje_id`),
  CONSTRAINT `Reporte_Preclinico_ibfk_2` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `Reporte_Preclinico_ibfk_3` FOREIGN KEY (`especialidad_sugerida_id`) REFERENCES `Especialidad` (`especialidad_id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Reporte_Sintoma`
--

DROP TABLE IF EXISTS `Reporte_Sintoma`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Reporte_Sintoma` (
  `reporte_sintoma_id` int NOT NULL AUTO_INCREMENT,
  `nivel_dolor` tinyint NOT NULL,
  `limitacion_funcional` tinyint NOT NULL,
  `comentario` varchar(500) DEFAULT NULL,
  `clave_envio` varchar(64) NOT NULL,
  `momento_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `paciente_id` int NOT NULL,
  `episodio_clinico_id` int DEFAULT NULL,
  PRIMARY KEY (`reporte_sintoma_id`),
  UNIQUE KEY `clave_envio` (`clave_envio`),
  KEY `paciente_id` (`paciente_id`),
  KEY `episodio_clinico_id` (`episodio_clinico_id`),
  CONSTRAINT `Reporte_Sintoma_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`),
  CONSTRAINT `Reporte_Sintoma_ibfk_2` FOREIGN KEY (`episodio_clinico_id`) REFERENCES `Episodio_Clinico` (`episodio_clinico_id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Rol`
--

DROP TABLE IF EXISTS `Rol`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Rol` (
  `rol_id` int NOT NULL AUTO_INCREMENT,
  `nombre_rol` varchar(50) NOT NULL,
  PRIMARY KEY (`rol_id`),
  UNIQUE KEY `nombre_rol` (`nombre_rol`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Sede`
--

DROP TABLE IF EXISTS `Sede`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Sede` (
  `sede_id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `estado_sede` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`sede_id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Sede_Horario`
--

DROP TABLE IF EXISTS `Sede_Horario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Sede_Horario` (
  `sede_id` int NOT NULL,
  `dia_semana` tinyint NOT NULL,
  `hora_apertura` time NOT NULL,
  `hora_cierre` time NOT NULL,
  PRIMARY KEY (`sede_id`),
  CONSTRAINT `Sede_Horario_ibfk_1` FOREIGN KEY (`sede_id`) REFERENCES `Sede` (`sede_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Sede_Online`
--

DROP TABLE IF EXISTS `Sede_Online`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Sede_Online` (
  `sede_id` int NOT NULL,
  `link` varchar(255) NOT NULL,
  `contraseña` varchar(50) NOT NULL,
  `codigo` varchar(50) NOT NULL,
  PRIMARY KEY (`sede_id`),
  CONSTRAINT `Sede_Online_ibfk_1` FOREIGN KEY (`sede_id`) REFERENCES `Sede` (`sede_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Sede_Presencial`
--

DROP TABLE IF EXISTS `Sede_Presencial`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Sede_Presencial` (
  `sede_id` int NOT NULL,
  `calle` varchar(100) NOT NULL,
  `numero_calle` varchar(10) NOT NULL,
  `departamento` varchar(10) NOT NULL,
  `infraestructura` text NOT NULL,
  `comuna_id` int NOT NULL,
  PRIMARY KEY (`sede_id`),
  KEY `comuna_id` (`comuna_id`),
  CONSTRAINT `Sede_Presencial_ibfk_1` FOREIGN KEY (`sede_id`) REFERENCES `Sede` (`sede_id`),
  CONSTRAINT `Sede_Presencial_ibfk_2` FOREIGN KEY (`comuna_id`) REFERENCES `Comuna` (`comuna_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Sesion_Usuario`
--

DROP TABLE IF EXISTS `Sesion_Usuario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Sesion_Usuario` (
  `sesion_usuario_id` int NOT NULL AUTO_INCREMENT,
  `jti` char(36) NOT NULL,
  `dispositivo` varchar(120) DEFAULT NULL,
  `ip_origen` varchar(45) DEFAULT NULL,
  `momento_inicio` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `activa` tinyint(1) DEFAULT '1',
  `usuario_id` int NOT NULL,
  `dispositivo_id` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`sesion_usuario_id`),
  UNIQUE KEY `jti` (`jti`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `Sesion_Usuario_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=752 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Solicitud_Confirmacion`
--

DROP TABLE IF EXISTS `Solicitud_Confirmacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Solicitud_Confirmacion` (
  `solicitud_confirmacion_id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(64) NOT NULL,
  `momento_envio` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `momento_expira` timestamp NOT NULL,
  `momento_respuesta` timestamp NULL DEFAULT NULL,
  `respuesta` varchar(20) DEFAULT NULL,
  `canal_respuesta` varchar(20) DEFAULT NULL,
  `cita_id` int NOT NULL,
  PRIMARY KEY (`solicitud_confirmacion_id`),
  UNIQUE KEY `token` (`token`),
  UNIQUE KEY `cita_id` (`cita_id`),
  CONSTRAINT `Solicitud_Confirmacion_ibfk_1` FOREIGN KEY (`cita_id`) REFERENCES `Cita` (`cita_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Ticket_Soporte`
--

DROP TABLE IF EXISTS `Ticket_Soporte`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Ticket_Soporte` (
  `ticket_soporte_id` int NOT NULL AUTO_INCREMENT,
  `categoria` varchar(50) NOT NULL,
  `descripcion` text NOT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'ABIERTO',
  `momento_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `momento_resuelto` timestamp NULL DEFAULT NULL,
  `asignado_a` int DEFAULT NULL,
  `momento_enrutamiento` timestamp NULL DEFAULT NULL,
  `adjunto_url` varchar(500) DEFAULT NULL,
  `resolucion` varchar(500) DEFAULT NULL,
  `usuario_id` int NOT NULL,
  PRIMARY KEY (`ticket_soporte_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `fk_ticket_operador` (`asignado_a`),
  CONSTRAINT `fk_ticket_operador` FOREIGN KEY (`asignado_a`) REFERENCES `Usuario` (`usuario_id`),
  CONSTRAINT `Ticket_Soporte_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Transaccion`
--

DROP TABLE IF EXISTS `Transaccion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Transaccion` (
  `transaccion_id` int NOT NULL AUTO_INCREMENT,
  `monto_total` int NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `estado` varchar(20) NOT NULL,
  `momento_pago` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `metodo_pago` varchar(50) NOT NULL,
  `cita_id` int NOT NULL,
  PRIMARY KEY (`transaccion_id`),
  KEY `cita_id` (`cita_id`),
  CONSTRAINT `Transaccion_ibfk_1` FOREIGN KEY (`cita_id`) REFERENCES `Cita` (`cita_id`)
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Triaje`
--

DROP TABLE IF EXISTS `Triaje`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Triaje` (
  `triaje_id` int NOT NULL AUTO_INCREMENT,
  `estado` enum('EN_PROGRESO','COMPLETADO') NOT NULL DEFAULT 'EN_PROGRESO',
  `respuestas` json DEFAULT NULL,
  `momento_inicio` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `momento_completado` timestamp NULL DEFAULT NULL,
  `integrado` tinyint(1) NOT NULL DEFAULT '0',
  `paciente_id` int NOT NULL,
  PRIMARY KEY (`triaje_id`),
  KEY `paciente_id` (`paciente_id`),
  CONSTRAINT `Triaje_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `Paciente` (`paciente_id`)
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Usuario`
--

DROP TABLE IF EXISTS `Usuario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Usuario` (
  `usuario_id` int NOT NULL AUTO_INCREMENT,
  `rut` varchar(10) NOT NULL,
  `nombres` varchar(100) NOT NULL,
  `apellido_paterno` varchar(100) NOT NULL,
  `apellido_materno` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `contrasena_hash` varchar(255) NOT NULL,
  `cuenta_activo` tinyint(1) DEFAULT '0',
  `hora_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `otp_codigo` varchar(6) DEFAULT NULL,
  `otp_expiracion` timestamp NULL DEFAULT NULL,
  `rol_id` int NOT NULL,
  PRIMARY KEY (`usuario_id`),
  UNIQUE KEY `rut` (`rut`),
  UNIQUE KEY `email` (`email`),
  KEY `rol_id` (`rol_id`),
  CONSTRAINT `Usuario_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `Rol` (`rol_id`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Usuario_Telefono`
--

DROP TABLE IF EXISTS `Usuario_Telefono`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Usuario_Telefono` (
  `usuario_id` int NOT NULL,
  `telefono` varchar(20) NOT NULL,
  PRIMARY KEY (`usuario_id`,`telefono`),
  CONSTRAINT `Usuario_Telefono_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-16  3:30:16
