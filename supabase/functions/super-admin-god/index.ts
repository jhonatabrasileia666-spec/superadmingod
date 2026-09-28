import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const IMPERIO_ID = "01df0795-8f3b-4484-97b5-6b75bb0d3276";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS });
const clean = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

async function validateAdminToken(base: string, token: string) {
  if (!token) return false;
  const r = await fetch(`${base}/functions/v1/super-admin-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ping", token }),
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action, 80);
    const token = clean(body?.token, 5000);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Configuração do servidor indisponível" }, 500);
    if (!(await validateAdminToken(supabaseUrl, token))) return json({ error: "Sessão inválida ou expirada" }, 401);

    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const publicClient = anonKey ? createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

    const audit = async (acao: string, detalhes: Record<string, unknown> = {}) => {
      await db.from("super_admin_logs").insert({
        admin_user_id: null,
        acao,
        estabelecimento_id: IMPERIO_ID,
        detalhes,
      });
    };

    const requireProduct = async (productId: string) => {
      const { data, error } = await db.from("produtos")
        .select("id,nome,estabelecimento_id")
        .eq("id", productId)
        .eq("estabelecimento_id", IMPERIO_ID)
        .single();
      if (error || !data) throw new Error("Produto não pertence ao Império do Açaí.");
      return data;
    };

    if (action === "bootstrap") {
      const [{ data: store, error: se }, { count: products }, { count: orders }, { count: team }, { data: revenueRows }] = await Promise.all([
        db.from("estabelecimentos").select("*").eq("id", IMPERIO_ID).single(),
        db.from("produtos").select("id", { count: "exact", head: true }).eq("estabelecimento_id", IMPERIO_ID),
        db.from("pedidos").select("id", { count: "exact", head: true }).eq("estabelecimento_id", IMPERIO_ID),
        db.from("equipe_estabelecimento").select("id", { count: "exact", head: true }).eq("estabelecimento_id", IMPERIO_ID),
        db.from("pedidos").select("total").eq("estabelecimento_id", IMPERIO_ID),
      ]);
      if (se) throw se;
      const revenue = (revenueRows || []).reduce((sum, p) => sum + Number(p.total || 0), 0);
      let owner = null;
      if (store?.dono_user_id) {
        const { data } = await db.auth.admin.getUserById(store.dono_user_id);
        owner = data?.user ? {
          id: data.user.id,
          email: data.user.email,
          banned_until: data.user.banned_until ?? null,
          last_sign_in_at: data.user.last_sign_in_at ?? null,
        } : null;
      }
      return json({ ok: true, data: { store, owner, metrics: { products: products ?? 0, orders: orders ?? 0, team: team ?? 0, revenue } } });
    }

    if (action === "listProducts") {
      const { data, error } = await db.from("produtos")
        .select("id,nome,descricao,imagem_url,ativo,categoria_id,modo_preco,categoria_chave,subtipo,produto_variantes(id,tamanho,sabor,preco,fatias,max_sabores)")
        .eq("estabelecimento_id", IMPERIO_ID)
        .order("nome");
      if (error) throw error;
      return json({ ok: true, data: data || [] });
    }

    if (action === "listOrders") {
      const { data, error } = await db.from("pedidos")
        .select("id,cliente_nome,cliente_telefone,total,status,created_at,forma_pagamento,forma_entrega,endereco_entrega")
        .eq("estabelecimento_id", IMPERIO_ID)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return json({ ok: true, data: data || [] });
    }

    if (action === "listTeam") {
      const [{ data: team, error: te }, { data: drivers, error: de }, { data: waiters, error: we }] = await Promise.all([
        db.from("equipe_estabelecimento").select("*").eq("estabelecimento_id", IMPERIO_ID).order("created_at"),
        db.from("entregadores").select("*").eq("estabelecimento_id", IMPERIO_ID).order("created_at"),
        db.from("garcons").select("*").eq("estabelecimento_id", IMPERIO_ID).order("created_at"),
      ]);
      if (te) throw te; if (de) throw de; if (we) throw we;
      return json({ ok: true, data: { team: team || [], drivers: drivers || [], waiters: waiters || [] } });
    }

    if (action === "updateStore") {
      const payload = {
        nome: clean(body?.nome, 160),
        slug: clean(body?.slug, 160),
        telefone: clean(body?.telefone, 60) || null,
        whatsapp_numero: clean(body?.whatsapp_numero, 60) || null,
        instagram: clean(body?.instagram, 160) || null,
        email_contato: clean(body?.email_contato, 254) || null,
        endereco: clean(body?.endereco, 500) || null,
        fuso_horario: clean(body?.fuso_horario, 100) || "America/Rio_Branco",
        ativo: Boolean(body?.ativo),
      };
      if (!payload.nome || !payload.slug) throw new Error("Nome e slug são obrigatórios.");
      const { data, error } = await db.from("estabelecimentos").update(payload).eq("id", IMPERIO_ID).select("*").single();
      if (error) throw error;
      await audit("imperio_god_update_store", { fields: Object.keys(payload) });
      return json({ ok: true, data });
    }

    if (action === "toggleProduct") {
      const productId = clean(body?.product_id, 80);
      const product = await requireProduct(productId);
      const active = Boolean(body?.active);
      const { error } = await db.from("produtos").update({ ativo: active }).eq("id", product.id).eq("estabelecimento_id", IMPERIO_ID);
      if (error) throw error;
      await audit("imperio_god_toggle_product", { product_id: product.id, nome: product.nome, ativo: active });
      return json({ ok: true });
    }

    if (action === "deleteProduct") {
      const productId = clean(body?.product_id, 80);
      const product = await requireProduct(productId);
      const { error } = await db.from("produtos").delete().eq("id", product.id).eq("estabelecimento_id", IMPERIO_ID);
      if (error) throw error;
      await audit("imperio_god_delete_product", { product_id: product.id, nome: product.nome });
      return json({ ok: true });
    }

    if (action === "updateOrderStatus") {
      const orderId = clean(body?.order_id, 80);
      const status = clean(body?.status, 80);
      const { data: order, error: oe } = await db.from("pedidos").select("id").eq("id", orderId).eq("estabelecimento_id", IMPERIO_ID).single();
      if (oe || !order) throw new Error("Pedido não pertence ao Império do Açaí.");
      const { error } = await db.from("pedidos").update({ status }).eq("id", orderId).eq("estabelecimento_id", IMPERIO_ID);
      if (error) throw error;
      await audit("imperio_god_order_status", { order_id: orderId, status });
      return json({ ok: true });
    }

    if (action === "toggleTeamMember") {
      const memberId = clean(body?.member_id, 80);
      const active = Boolean(body?.active);
      const { error } = await db.from("equipe_estabelecimento").update({ ativo: active }).eq("id", memberId).eq("estabelecimento_id", IMPERIO_ID);
      if (error) throw error;
      await audit("imperio_god_toggle_team", { member_id: memberId, ativo: active });
      return json({ ok: true });
    }

    if (["ownerSetPassword","ownerSetEmail","ownerBan","ownerUnban","ownerDelete","ownerRecovery"].includes(action)) {
      const { data: store, error: se } = await db.from("estabelecimentos").select("dono_user_id").eq("id", IMPERIO_ID).single();
      if (se || !store?.dono_user_id) throw new Error("O Império não possui proprietário vinculado.");
      const ownerId = store.dono_user_id;

      if (action === "ownerSetPassword") {
        const password = String(body?.password ?? "");
        if (password.length < 10) throw new Error("A nova senha deve ter pelo menos 10 caracteres.");
        const { error } = await db.auth.admin.updateUserById(ownerId, { password });
        if (error) throw error;
      } else if (action === "ownerSetEmail") {
        const email = clean(body?.email, 254).toLowerCase();
        if (!email.includes("@")) throw new Error("E-mail inválido.");
        const { error } = await db.auth.admin.updateUserById(ownerId, { email, email_confirm: true });
        if (error) throw error;
      } else if (action === "ownerBan" || action === "ownerUnban") {
        const { error } = await db.auth.admin.updateUserById(ownerId, { ban_duration: action === "ownerBan" ? "876000h" : "none" });
        if (error) throw error;
      } else if (action === "ownerRecovery") {
        const { data } = await db.auth.admin.getUserById(ownerId);
        const email = data?.user?.email;
        if (!email || !publicClient) throw new Error("Não foi possível iniciar a recuperação.");
        const { error } = await publicClient.auth.resetPasswordForEmail(email);
        if (error) throw error;
      } else if (action === "ownerDelete") {
        const confirmText = clean(body?.confirm, 80);
        if (confirmText !== "EXCLUIR PROPRIETARIO") throw new Error("Confirmação inválida.");
        const { error: unlink } = await db.from("estabelecimentos").update({ dono_user_id: null }).eq("id", IMPERIO_ID);
        if (unlink) throw unlink;
        const { error } = await db.auth.admin.deleteUser(ownerId, false);
        if (error) throw error;
      }
      await audit("imperio_god_" + action, { owner_user_id: ownerId });
      return json({ ok: true });
    }

    if (action === "deleteStore") {
      const confirmText = clean(body?.confirm, 100);
      if (confirmText !== "EXCLUIR IMPERIO DO ACAI") throw new Error("Confirmação inválida.");
      const result = await db.rpc("internal_admin_excluir_estabelecimento", { p_estabelecimento_id: IMPERIO_ID });
      if (result.error) throw result.error;
      await audit("imperio_god_delete_store", { result: result.data });
      return json({ ok: true, data: result.data });
    }

    return json({ error: "Ação GOD inválida" }, 400);
  } catch (err) {
    console.error("super-admin-god", err);
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 400);
  }
});
