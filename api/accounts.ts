// Vercel Function for basic account operations
import { supabase } from '../backend/src/lib/supabase';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (req.method === 'GET') {
      // Fetch email accounts for user
      const { data: accounts, error: dbError } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('user_id', user.id);

      if (dbError) {
        return res.status(500).json({ error: dbError.message });
      }

      return res.status(200).json({ data: accounts });
    }

    if (req.method === 'POST') {
      // For complex operations like sync, delegate to external service
      const { accountId, folders } = req.body;
      
      // Store sync request in database for external worker to pick up
      const { data, error: syncError } = await supabase
        .from('sync_requests')
        .insert({
          user_id: user.id,
          account_id: accountId,
          folders: folders,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (syncError) {
        return res.status(500).json({ error: syncError.message });
      }

      return res.status(200).json({ 
        success: true, 
        syncJobId: data.id,
        message: 'Sync request queued' 
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}