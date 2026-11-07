-- This RPC unconditionally marks the current profile as age-confirmed.
-- The current application source contains no call to this RPC, and client-side DOB
-- validation is not a trusted server-side verification mechanism.
-- Keep the function for controlled future replacement, but remove end-user execution.
REVOKE EXECUTE ON FUNCTION public.confirm_age() FROM PUBLIC, anon, authenticated;
