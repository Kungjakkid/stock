import { createClient } from '@supabase/supabase-js';

// Hardcoded for easier deployment to Vercel
const supabaseUrl = 'https://pahfjtmzytcokxmlblea.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaGZqdG16eXRjb2t4bWxibGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTQ5NTEsImV4cCI6MjA5MzMzMDk1MX0.dDhTJq4Y7jeMx8UXu8yB07xQE2M1pFC1eLzZW53aBis';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
