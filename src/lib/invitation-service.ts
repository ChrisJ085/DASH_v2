import { supabase } from './supabase';

export interface InviteResult {
  success: boolean;
  message: string;
  userId?: string;
  email?: string;
  tempPassword?: string;
}

/**
 * Invokes the secure server-side Edge Function to provision a new team member
 * and assign their profile safely under the caller's tenant with a temporary password.
 * 
 * @param email - Target colleague's email address
 * @param name - Target colleague's full name
 * @param role - Target functional role (e.g., observer, site_manager)
 * @param customTempPassword - Optional custom temporary password provided by admin
 */
export async function inviteUser(email: string, name: string, role: string, customTempPassword?: string): Promise<InviteResult> {
  try {
    // 1. Get the current active session token to pass as bearer auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active authentication session. Please sign in again.');
    }

    // 2. Invoke the Edge Function securely
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email, name, role, customTempPassword },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (error) {
      let detailedError = error.message;
      try {
        if ('context' in error && (error as any).context && typeof (error as any).context.json === 'function') {
          const body = await (error as any).context.json();
          if (body && body.error) {
            detailedError = body.error;
          }
        }
      } catch (e) {
        // Fallback to error.message if JSON extraction fails
      }
      throw new Error(detailedError);
    }

    // Handle any function body-returned errors
    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      success: true,
      message: data?.message || 'Account provisioned successfully.',
      userId: data?.userId,
      email: data?.email,
      tempPassword: data?.tempPassword
    };
  } catch (err: any) {
    console.error('Invitation Service Error:', err);
    throw new Error(err.message || 'Server-side provisioning flow encountered an issue.');
  }
}
