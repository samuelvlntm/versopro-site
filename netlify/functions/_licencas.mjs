/* VersoPro · servidor de licenças (Netlify Functions + Netlify Blobs, grátis)
   - A Kiwify avisa cada compra (webhook) → gera 1 chave por pedido (1 igreja, até 2 PCs).
   - O programa ativa / confere / libera a vaga por /api/licenca/* (mesmo formato que o programa já usava).
   - O comprador pega a chave em /chave.html (e-mail + número do pedido).
   Segredos ficam SÓ nas variáveis do Netlify (Site configuration › Environment variables):
     WEBHOOK_SEGREDO  senha que vai no final do endereço do webhook (?s=...)
     KIWIFY_TOKEN     (opcional) token do webhook da Kiwify, para conferir a assinatura
     ADMIN_SENHA      senha da página /admin.html
     LIMITE_PCS       (opcional) padrão 2 */
import crypto from 'node:crypto';

const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function novaChave() {
  const b = crypto.randomBytes(16); let s = '';
  for (let i = 0; i < 16; i++) s += ALFA[b[i] % ALFA.length];
  return 'VP-' + s.match(/.{4}/g).join('-');
}
export const limpaChave = (k) => String(k || '').toUpperCase().replace(/\s+/g, '').trim();
const limpaEmail = (e) => String(e || '').trim().toLowerCase();
const limite = () => +(process.env.LIMITE_PCS || 2) || 2;

export function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}
export async function lerCorpo(req) {
  const txt = await req.text();
  const ct = req.headers.get('content-type') || '';
  let o = {};
  if (/json/.test(ct)) { try { o = JSON.parse(txt || '{}'); } catch (e) {} }
  else { try { o = Object.fromEntries(new URLSearchParams(txt)); } catch (e) {} }
  return { txt, o };
}
const iguais = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };

/* ---------- armazenamento ---------- */
export async function ler(st, k) { return await st.get(k, { type: 'json' }); }
export async function gravar(st, lic) { lic.atualizada = new Date().toISOString(); await st.setJSON('k/' + lic.chave, lic); }
async function indexar(st, lic) {
  if (lic.pedido) await st.setJSON('p/' + lic.pedido, { chave: lic.chave });
  if (lic.email) { const e = (await ler(st, 'e/' + lic.email)) || { chaves: [] }; if (!e.chaves.includes(lic.chave)) e.chaves.push(lic.chave); await st.setJSON('e/' + lic.email, e); }
}
export async function criar(st, d) {
  const lic = { chave: novaChave(), email: limpaEmail(d.email), nome: String(d.nome || '').slice(0, 120), pedido: String(d.pedido || '').slice(0, 80), produto: String(d.produto || ''), origem: d.origem || 'kiwify', status: 'ativa', limite: d.limite || limite(), inst: [], criada: new Date().toISOString(), hist: [] };
  await gravar(st, lic); await indexar(st, lic);
  return lic;
}

