/*
  # Revoke public execute on handle_new_user SECURITY DEFINER function

  1. Security Changes
    - Revoke EXECUTE on `public.handle_new_user()` from `anon` role
    - Revoke EXECUTE on `public.handle_new_user()` from `authenticated` role
    - This function is a trigger handler (called on auth.users INSERT) and
      should never be invoked directly via the REST API (/rest/v1/rpc/).

  2. Important Notes
    - The function remains callable by the database owner (superuser) and
      by the trigger execution context, which runs as the function owner.
    - Revoking from anon/authenticated prevents the function from being
      called via the Supabase REST API, eliminating the SECURITY DEFINER
      escalation risk.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;