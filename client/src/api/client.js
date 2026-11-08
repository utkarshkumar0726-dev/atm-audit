import axios from 'axios';

// When running under Vite dev proxy or Nginx reverse proxy, relative '/api' works seamlessly
// across any device, domain, or port without CORS or Mixed Content issues.
function getBaseURL() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return '/api';
}

const api = axios.create({
  baseURL: getBaseURL(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
