import axios from 'axios';
import { supabase } from '../lib/supabase';

const api = axios.create({
  baseURL: '/api',
});

// Add auth interceptor
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export const jobService = {
  getJobs: () => api.get('/jobs').then(res => res.data),
  createJob: (data: any) => api.post('/jobs', data).then(res => res.data),
};

export const userService = {
  getMe: () => api.get('/users/me').then(res => res.data),
};

export default api;
