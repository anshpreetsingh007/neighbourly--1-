import axios from 'axios';
import { supabase } from '../lib/supabase';

const api = axios.create({
  baseURL: '/api',
});

// Add auth interceptor. The API identifies users by Supabase UID, not a bearer token.
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    config.headers['x-supabase-uid'] = session.user.id;
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
