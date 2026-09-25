// Preserve the existing Vercel proxy while Supabase remains the backend.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/integrations/snipers/delivered-orders') {
      url.hostname = 'dtcchduronwsyunyakxj.supabase.co';
      url.pathname = '/functions/v1/snipers-delivered-orders';
      return fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
