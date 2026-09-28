const API_URL = 'https://xzhxqjgekqbyucdgtvra.supabase.co/functions/v1/super-admin-api';
const EXTRA_API_URL = 'https://xzhxqjgekqbyucdgtvra.supabase.co/functions/v1/super-admin-extra';
const SYSTEM_API_URL = 'https://xzhxqjgekqbyucdgtvra.supabase.co/functions/v1/super-admin-system';
const GOD_API_URL = 'https://xzhxqjgekqbyucdgtvra.supabase.co/functions/v1/super-admin-god';
const TOKEN_KEY = 'trampoac_super_admin_temp_token';
const PUBLIC_MENU_BASE_URL = 'https://cardapio.trampoac.com/';

let adminToken = sessionStorage.getItem(TOKEN_KEY) || '';
let stores = [];
let users = [];
let selectedStore = null;
let selectedUser = null;
let toastTimer = null;

const $ = id => document.getElementById(id);
const escapeHtml = v => { const d=document.createElement('div'); d.textContent=String(v??''); return d.innerHTML; };
const fmtDate = v => v ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)) : '—';
const fmtMoney = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const toast = msg => { const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3200); };

async function api(action, params={}){
  const body = { action, ...params };
  if(action !== 'login') body.token = adminToken;
  const systemActions = new Set(['getCacheStatus','forceUpdate','emergencyReset']);
  const endpoint = systemActions.has(action) ? SYSTEM_API_URL : ((action === 'viewMenu' || action === 'deleteStore') ? EXTRA_API_URL : API_URL);
  const res = await fetch(endpoint, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const payload = await res.json().catch(()=>({}));
  if(!res.ok){
    const err = new Error(payload.error || 'Erro ao acessar o servidor.');
    err.status = res.status;
    throw err;
  }
  return payload.data ?? payload;
}

async function godApi(action, params={}){
  const res = await fetch(GOD_API_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,token:adminToken,...params})
  });
  const payload=await res.json().catch(()=>({}));
  if(!res.ok || payload?.ok===false){
    const err=new Error(payload?.error||payload?.message||'Ação GOD recusada pelo servidor.');
    err.status=res.status;
    throw err;
  }
  return payload.data ?? payload.result ?? payload;
}

async function login(){
  const input=$('adminPassword');
  const senha=input.value;
  if(!senha){ $('loginStatus').textContent='Digite a senha.'; input.focus(); return; }
  const btn=$('loginBtn');
  btn.disabled=true;
  $('loginStatus').textContent='Validando...';
  try{
    const r=await api('login',{password:senha});
    adminToken=r.token;
    sessionStorage.setItem(TOKEN_KEY,adminToken);
    input.value='';
    $('loginStatus').textContent='';
    showAdmin();
    $('adminIdentity').textContent='Sessão administrativa temporária';
    $('logoutBtn').hidden=false;
    await Promise.all([loadSummary(),loadStores(),loadUsers(),loadTransfers()]);
  }catch(err){
    console.error(err);
    $('loginStatus').textContent=err.message || 'Senha incorreta.';
  }finally{btn.disabled=false;}
}

function logout(){
  adminToken='';
  sessionStorage.removeItem(TOKEN_KEY);
  $('logoutBtn').hidden=true;
  $('adminIdentity').textContent='';
  showLogin();
}

