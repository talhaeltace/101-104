import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://srxpakydpsflbhxxmxcl.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyeHBha3lkcHNmbGJoeHhteGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNzA3OTQsImV4cCI6MjA3Mzk0Njc5NH0.yLjTd8ge9UCY1ufTi-Ji6oLLZY-pQd5sAZAXc3l6VuI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);