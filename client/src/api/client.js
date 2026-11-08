import axios from 'axios';

// Falls back to whatever host the page itself was loaded from.
// When running locally on Vite dev server (port 5173), Vite proxies '/api' to backend:5000.
function getBaseURL() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    // Under Vite dev server or reverse proxy, relative '/api' works seamlessly
    if (window.location.port === '5173') {
      return '/api';
    }
    return `http://${window.location.hostname}:5000/api`;
  }
  return 'http://localhost:5000/api';
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
