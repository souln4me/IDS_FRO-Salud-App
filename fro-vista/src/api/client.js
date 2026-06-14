import axios from 'axios';

const COMPUTADORA_IP = '10.0.2.2';

const apiClient = axios.create({
  baseURL: `http://${COMPUTADORA_IP}:3000/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getPacientesProfesional = async (profesionalId, buscar = "") => {
  const response = await apiClient.get(
    `/profesionales/${profesionalId}/pacientes`,
    {
      params: { buscar },
    }
  );

  return response.data;
};
export const getHistorialPaciente = async (pacienteId) => {
  const response = await apiClient.get(
    `/profesionales/pacientes/${pacienteId}/historial`
  );

  return response.data;
};
export default apiClient;