async function init(){
  $('loginBtn').onclick=login;
  $('adminPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
  $('logoutBtn').onclick=logout;
  $('backToLoginBtn').onclick=logout;
  $('storeSearchBtn').onclick=()=>loadStores($('storeSearch').value);
  $('userSearchBtn').onclick=()=>loadUsers($('userSearch').value);
  $('storeSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadStores(e.target.value)});
  $('userSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadUsers(e.target.value)});
  $('closeTransferModal').onclick=closeTransferModal;
  $('cancelTransferBtn').onclick=closeTransferModal;
  $('confirmTransferBtn').onclick=confirmTransfer;
  $('closeMenuModal').onclick=closeMenuModal;
  $('closeUserGodModal').onclick=closeUserGodModal;
  $('cancelUserGodBtn').onclick=closeUserGodModal;
  $('saveUserPasswordBtn').onclick=saveUserPassword;
  $('saveUserEmailBtn').onclick=saveUserEmail;
  $('toggleUserBlockBtn').onclick=toggleUserBlock;
  $('deleteUserBtn').onclick=deleteUserAuth;
  $('closeStoreGodModal').onclick=closeStoreGodModal;
  $('cancelStoreGodBtn').onclick=closeStoreGodModal;
  $('saveStoreGodBtn').onclick=saveStoreGod;
  document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>switchView(btn.dataset.view));

  if(!adminToken){ showLogin(); return; }
  try{
    await api('ping');
    showAdmin();
    $('adminIdentity').textContent='Sessão administrativa temporária';
    $('logoutBtn').hidden=false;
    await Promise.all([loadSummary(),loadStores(),loadUsers(),loadTransfers()]);
  }catch(err){
    sessionStorage.removeItem(TOKEN_KEY);
    adminToken='';
    showDenied();
  }
}

function showLogin(){ $('loginGate').hidden=false; $('deniedGate').hidden=true; $('adminApp').hidden=true; setTimeout(()=>$('adminPassword')?.focus(),50); }
function showDenied(){ $('loginGate').hidden=true; $('deniedGate').hidden=false; $('adminApp').hidden=true; }
function showAdmin(){ $('loginGate').hidden=true; $('deniedGate').hidden=true; $('adminApp').hidden=false; }

function switchView(name){
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
  document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+name));
  if(name==='estabelecimentos') loadStores($('storeSearch')?.value || '');
  if(name==='usuarios') loadUsers($('userSearch')?.value || '');
  if(name==='transferencias') loadTransfers();
  if(name==='sistema') loadSystemStatus();
}

function handleApiError(err, fallback){
  console.error(err);
  if(err?.status===401){ sessionStorage.removeItem(TOKEN_KEY); adminToken=''; showDenied(); return true; }
  toast(fallback || err.message || 'Erro no servidor.');
  return false;
}

async function loadSummary(){
  try{
    const r=await api('summary');
    const cards=[
      ['Usuários',r.usuarios],['Estabelecimentos',r.estabelecimentos],['Ativos',r.ativos],['Inativos',r.inativos],['Pedidos hoje',r.pedidos_hoje],['Transf. pendentes',r.transferencias_pendentes]
    ];
    $('metrics').innerHTML=cards.map(([a,b])=>`<div class="metric"><span>${escapeHtml(a)}</span><strong>${Number(b||0)}</strong></div>`).join('');
  }catch(err){handleApiError(err,'Não foi possível carregar o resumo.');}
}

async function loadStores(busca=''){
  const host=$('storesTable'); host.innerHTML='<div class="loading">Carregando...</div>';
  try{
    stores=await api('listStores',{search:busca||null})||[];
    if(!stores.length){host.innerHTML='<div class="empty">Nenhum estabelecimento encontrado.</div>';return;}
    host.innerHTML=`<table><thead><tr><th>Estabelecimento</th><th>Dono</th><th>Status</th><th>Produtos</th><th>Pedidos</th><th>Criado</th><th>Último pedido</th><th>Ações</th></tr></thead><tbody>${stores.map(s=>`<tr>
      <td><strong>${escapeHtml(s.nome)}</strong><br><span class="muted">${escapeHtml(s.slug)}</span></td>
      <td>${escapeHtml(s.dono_email||'Sem proprietário')}<br><span class="muted">${escapeHtml(s.dono_user_id||'')}</span></td>
      <td><span class="badge ${s.ativo?'on':'off'}">${s.ativo?'ATIVO':'INATIVO'}</span></td>
      <td>${Number(s.total_produtos||0)}</td><td>${Number(s.total_pedidos||0)}</td><td>${fmtDate(s.created_at)}</td><td>${fmtDate(s.ultimo_pedido_at)}</td>
      <td><div class="actions"><button class="small-btn view" onclick="viewMenu('${s.id}')">Visualizar</button><button class="small-btn" onclick="openStoreGod('${s.id}')">Editar</button><button class="small-btn open-menu" onclick="openPublicMenu('${s.id}')" title="Abrir o cardápio exatamente como o cliente vê">Abrir ↗</button><button class="small-btn ${s.ativo?'danger-lite':''}" onclick="toggleStore('${s.id}',${!s.ativo})">${s.ativo?'Desativar':'Ativar'}</button><button class="small-btn warn" onclick="openTransfer('${s.id}')">Transferir</button><button class="small-btn delete" onclick="deleteStore('${s.id}')">Excluir</button></div></td>
    </tr>`).join('')}</tbody></table>`;
  }catch(err){if(!handleApiError(err))host.innerHTML='<div class="empty">Erro ao carregar estabelecimentos.</div>';}
}

