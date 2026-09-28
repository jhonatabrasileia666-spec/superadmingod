import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const clean = (value: unknown, max = 400) => String(value ?? "").trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Variáveis do Supabase indisponíveis.");

    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action, 80);
    const token = clean(body?.token, 5000);
    if (!action || !token) return json({ ok: false, error: "Sessão administrativa ausente." }, 401);

    // Reutiliza exatamente a sessão temporária já validada pelo Super Admin existente.
    const verify = await fetch(`${SUPABASE_URL}/functions/v1/super-admin-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ping", token }),
    });
    if (!verify.ok) return json({ ok: false, error: "Sessão de Super Admin inválida ou expirada." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const publicClient = ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) : null;

    async function audit(acao: string, details: Record<string, unknown> = {}, estabelecimentoId: string | null = null) {
      // O sistema legado usa sessão temporária por senha. Por isso admin_user_id pode ficar nulo.
      await admin.from("super_admin_logs").insert({
        admin_user_id: null,
        acao,
        estabelecimento_id: estabelecimentoId,
        detalhes: details,
      });
    }

    if (action === "getUserAuthDetails") {
      const userId = clean(body?.user_id, 80);
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw error;
      return json({ ok: true, data: {
        id: data.user.id,
        email: data.user.email,
        banned_until: data.user.banned_until ?? null,
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at ?? null,
      }});
    }

    if (action === "setUserPassword") {
      const userId = clean(body?.user_id, 80);
      const password = String(body?.password ?? "");
      if (password.length < 10) throw new Error("A senha deve ter pelo menos 10 caracteres.");
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await audit("god_set_user_password", { target_user_id: userId });
      return json({ ok: true, data: { message: "Senha alterada." } });
    }

    if (action === "setUserEmail") {
      const userId = clean(body?.user_id, 80);
      const email = clean(body?.email, 254).toLowerCase();
      if (!email.includes("@")) throw new Error("E-mail inválido.");
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) throw error;
      await audit("god_set_user_email", { target_user_id: userId, email });
      return json({ ok: true, data: { message: "E-mail alterado." } });
    }

    if (action === "sendPasswordRecovery") {
      const email = clean(body?.email, 254).toLowerCase();
      if (!email.includes("@")) throw new Error("E-mail inválido.");
      if (!publicClient) throw new Error("Chave pública não disponível para recuperação.");
      const { error } = await publicClient.auth.resetPasswordForEmail(email);
      if (error) throw error;
      await audit("god_send_password_recovery", { email });
      return json({ ok: true, data: { message: "E-mail de redefinição solicitado." } });
    }

    if (action === "banUser" || action === "unbanUser") {
      const userId = clean(body?.user_id, 80);
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: action === "banUser" ? "876000h" : "none",
      });
      if (error) throw error;
      await audit(action === "banUser" ? "god_ban_user" : "god_unban_user", { target_user_id: userId });
      return json({ ok: true, data: { message: action === "banUser" ? "Usuário bloqueado." : "Usuário desbloqueado." } });
    }

    if (action === "deleteUser") {
      const userId = clean(body?.user_id, 80);
      const force = Boolean(body?.force);
      const { count, error: countError } = await admin.from("estabelecimentos")
        .select("id", { count: "exact", head: true })
        .eq("dono_user_id", userId);
      if (countError) throw countError;
      if ((count ?? 0) > 0 && !force) throw new Error("O usuário ainda é proprietário de estabelecimento(s). Transfira antes ou use exclusão forçada.");
      if ((count ?? 0) > 0 && force) {
        const { error: orphanError } = await admin.from("estabelecimentos").update({ dono_user_id: null }).eq("dono_user_id", userId);
        if (orphanError) throw orphanError;
      }
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) throw error;
      await audit("god_delete_user", { target_user_id: userId, force, stores_orphaned: count ?? 0 });
      return json({ ok: true, data: { message: "Usuário removido do Supabase Auth." } });
    }

    if (action === "getStoreDetails") {
      const id = clean(body?.establishment_id, 80);
      const { data, error } = await admin.from("estabelecimentos")
        .select("id,nome,slug,telefone,whatsapp_numero,instagram,email_contato,endereco,ativo,dono_user_id")
        .eq("id", id).single();
      if (error) throw error;
      return json({ ok: true, data: { estabelecimento: data } });
    }

    if (action === "updateStore") {
      const id = clean(body?.establishment_id, 80);
      const payload = {
        nome: clean(body?.nome, 160),
        slug: clean(body?.slug, 160),
        telefone: clean(body?.telefone, 50) || null,
        whatsapp_numero: clean(body?.whatsapp_numero, 50) || null,
        instagram: clean(body?.instagram, 160) || null,
        email_contato: clean(body?.email_contato, 254) || null,
        endereco: clean(body?.endereco, 500) || null,
      };
      if (!payload.nome || !payload.slug) throw new Error("Nome e slug são obrigatórios.");
      const { data, error } = await admin.from("estabelecimentos").update(payload).eq("id", id).select("id,nome,slug").single();
      if (error) throw error;
      await audit("god_update_store", { changed_fields: Object.keys(payload) }, id);
      return json({ ok: true, data });
    }

    if (action === "toggleProduct") {
      const productId = clean(body?.product_id, 80);
      const active = Boolean(body?.active);
      const { data: product, error: findError } = await admin.from("produtos").select("id,estabelecimento_id,nome").eq("id", productId).single();
      if (findError) throw findError;
      const { error } = await admin.from("produtos").update({ ativo: active }).eq("id", productId);
      if (error) throw error;
      await audit("god_toggle_product", { product_id: productId, nome: product.nome, ativo: active }, product.estabelecimento_id);
      return json({ ok: true, data: { message: active ? "Produto ativado." : "Produto desativado." } });
    }

    if (action === "deleteProduct") {
      const productId = clean(body?.product_id, 80);
      const { data: product, error: findError } = await admin.from("produtos").select("id,estabelecimento_id,nome").eq("id", productId).single();
      if (findError) throw findError;
      // Dependências comuns do cardápio universal; cada delete é restrito ao produto alvo.
      await admin.from("produto_variantes").delete().eq("produto_id", productId);
      await admin.from("produto_conjuntos_opcoes").delete().eq("produto_id", productId);
      await admin.from("produto_imagens").delete().eq("produto_id", productId);
      await admin.from("produto_catalogo_detalhes").delete().eq("produto_id", productId);
      const { error } = await admin.from("produtos").delete().eq("id", productId);
      if (error) throw error;
      await audit("god_delete_product", { product_id: productId, nome: product.nome }, product.estabelecimento_id);
      return json({ ok: true, data: { message: "Produto excluído." } });
    }

    return json({ ok: false, error: "Ação GOD desconhecida." }, 400);
  } catch (error) {
    console.error("super-admin-god", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Erro interno." }, 400);
  }
});
