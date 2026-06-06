import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://qsbvitqxwgtmopjjuxin.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzYnZpdHF4d2d0bW9wamp1eGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODMxNDksImV4cCI6MjA2Njc1OTE0OX0.7q2MR7ePBrZKMh08MlZDbeXbFWcoH3dZNgdzWGHOugY'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON)
