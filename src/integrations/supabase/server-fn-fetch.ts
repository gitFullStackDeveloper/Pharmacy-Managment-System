import { supabase } from "./client";

// Patch window.fetch (browser only) so calls to TanStack Start server functions
// automatically include the current user's Supabase access token. The
// requireSupabaseAuth middleware on the server reads this Authorization header.
if (typeof window !== "undefined" && !(window as unknown as { __serverFnFetchPatched?: boolean }).__serverFnFetchPatched) {
  (window as unknown as { __serverFnFetchPatched?: boolean }).__serverFnFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url && url.includes("/_serverFn/")) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has("authorization")) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) headers.set("authorization", `Bearer ${token}`);
        }
        return originalFetch(input, { ...init, headers });
      }
    } catch {
      // fall through to original fetch
    }
    return originalFetch(input, init);
  };
}