/* ---------- webhook da Kiwify ---------- */
function campo(o, ...nomes) { for (const n of nomes) { const v = n.split('.').reduce((x, p) => x && x[p], o); if (v != null && v !== '') return v; } return ''; }
export async function webhook(st, req) {
  const u = new URL(req.url);
  const { txt, o } = await lerCorpo(req);
  const seg = process.env.WEBHOOK_SEGREDO || '';
  if (!seg || !iguais(u.searchParams.get('s') || '', seg)) return json({ erro: 'segredo' }, 401);
  const tok = process.env.KIWIFY_TOKEN || '';
  if (tok && u.searchParams.get('signature')) {
    const sig = u.searchParams.get('signature');
    const a = crypto.createHmac('sha1', tok).update(txt).digest('hex'), b = crypto.createHmac('sha1', tok).update(JSON.stringify(o)).digest('hex');
    if (!iguais(sig, a) && !iguais(sig, b)) return json({ erro: 'assinatura' }, 401);
  }
  const ev = String(campo(o, 'webhook_event_type', 'event', 'type') || '').toLowerCase();
  const stt = String(campo(o, 'order_status', 'status') || '').toLowerCase();
  const pedido = String(campo(o, 'order_id', 'order_ref', 'id') || '');
  const email = limpaEmail(campo(o, 'Customer.email', 'customer.email', 'email'));
  const nome = campo(o, 'Customer.full_name', 'customer.full_name', 'Customer.name', 'customer.name', 'name');
  const produto = String(campo(o, 'Product.product_id', 'product.product_id', 'product_id') || '');
  if (!pedido) return json({ ok: true, ignorado: 'sem pedido' });
  const aprovado = /approved|aprovad|paid|pago/.test(ev) || stt === 'paid' || stt === 'approved';
  const cancelado = /refund|reembols|chargeback|charged_back|cancel/.test(ev) || /refunded|chargedback|charged_back|canceled|cancelled/.test(stt);
  const ex = await ler(st, 'p/' + pedido);
  if (cancelado) {
    if (!ex) return json({ ok: true, ignorado: 'pedido sem chave' });
    const lic = await ler(st, 'k/' + ex.chave);
    if (lic && lic.status !== 'cancelada') { lic.status = 'cancelada'; lic.hist.push({ em: new Date().toISOString(), ev: ev || stt }); await gravar(st, lic); }
    return json({ ok: true, chave: ex.chave, status: 'cancelada' });
  }
  if (!aprovado) return json({ ok: true, ignorado: ev || stt || 'evento' });
  if (ex) {                         /* a Kiwify pode mandar o mesmo aviso mais de uma vez */
    const lic = await ler(st, 'k/' + ex.chave);
    if (lic && lic.status === 'cancelada') { lic.status = 'ativa'; lic.hist.push({ em: new Date().toISOString(), ev: 'reaprovado' }); await gravar(st, lic); }
    return json({ ok: true, chave: ex.chave, repetido: true });
  }
  const lic = await criar(st, { email, nome, pedido, produto, origem: 'kiwify' });
  return json({ ok: true, chave: lic.chave });
}

/* ---------- ativação pelo programa (mesmo formato da API de licenças que o programa já entende) ---------- */
const meta = (lic) => ({ store_id: 'versopro', product_id: lic.produto || '', customer_name: lic.nome || '', customer_email: lic.email || '' });
const resumo = (lic) => ({ status: lic.status === 'ativa' ? 'active' : 'disabled', activation_usage: lic.inst.length, activation_limit: lic.limite });
export async function licenca(st, req, acao) {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const { o } = await lerCorpo(req);
  const chave = limpaChave(o.license_key);
  const lic = chave && await ler(st, 'k/' + chave);
  if (!lic) return json({ activated: false, valid: false, deactivated: false, error: 'license_key not found.' }, 404);
  if (acao === 'activate') {
    if (lic.status !== 'ativa') return json({ activated: false, error: 'This license key is disabled.' , license_key: resumo(lic) }, 400);
    const maq = String(o.maquina || '').slice(0, 64);
    const mesmo = maq && lic.inst.find(i => i.maq === maq);          /* o mesmo PC ativando de novo (reinstalou): não gasta outra vaga */
    if (mesmo) { mesmo.nome = String(o.instance_name || mesmo.nome).slice(0, 80); mesmo.visto = new Date().toISOString(); await gravar(st, lic); return json({ activated: true, instance: { id: mesmo.id, name: mesmo.nome }, license_key: resumo(lic), meta: meta(lic) }); }
    if (lic.inst.length >= lic.limite) return json({ activated: false, error: 'This license key has reached the activation limit.', license_key: resumo(lic) }, 400);
    const inst = { id: crypto.randomUUID(), maq, nome: String(o.instance_name || 'PC').slice(0, 80), em: new Date().toISOString(), visto: new Date().toISOString() };
    lic.inst.push(inst); await gravar(st, lic);
    return json({ activated: true, instance: { id: inst.id, name: inst.nome }, license_key: resumo(lic), meta: meta(lic) });
  }
  const inst = lic.inst.find(i => i.id === String(o.instance_id || ''));
  if (acao === 'validate') {
    if (!inst) return json({ valid: false, error: 'instance_id not found.', license_key: resumo(lic) }, 404);
    inst.visto = new Date().toISOString(); await gravar(st, lic);
    return json({ valid: lic.status === 'ativa', license_key: resumo(lic), meta: meta(lic) });
  }
  if (acao === 'deactivate') {
    if (!inst) return json({ deactivated: true, license_key: resumo(lic) });
    lic.inst = lic.inst.filter(i => i !== inst); await gravar(st, lic);
    return json({ deactivated: true, license_key: resumo(lic) });
  }
  return json({ error: 'rota' }, 404);
}

