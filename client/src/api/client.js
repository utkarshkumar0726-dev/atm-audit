import axios from 'axios';

// Falls back to whatever host the page itself was loaded from (works from
// any device on the LAN without hardcoding the machine's current IP).
const defaultBaseURL = `http://${window.location.hostname}:5000/api`;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || defaultBaseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
