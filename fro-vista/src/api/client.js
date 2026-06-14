import axios from 'axios';

const COMPUTADORA_IP = '10.0.2.2';

const apiClient = axios.create({
  baseURL: `http://${COMPUTADORA_IP}:3000/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;