/* ---------- comprador pega a chave: e-mail + número do pedido ---------- */
export async function minhaChave(st, req) {
  if (req.method !== 'POST') return json({ erro: 'método' }, 405);
  const { o } = await lerCorpo(req);
  const email = limpaEmail(o.email), pedido = String(o.pedido || '').trim().replace(/^#/, '');
  if (!email || !pedido) return json({ erro: 'Preencha o e-mail e o número do pedido.' }, 400);
  await new Promise(r => setTimeout(r, 400));      /* freia quem tenta adivinhar */
  const p = await ler(st, 'p/' + pedido);
  const lic = p && await ler(st, 'k/' + p.chave);
  if (!lic || lic.email !== email) return json({ erro: 'Não achei uma compra com este e-mail e este número de pedido. Confira os dois no e-mail de confirmação da Kiwify. Se a compra foi agora, espere 2 minutos e tente de novo.' }, 404);
  if (lic.status !== 'ativa') return json({ erro: 'Esta compra foi reembolsada ou cancelada.' }, 403);
  return json({ ok: true, chave: lic.chave, nome: lic.nome, pcs: lic.inst.length, limite: lic.limite });
}

/* ---------- painel do vendedor (/admin.html) ---------- */
export async function admin(st, req) {
  if (req.method !== 'POST') return json({ erro: 'método' }, 405);
  const { o } = await lerCorpo(req);
  const senha = process.env.ADMIN_SENHA || '';
  if (!senha || !iguais(o.senha || '', senha)) { await new Promise(r => setTimeout(r, 800)); return json({ erro: 'Senha errada (ou ADMIN_SENHA não configurada no Netlify).' }, 401); }
  const a = o.acao;
  if (a === 'listar') {
    const { blobs } = await st.list({ prefix: 'k/' });
    const l = []; for (const b of blobs) { const x = await ler(st, b.key); if (x) l.push(x); }
    l.sort((x, y) => String(y.criada).localeCompare(String(x.criada)));
    return json({ ok: true, lista: l });
  }
  if (a === 'criar') { const lic = await criar(st, { email: o.email, nome: o.nome, pedido: o.pedido || 'manual-' + Date.now().toString(36), origem: 'manual', limite: +o.limite || limite() }); return json({ ok: true, lic }); }
  const lic = await ler(st, 'k/' + limpaChave(o.chave));
  if (!lic) return json({ erro: 'Chave não encontrada.' }, 404);
  if (a === 'cancelar') lic.status = 'cancelada';
  else if (a === 'reativar') lic.status = 'ativa';
  else if (a === 'liberarPcs') lic.inst = [];
  else if (a === 'limite') lic.limite = Math.max(1, +o.limite || 2);
  else return json({ erro: 'ação' }, 400);
  lic.hist.push({ em: new Date().toISOString(), ev: 'admin:' + a }); await gravar(st, lic);
  return json({ ok: true, lic });
}
