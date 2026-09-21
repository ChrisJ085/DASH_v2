import { supabase } from './supabase';

export interface InviteResult {
  success: boolean;
  message: string;
  userId?: string;
}

/**
 * Invokes the secure server-side Edge Function to invite a new team member
 * and provision their profile safely under the caller's tenant.
 * 
 * @param email - Target colleague's email address
 * @param name - Target colleague's full name
 * @param role - Target functional role (e.g., observer, site_manager)
 */
export async function inviteUser(email: string, name: string, role: string): Promise<InviteResult> {
  try {
    // 1. Get the current active session token to pass as bearer auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active authentication session. Please sign in again.');
    }

    // 2. Invoke the Edge Function securely
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email, name, role },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (error) {
      throw error;
    }

    // Handle any function body-returned errors
    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      success: true,
      message: data?.message || 'Invitation sent successfully.',
      userId: data?.userId
    };
  } catch (err: any) {
    console.error('Invitation Service Error:', err);
    throw new Error(err.message || 'Server-side invitation flow encountered an issue.');
  }
}
