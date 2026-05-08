/*
  # Revoke PUBLIC execute on handle_new_user SECURITY DEFINER function

  1. Security Changes
    - Revoke EXECUTE on `public.handle_new_user()` from `PUBLIC` role
    - This removes the implicit execute grant that PostgreSQL gives to
      PUBLIC by default on new functions.
    - Combined with the previous revocation from anon/authenticated, this
      fully prevents the function from being called via the REST API.

  2. Important Notes
    - The function remains callable by the function owner (postgres) and
      service_role, which is needed for the trigger to work.
    - The trigger on auth.users fires with elevated privileges regardless
      of these grants, so user creation is unaffected.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;