async function toggleStore(id,ativo){
  const s=stores.find(x=>x.id===id); if(!s)return;
  const acao=ativo?'ativar':'desativar';
  if(!confirm(`Confirma ${acao} “${s.nome}”?`)) return;
  try{
    await api('toggleStore',{establishment_id:id,active:ativo});
    toast(`Estabelecimento ${ativo?'ativado':'desativado'}.`);
    await Promise.all([loadStores($('storeSearch').value),loadSummary()]);
  }catch(err){if(!handleApiError(err))alert('Não foi possível alterar o status: '+err.message);}
}


function publicMenuUrl(slug){
  if(!slug) return '';
  const url = new URL(PUBLIC_MENU_BASE_URL);
  url.searchParams.set('loja', slug);
  return url.toString();
}

function openPublicMenu(id){
  const s=stores.find(x=>x.id===id);
  if(!s?.slug){ toast('Este estabelecimento ainda não possui um link de cardápio.'); return; }
  const url=publicMenuUrl(s.slug);
  const win=window.open(url,'_blank','noopener,noreferrer');
  if(!win) toast('O navegador bloqueou a nova aba. Libere pop-ups para abrir o cardápio.');
}

async function viewMenu(id){
  const s=stores.find(x=>x.id===id);
  $('menuModal').hidden=false;
  $('menuTitle').textContent=s ? `Cardápio — ${s.nome}` : 'Cardápio';
  $('menuMeta').textContent='Carregando cardápio completo...';
  $('menuBody').innerHTML='<div class="loading">Carregando...</div>';
  try{
    const r=await api('viewMenu',{establishment_id:id});
    const e=r?.estabelecimento||{};
    const produtos=Array.isArray(r?.produtos)?r.produtos:[];
    const categorias=Array.isArray(r?.categorias)?r.categorias:[];
    $('menuTitle').textContent=`Cardápio — ${e.nome||s?.nome||'Estabelecimento'}`;
    const publicUrl=publicMenuUrl(e.slug||s?.slug||'');
    $('menuMeta').innerHTML=`<span class="badge ${e.ativo?'on':'off'}">${e.ativo?'ATIVO':'INATIVO'}</span> <span>${escapeHtml(e.slug||'')}</span> · <strong>${produtos.length}</strong> produto${produtos.length===1?'':'s'}${publicUrl?`<a class="menu-open-link" href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener noreferrer">Abrir como cliente ↗</a>`:''}`;
    if(!produtos.length){ $('menuBody').innerHTML='<div class="empty">Este estabelecimento ainda não possui produtos.</div>'; return; }
    const catNames=new Map(categorias.map(c=>[c.chave,c.nome]));
    $('menuBody').innerHTML=`<div class="menu-grid">${produtos.map(p=>{
      const vars=Array.isArray(p.variantes)?p.variantes:[];
      const cat=p.categoria_nome||catNames.get(p.categoria_chave)||p.categoria_chave||'Sem categoria';
      const image=p.imagem_url?`<img class="admin-product-img" src="${escapeHtml(p.imagem_url)}" alt="${escapeHtml(p.nome)}" loading="lazy">`:'<div class="admin-product-img ph">Sem imagem</div>';
      const varHtml=vars.length?vars.map(v=>{
        const parts=[v.tamanho,v.sabor].filter(Boolean).join(' · ')||'Preço';
        const extras=[v.fatias?`${v.fatias} fatias`:'',v.max_sabores&&Number(v.max_sabores)>1?`até ${v.max_sabores} sabores`:''].filter(Boolean).join(' · ');
        return `<div class="variant-row"><span>${escapeHtml(parts)}${extras?`<small>${escapeHtml(extras)}</small>`:''}</span><strong>${fmtMoney(v.preco)}</strong></div>`;
      }).join(''):'<div class="muted">Sem variações/preço cadastrado.</div>';
      return `<article class="admin-product-card ${p.ativo===false?'inactive-product':''}">${image}<div class="admin-product-content"><div class="product-top"><span class="product-cat">${escapeHtml(cat)}</span>${p.ativo===false?'<span class="badge off">INATIVO</span>':''}</div><h3>${escapeHtml(p.nome)}</h3>${p.descricao?`<p>${escapeHtml(p.descricao)}</p>`:''}<div class="variant-list">${varHtml}</div><div class="product-god-actions"><button class="small-btn ${p.ativo===false?'':'danger-lite'}" onclick="godToggleProduct('${p.id}',${p.ativo===false})">${p.ativo===false?'Ativar':'Desativar'}</button><button class="small-btn delete" onclick="godDeleteProduct('${p.id}','${escapeHtml(String(p.nome||'').replace(/'/g,"&#39;"))}')">Excluir produto</button></div></div></article>`;
    }).join('')}</div>`;
  }catch(err){
    if(!handleApiError(err)) $('menuBody').innerHTML=`<div class="empty">Erro ao carregar cardápio: ${escapeHtml(err.message||'erro desconhecido')}</div>`;
  }
}
async function godToggleProduct(productId,active){
  if(!confirm(`${active?'Ativar':'Desativar'} este produto?`))return;
  try{await godApi('toggleProduct',{product_id:productId,active});toast(active?'Produto ativado.':'Produto desativado.');if(selectedStore)await viewMenu(selectedStore.id);}
  catch(err){if(!handleApiError(err))alert('Erro: '+err.message);}
}
async function godDeleteProduct(productId,productName){
  const typed=prompt(`Excluir permanentemente “${productName}”?\nDigite EXCLUIR PRODUTO para confirmar:`);
  if(typed!=='EXCLUIR PRODUTO')return;
  try{await godApi('deleteProduct',{product_id:productId});toast('Produto excluído.');if(selectedStore)await viewMenu(selectedStore.id);}
  catch(err){if(!handleApiError(err))alert('Erro: '+err.message);}
}

function closeMenuModal(){ $('menuModal').hidden=true; $('menuBody').innerHTML=''; }

async function deleteStore(id){
  const s=stores.find(x=>x.id===id); if(!s)return;
  const aviso=`EXCLUSÃO PERMANENTE\n\nEstabelecimento: ${s.nome}\nProdutos: ${Number(s.total_produtos||0)}\nPedidos: ${Number(s.total_pedidos||0)}\n\nIsso também remove categorias, variações, entregadores, regiões de entrega e transferências vinculadas. A conta Gmail do proprietário NÃO será apagada.\n\nDigite EXCLUIR para confirmar:`;
  const confirmacao=prompt(aviso,'');
  if(confirmacao!=='EXCLUIR'){ if(confirmacao!==null) toast('Exclusão cancelada: confirmação incorreta.'); return; }
  try{
    const r=await api('deleteStore',{establishment_id:id});
    closeMenuModal();
    toast(`“${r.nome||s.nome}” excluído. ${Number(r.produtos_excluidos||0)} produto(s) e ${Number(r.pedidos_excluidos||0)} pedido(s) removidos.`);
    await Promise.all([loadStores($('storeSearch').value),loadTransfers(),loadSummary()]);
  }catch(err){ if(!handleApiError(err)) alert('Não foi possível excluir o estabelecimento: '+err.message); }
}

async function loadUsers(busca=''){
  const host=$('usersTable'); host.innerHTML='<div class="loading">Carregando...</div>';
  try{
    users=await api('listUsers',{search:busca||null})||[];
    if(!users.length){host.innerHTML='<div class="empty">Nenhum usuário encontrado.</div>';return;}
    host.innerHTML=`<table><thead><tr><th>E-mail</th><th>Cadastros</th><th>Criado</th><th>Último login</th><th>ID</th><th>Ações</th></tr></thead><tbody>${users.map(u=>`<tr><td><strong>${escapeHtml(u.email||'—')}</strong></td><td>${Number(u.estabelecimentos||0)}</td><td>${fmtDate(u.created_at)}</td><td>${fmtDate(u.last_sign_in_at)}</td><td class="muted">${escapeHtml(u.id)}</td><td><div class="actions"><button class="small-btn view" onclick="openUserGod('${u.id}')">Ações GOD</button><button class="small-btn" onclick="sendPasswordRecovery('${escapeHtml(u.email||'')}')">Enviar reset</button></div></td></tr>`).join('')}</tbody></table>`;
  }catch(err){if(!handleApiError(err))host.innerHTML='<div class="empty">Erro ao carregar usuários.</div>';}
}

async function sendPasswordRecovery(email){
  if(!email)return;
  if(!confirm(`Enviar link de redefinição de senha para ${email}?`))return;
  try{
    const r=await godApi('sendPasswordRecovery',{email});
    toast(r?.message||'Link de redefinição enviado.');
  }catch(err){if(!handleApiError(err))alert('Não foi possível enviar o reset: '+err.message);}
}

function openUserGod(id){
  selectedUser=users.find(x=>x.id===id)||null;if(!selectedUser)return;
  $('userGodTitle').textContent='Ações GOD — '+(selectedUser.email||selectedUser.id);
  $('userGodId').textContent=selectedUser.id;
  $('godUserEmail').value=selectedUser.email||'';
  $('godUserPassword').value='';
  $('userGodStatus').textContent='';
  $('toggleUserBlockBtn').textContent='Consultar bloqueio...';
  $('toggleUserBlockBtn').disabled=true;
  $('userGodModal').hidden=false;
  godApi('getUserAuthDetails',{user_id:id}).then(r=>{
    selectedUser={...selectedUser,banned_until:r?.banned_until||null};
    $('toggleUserBlockBtn').textContent=selectedUser.banned_until?'Desbloquear usuário':'Bloquear usuário';
    $('toggleUserBlockBtn').disabled=false;
  }).catch(()=>{ $('toggleUserBlockBtn').textContent='Bloquear usuário'; $('toggleUserBlockBtn').disabled=false; });
}
function closeUserGodModal(){ $('userGodModal').hidden=true; selectedUser=null; }
async function saveUserPassword(){
  if(!selectedUser)return;
  const password=$('godUserPassword').value;
  if(password.length<10){$('userGodStatus').textContent='Use no mínimo 10 caracteres.';return;}
  const typed=prompt('Digite ALTERAR SENHA para confirmar:');
  if(typed!=='ALTERAR SENHA')return;
  try{await godApi('setUserPassword',{user_id:selectedUser.id,password});$('godUserPassword').value='';$('userGodStatus').textContent='Senha alterada diretamente no Supabase Auth.';toast('Senha alterada.');}
  catch(err){$('userGodStatus').textContent='Erro: '+err.message;}
}
async function saveUserEmail(){
  if(!selectedUser)return;
  const email=$('godUserEmail').value.trim().toLowerCase();
  if(!email.includes('@')){$('userGodStatus').textContent='Digite um e-mail válido.';return;}
  if(!confirm(`Alterar o e-mail de autenticação para ${email}?`))return;
  try{await godApi('setUserEmail',{user_id:selectedUser.id,email});$('userGodStatus').textContent='E-mail alterado.';toast('E-mail do usuário atualizado.');closeUserGodModal();await loadUsers($('userSearch').value);}
  catch(err){$('userGodStatus').textContent='Erro: '+err.message;}
}
async function toggleUserBlock(){
  if(!selectedUser)return;
  const blocked=Boolean(selectedUser.banned_until);
  if(!confirm(`${blocked?'Desbloquear':'Bloquear'} este usuário?`))return;
  try{await godApi(blocked?'unbanUser':'banUser',{user_id:selectedUser.id});toast(blocked?'Usuário desbloqueado.':'Usuário bloqueado.');closeUserGodModal();await loadUsers($('userSearch').value);}
  catch(err){$('userGodStatus').textContent='Erro: '+err.message;}
}
async function deleteUserAuth(){
  if(!selectedUser)return;
  const typed=prompt(`EXCLUSÃO DE USUÁRIO AUTH\n\n${selectedUser.email||selectedUser.id}\n\nIsso remove a conta do Supabase Auth. Digite EXCLUIR USUARIO para confirmar:`);
  if(typed!=='EXCLUIR USUARIO')return;
  try{const r=await godApi('deleteUser',{user_id:selectedUser.id,force:true});toast(r?.message||'Usuário excluído do Auth.');closeUserGodModal();await Promise.all([loadUsers($('userSearch').value),loadStores($('storeSearch').value),loadSummary()]);}
  catch(err){$('userGodStatus').textContent='Erro: '+err.message;}
}

function openStoreGod(id){
  selectedStore=stores.find(x=>x.id===id)||null;if(!selectedStore)return;
  $('storeGodTitle').textContent='Editar — '+selectedStore.nome;
  $('godStoreName').value=selectedStore.nome||'';
  $('godStoreSlug').value=selectedStore.slug||'';
  $('godStoreOwner').value=selectedStore.dono_email||'';
  $('storeGodStatus').textContent='';
  $('storeGodModal').hidden=false;
  godApi('getStoreDetails',{establishment_id:id}).then(r=>{
    const e=r?.estabelecimento||r||{};
    $('godStorePhone').value=e.telefone||'';$('godStoreWhatsapp').value=e.whatsapp_numero||'';$('godStoreInstagram').value=e.instagram||'';$('godStoreEmail').value=e.email_contato||'';$('godStoreAddress').value=e.endereco||'';
  }).catch(()=>{});
}
function closeStoreGodModal(){ $('storeGodModal').hidden=true; selectedStore=null; }
async function saveStoreGod(){
  if(!selectedStore)return;
  const payload={establishment_id:selectedStore.id,nome:$('godStoreName').value.trim(),slug:$('godStoreSlug').value.trim(),telefone:$('godStorePhone').value.trim(),whatsapp_numero:$('godStoreWhatsapp').value.trim(),instagram:$('godStoreInstagram').value.trim(),email_contato:$('godStoreEmail').value.trim(),endereco:$('godStoreAddress').value.trim()};
  if(!payload.nome||!payload.slug){$('storeGodStatus').textContent='Nome e slug são obrigatórios.';return;}
  if(!confirm('Salvar estas alterações diretamente no estabelecimento?'))return;
  try{await godApi('updateStore',payload);toast('Estabelecimento atualizado.');closeStoreGodModal();await loadStores($('storeSearch').value);}
  catch(err){$('storeGodStatus').textContent='Erro: '+err.message;}
}

function openTransfer(id){
  selectedStore=stores.find(x=>x.id===id)||null;if(!selectedStore)return;
  $('transferTitle').textContent='Transferir — '+selectedStore.nome;
  $('transferEmail').value=''; $('transferStatus').textContent=''; $('transferModal').hidden=false; setTimeout(()=>$('transferEmail').focus(),50);
}
function closeTransferModal(){ $('transferModal').hidden=true; selectedStore=null; }

async function confirmTransfer(){
  if(!selectedStore)return;
  const email=$('transferEmail').value.trim().toLowerCase();
  if(!email||!email.includes('@')){ $('transferStatus').textContent='Digite um e-mail válido.'; return; }
  if(!confirm(`Transferir “${selectedStore.nome}” para ${email}? O proprietário atual perderá o acesso a este cardápio.`)) return;
  const btn=$('confirmTransferBtn');btn.disabled=true;$('transferStatus').textContent='Processando transferência...';
  try{
    const r=await api('transferStore',{establishment_id:selectedStore.id,email});
    $('transferStatus').textContent=r.mensagem||'Transferência registrada.';
    toast(r.status==='concluida'?'Cardápio transferido.':'Transferência pendente criada.');
    await Promise.all([loadStores($('storeSearch').value),loadTransfers(),loadSummary()]);
    if(r.status==='concluida') setTimeout(closeTransferModal,900);
  }catch(err){if(!handleApiError(err))$('transferStatus').textContent='Erro: '+err.message;}
  finally{btn.disabled=false;}
}

async function loadTransfers(){
  const host=$('transfersTable');host.innerHTML='<div class="loading">Carregando...</div>';
  try{
    const rows=await api('listTransfers')||[];
    if(!rows.length){host.innerHTML='<div class="empty">Nenhuma transferência registrada.</div>';return;}
    host.innerHTML=`<table><thead><tr><th>Estabelecimento</th><th>Novo e-mail</th><th>Status</th><th>Solicitada</th><th>Concluída</th><th>Admin</th><th>Ações</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${escapeHtml(t.estabelecimento_nome)}</td><td>${escapeHtml(t.email_destino)}</td><td><span class="badge ${t.status==='pendente'?'pending':t.status==='concluida'?'done':'cancel'}">${escapeHtml(t.status.toUpperCase())}</span></td><td>${fmtDate(t.created_at)}</td><td>${fmtDate(t.completed_at)}</td><td>${escapeHtml(t.solicitado_por_email||'—')}</td><td>${t.status==='pendente'?`<button class="small-btn danger-lite" onclick="cancelTransfer('${t.id}')">Cancelar</button>`:'—'}</td></tr>`).join('')}</tbody></table>`;
  }catch(err){if(!handleApiError(err))host.innerHTML='<div class="empty">Erro ao carregar transferências.</div>';}
}

