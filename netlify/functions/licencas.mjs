/* Todas as rotas /api/* do servidor de licenças do VersoPro (ver _licencas.mjs) */
import { getStore } from '@netlify/blobs';
import { webhook, licenca, minhaChave, admin, json } from './_licencas.mjs';

export default async (req) => {
  const st = getStore({ name: 'licencas', consistency: 'strong' });
  const p = new URL(req.url).pathname.replace(/\/+$/, '');
  try {
    if (p === '/api/kiwify') return await webhook(st, req);
    const m = p.match(/^\/api\/licenca\/(activate|validate|deactivate)$/);
    if (m) return await licenca(st, req, m[1]);
    if (p === '/api/minha-chave') return await minhaChave(st, req);
    if (p === '/api/admin') return await admin(st, req);
    if (p === '/api/ping') return json({ ok: true, versao: 1 });
    return json({ erro: 'rota' }, 404);
  } catch (e) {
    console.error(e);
    return json({ erro: 'falha interna', error: 'server error' }, 500);
  }
};
export const config = { path: ['/api/kiwify', '/api/licenca/*', '/api/minha-chave', '/api/admin', '/api/ping'] };
