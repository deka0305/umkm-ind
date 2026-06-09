import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xagvobqotslesrsbxnlw.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZ3ZvYnFvdHNsZXNyc2J4bmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTQ3NDcsImV4cCI6MjA5NjQ3MDc0N30.TEAmPqweQ1LuKIhf489E41F59GHDHdshyj3LjudTSr4';

const realtimeConfig: any = {};
if (typeof window === 'undefined') {
  realtimeConfig.transport = class FakeWS {
    addEventListener() {}
    removeEventListener() {}
    close() {}
    send() {}
  };
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  realtime: realtimeConfig,
});