async function cancelTransfer(id){
  if(!confirm('Cancelar esta transferência pendente?'))return;
  try{await api('cancelTransfer',{transfer_id:id});toast('Transferência cancelada.');await Promise.all([loadTransfers(),loadSummary()]);}
  catch(err){if(!handleApiError(err))alert('Erro: '+err.message);}
}

window.toggleStore=toggleStore;
window.openTransfer=openTransfer;
window.cancelTransfer=cancelTransfer;
window.viewMenu=viewMenu;
window.deleteStore=deleteStore;
window.openUserGod=openUserGod;
window.sendPasswordRecovery=sendPasswordRecovery;
window.openStoreGod=openStoreGod;
window.godToggleProduct=godToggleProduct;
window.godDeleteProduct=godDeleteProduct;
init();


async function loadSystemStatus(){
  const status=$('systemActionStatus');
  if(status) status.textContent='Consultando versão global...';
  try{
    const r=await api('getCacheStatus');
    const c=r?.data||r||{};
    if($('systemCacheVersion')) $('systemCacheVersion').textContent=String(c.cache_version ?? '—');
    if($('systemEmergencyVersion')) $('systemEmergencyVersion').textContent=String(c.emergency_version ?? '—');
    if($('systemUpdatedAt')) $('systemUpdatedAt').textContent=fmtDate(c.updated_at);
    if($('systemLastAction')) $('systemLastAction').textContent=formatSystemAction(c.last_action, c.last_note);
    if(status) status.textContent='';
  }catch(err){
    if(!handleApiError(err) && status) status.textContent='Não foi possível consultar o controle global: '+err.message;
  }
}
function formatSystemAction(action,note){
  if(note) return String(note);
  if(action==='force_update') return 'Atualização global';
  if(action==='emergency_reset') return 'Reset de emergência';
  return action||'—';
}
async function forceGlobalUpdate(){
  const ok=confirm('Forçar todos os dispositivos conectados a recarregar a versão mais recente do sistema?');
  if(!ok)return;
  const btn=$('forceUpdateBtn'), status=$('systemActionStatus');
  if(btn)btn.disabled=true;
  if(status)status.textContent='Enviando atualização global...';
  try{
    const r=await api('forceUpdate');
    const c=r?.data||r||{};
    toast(`Atualização global enviada. Versão ${c.cache_version ?? ''}`.trim());
    if(status)status.textContent='Atualização enviada. Dispositivos online começarão a recarregar automaticamente.';
    await loadSystemStatus();
  }catch(err){
    if(!handleApiError(err) && status)status.textContent='Falha ao enviar atualização: '+err.message;
  }finally{if(btn)btn.disabled=false;}
}
async function emergencyGlobalReset(){
  const primeira=confirm('RESET DE EMERGÊNCIA\n\nIsso mandará todos os dispositivos conectados limpar caches controlados do site e recarregar. Continue somente se uma atualização normal não resolveu.');
  if(!primeira)return;
  const confirmacao=prompt('Digite RESET para confirmar o reset global de emergência:');
  if(String(confirmacao||'').trim().toUpperCase()!=='RESET')return;
  const btn=$('emergencyResetBtn'), status=$('systemActionStatus');
  if(btn)btn.disabled=true;
  if(status)status.textContent='Enviando reset global de emergência...';
  try{
    const r=await api('emergencyReset');
    const c=r?.data||r||{};
    toast(`Reset de emergência enviado. Versão ${c.cache_version ?? ''}`.trim());
    if(status)status.textContent='Reset enviado. Dispositivos online limparão os caches do site e recarregarão automaticamente.';
    await loadSystemStatus();
  }catch(err){
    if(!handleApiError(err) && status)status.textContent='Falha no reset de emergência: '+err.message;
  }finally{if(btn)btn.disabled=false;}
}
