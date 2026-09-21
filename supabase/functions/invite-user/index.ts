// supabase/functions/invite-user/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server environment misconfigured: missing credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize elevated admin client
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 2. Validate Caller Identity (Authenticate caller via JWT token)
    const { data: { user: callerUser }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !callerUser) {
      return new Response(
        JSON.stringify({ error: `Invalid session: ${authErr?.message || 'caller not authenticated'}` }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Determine Caller Tenant & Role Permissions (Server-side lookups)
    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, tenant_id, is_platform_admin')
      .eq('id', callerUser.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return new Response(
        JSON.stringify({ error: `Failed to resolve caller profile: ${profileErr?.message || 'not found'}` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!callerProfile.tenant_id && !callerProfile.is_platform_admin) {
      return new Response(
        JSON.stringify({ error: 'Access denied: caller does not belong to any tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if caller is Tenant Admin or has users.invite permission
    const { data: callerRoles } = await adminClient
      .from('user_roles')
      .select('roles(code)')
      .eq('user_id', callerUser.id);

    const isTenantAdmin = callerRoles?.some((ur: any) => ur.roles?.code === 'tenant_admin');
    
    if (!isTenantAdmin && !callerProfile.is_platform_admin) {
      return new Response(
        JSON.stringify({ error: 'Access denied: client lacks user invitation privileges' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse Target Request Body
    const { email, name, role } = await req.json();
    if (!email || !name || !role) {
      return new Response(
        JSON.stringify({ error: 'Parameters email, name, and role are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify role belongs to system or target tenant (Cannot assign platform_admin)
    if (role === 'platform_admin') {
      return new Response(
        JSON.stringify({ error: 'Security Exception: Cannot assign Platform Admin privilege' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleRecord, error: roleSearchErr } = await adminClient
      .from('roles')
      .select('id, code')
      .eq('code', role)
      .maybeSingle();

    if (roleSearchErr || !roleRecord) {
      return new Response(
        JSON.stringify({ error: `Invalid role selected: ${roleSearchErr?.message || 'not found'}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Caller: ${callerUser.email} is inviting ${email} to tenant ${callerProfile.tenant_id} as ${role}`);

    // 5. Invoke Supabase Admin Auth Invitation
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: name,
        invited_by: callerUser.id
      }
    });

    if (inviteErr || !inviteData.user) {
      return new Response(
        JSON.stringify({ error: `Supabase invitation failed: ${inviteErr?.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetUserId = inviteData.user.id;

    // 6. Secure Database Provisioning (Updates profile and sets correct tenant_id inside DB)
    // Note: Due to potential race conditions with trigger, we upsert safely.
    const { error: profileUpdateErr } = await adminClient
      .from('profiles')
      .upsert({
        id: targetUserId,
        tenant_id: callerProfile.tenant_id,
        email: email,
        full_name: name,
        status: 'invited',
        invited_by: callerUser.id,
        invited_at: new Date().toISOString()
      });

    if (profileUpdateErr) {
      return new Response(
        JSON.stringify({ error: `Failed to link tenant to profile: ${profileUpdateErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Assign Role to User
    const { error: roleAssignErr } = await adminClient
      .from('user_roles')
      .upsert({
        user_id: targetUserId,
        role_id: roleRecord.id,
        tenant_id: callerProfile.tenant_id
      });

    if (roleAssignErr) {
      return new Response(
        JSON.stringify({ error: `Failed to assign user role: ${roleAssignErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Write Audit Event
    await adminClient
      .from('audit_logs')
      .insert({
        tenant_id: callerProfile.tenant_id,
        actor_id: callerUser.id,
        action_type: 'user.invite',
        entity_type: 'profile',
        entity_id: targetUserId,
        new_state: {
          email: email,
          name: name,
          assigned_role: role,
          auth_id: targetUserId
        }
      });

    return new Response(
      JSON.stringify({ success: true, message: 'Invitation sent and user provisioned successfully', userId: targetUserId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Server exception: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
