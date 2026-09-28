const BASE='https://xzhxqjgekqbyucdgtvra.supabase.co/functions/v1';
const API_URL=BASE+'/super-admin-api';
const GOD_URL=BASE+'/super-admin-god';
const TOKEN_KEY='imperio_superadmin_god_token';

let token=sessionStorage.getItem(TOKEN_KEY)||'';
let state={store:null,owner:null,metrics:{},products:[],orders:[],team:null};
const $=id=>document.getElementById(id);
const esc=v=>{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML};
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const date=v=>v?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—';
let toastTimer;
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}

async function loginApi(password){
  const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',password})});
  const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||'Falha no login');return p;
}
async function ping(){
  const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ping',token})});
  if(!r.ok)throw new Error('Sessão expirada');return true;
}
async function god(action,params={}){
  const r=await fetch(GOD_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...params})});
  const p=await r.json().catch(()=>({}));if(!r.ok||p?.ok===false)throw new Error(p.error||p.message||'Ação recusada');return p.data??p;
}

function showLogin(){ $('loginGate').hidden=false; $('adminApp').hidden=true; setTimeout(()=>$('adminPassword').focus(),50) }
function showApp(){ $('loginGate').hidden=true; $('adminApp').hidden=false }
function logout(){ token='';sessionStorage.removeItem(TOKEN_KEY);showLogin() }

async function login(){
  const password=$('adminPassword').value;
  if(!password){$('loginStatus').textContent='Digite a senha.';return}
  $('loginBtn').disabled=true;$('loginStatus').textContent='Validando...';
  try{
    const r=await loginApi(password);token=r.token;sessionStorage.setItem(TOKEN_KEY,token);$('adminPassword').value='';$('loginStatus').textContent='';showApp();await refreshAll();
  }catch(e){$('loginStatus').textContent=e.message}
  finally{$('loginBtn').disabled=false}
}

async function refreshAll(){
  try{
    const b=await god('bootstrap');state.store=b.store;state.owner=b.owner;state.metrics=b.metrics||{};
    renderDashboard();fillStoreForm();renderOwner();
    await Promise.all([loadProducts(),loadOrders(),loadTeam()]);
  }catch(e){if(/sessão/i.test(e.message)){logout();return}toast(e.message)}
}

function renderDashboard(){
  const s=state.store||{},m=state.metrics||{};
  $('mProducts').textContent=Number(m.products||0);$('mOrders').textContent=Number(m.orders||0);$('mTeam').textContent=Number(m.team||0);$('mRevenue').textContent=money(m.revenue||0);
  $('storeBadge').textContent=s.ativo?'ATIVO':'DESATIVADO';$('storeBadge').className='badge '+(s.ativo?'on':'off');
  $('storeSummary').innerHTML=[
    ['Nome',s.nome],['Slug',s.slug],['Telefone',s.telefone],['WhatsApp',s.whatsapp_numero],['Instagram',s.instagram],['Endereço',s.endereco],['Fuso',s.fuso_horario],['Proprietário',state.owner?.email||'Sem usuário']
  ].map(([a,b])=>`<div><span>${esc(a)}</span><strong>${esc(b||'—')}</strong></div>`).join('');
}

function fillStoreForm(){
  const s=state.store||{};
  $('storeNome').value=s.nome||'';$('storeSlug').value=s.slug||'';$('storeTelefone').value=s.telefone||'';$('storeWhatsapp').value=s.whatsapp_numero||'';
  $('storeInstagram').value=s.instagram||'';$('storeEmail').value=s.email_contato||'';$('storeEndereco').value=s.endereco||'';$('storeFuso').value=s.fuso_horario||'America/Rio_Branco';$('storeAtivo').value=String(Boolean(s.ativo));
}
async function saveStore(){
  try{
    await god('updateStore',{nome:$('storeNome').value,slug:$('storeSlug').value,telefone:$('storeTelefone').value,whatsapp_numero:$('storeWhatsapp').value,instagram:$('storeInstagram').value,email_contato:$('storeEmail').value,endereco:$('storeEndereco').value,fuso_horario:$('storeFuso').value,ativo:$('storeAtivo').value==='true'});
    toast('Estabelecimento atualizado.');await refreshAll();
  }catch(e){toast(e.message)}
}

async function loadProducts(){
  try{state.products=await god('listProducts')||[];renderProducts()}catch(e){$('productsList').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
function renderProducts(){
  const q=$('productSearch')?.value?.trim().toLowerCase()||'';
  const rows=state.products.filter(p=>!q||String(p.nome).toLowerCase().includes(q));
  $('productsList').innerHTML=rows.length?rows.map(p=>{
    const vars=Array.isArray(p.produto_variantes)?p.produto_variantes:[];
    const prices=vars.length?vars.map(v=>[v.tamanho,v.sabor].filter(Boolean).join(' · ')+' '+money(v.preco)).join(' | '):'Sem variações';
    return `<article class="card-item"><div><span class="badge ${p.ativo?'on':'off'}">${p.ativo?'ATIVO':'INATIVO'}</span><h3>${esc(p.nome)}</h3><p>${esc(p.descricao||'')}</p><small>${esc(prices)}</small></div><div class="actions wrap"><button class="ghost" onclick="toggleProduct('${p.id}',${!p.ativo})">${p.ativo?'Desativar':'Ativar'}</button><button class="danger" onclick="deleteProduct('${p.id}')">Excluir</button></div></article>`;
  }).join(''):'<div class="empty">Nenhum produto encontrado.</div>';
}
async function toggleProduct(id,active){if(!confirm(`${active?'Ativar':'Desativar'} este produto?`))return;try{await god('toggleProduct',{product_id:id,active});toast('Produto atualizado.');await loadProducts();await refreshMetrics()}catch(e){toast(e.message)}}
async function deleteProduct(id){const p=state.products.find(x=>x.id===id);const typed=prompt(`Para excluir definitivamente "${p?.nome||'produto'}", digite EXCLUIR`);if(typed!=='EXCLUIR')return;try{await god('deleteProduct',{product_id:id});toast('Produto excluído.');await loadProducts();await refreshMetrics()}catch(e){toast(e.message)}}
async function refreshMetrics(){const b=await god('bootstrap');state.store=b.store;state.owner=b.owner;state.metrics=b.metrics||{};renderDashboard()}

async function loadOrders(){
  try{state.orders=await god('listOrders')||[];renderOrders()}catch(e){$('ordersList').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
function renderOrders(){
  const rows=state.orders;
  $('ordersList').innerHTML=rows.length?`<table><thead><tr><th>Data</th><th>Cliente</th><th>Entrega</th><th>Pagamento</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${date(o.created_at)}</td><td><strong>${esc(o.cliente_nome||'—')}</strong><br><span class="muted">${esc(o.cliente_telefone||'')}</span></td><td>${esc(o.forma_entrega||'—')}</td><td>${esc(o.forma_pagamento||'—')}</td><td>${money(o.total)}</td><td><select onchange="changeOrderStatus('${o.id}',this.value)"><option selected>${esc(o.status||'')}</option><option value="novo">novo</option><option value="preparo">preparo</option><option value="pronto">pronto</option><option value="saiu_para_entrega">saiu_para_entrega</option><option value="finalizado">finalizado</option><option value="cancelado">cancelado</option></select></td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhum pedido encontrado.</div>';
}
async function changeOrderStatus(id,status){try{await god('updateOrderStatus',{order_id:id,status});toast('Status atualizado.');await loadOrders()}catch(e){toast(e.message)}}

async function loadTeam(){
  try{state.team=await god('listTeam');renderTeam()}catch(e){$('teamList').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
function renderTeam(){
  const team=state.team?.team||[],drivers=state.team?.drivers||[],waiters=state.team?.waiters||[];
  const a=team.map(m=>`<article class="card-item"><div><span class="badge ${m.ativo?'on':'off'}">${m.ativo?'ATIVO':'INATIVO'}</span><h3>${esc(m.nome||m.role)}</h3><p>${esc(m.role||'equipe')}</p></div><button class="ghost" onclick="toggleTeam('${m.id}',${!m.ativo})">${m.ativo?'Desativar':'Ativar'}</button></article>`);
  const d=drivers.map(m=>`<article class="card-item"><div><span class="eyebrow">ENTREGADOR</span><h3>${esc(m.nome)}</h3><p>${esc(m.telefone||'')}</p></div></article>`);
  const w=waiters.map(m=>`<article class="card-item"><div><span class="eyebrow">GARÇOM</span><h3>${esc(m.nome)}</h3><p>${esc(m.telefone||'')}</p></div></article>`);
  $('teamList').innerHTML=[...a,...d,...w].join('')||'<div class="empty">Nenhum membro cadastrado.</div>';
}
async function toggleTeam(id,active){try{await god('toggleTeamMember',{member_id:id,active});toast('Acesso atualizado.');await loadTeam()}catch(e){toast(e.message)}}

function renderOwner(){
  const o=state.owner;
  $('ownerInfo').innerHTML=o?`<h3>${esc(o.email||'Sem e-mail')}</h3><p class="muted">ID: ${esc(o.id)}</p><p>Último acesso: ${date(o.last_sign_in_at)}</p><p>Bloqueio: ${esc(o.banned_until||'não')}</p>`:'<p>Sem proprietário vinculado.</p>';
  $('ownerEmail').value=o?.email||'';
}
async function ownerAction(action,params={},confirmText=''){if(confirmText&&!confirm(confirmText))return;try{await god(action,params);toast('Ação concluída.');await refreshMetrics();renderOwner()}catch(e){toast(e.message)}}

async function disableStore(active){try{await god('updateStore',{nome:state.store.nome,slug:state.store.slug,telefone:state.store.telefone,whatsapp_numero:state.store.whatsapp_numero,instagram:state.store.instagram,email_contato:state.store.email_contato,endereco:state.store.endereco,fuso_horario:state.store.fuso_horario,ativo:active});toast(active?'Loja reativada.':'Loja desativada.');await refreshAll()}catch(e){toast(e.message)}}
async function deleteStore(){const x=prompt('Digite EXCLUIR IMPERIO DO ACAI para confirmar a exclusão total');if(x!=='EXCLUIR IMPERIO DO ACAI')return;try{await god('deleteStore',{confirm:x});toast('Estabelecimento excluído.')}catch(e){toast(e.message)}}

document.addEventListener('DOMContentLoaded',async()=>{
  $('loginBtn').onclick=login;$('adminPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('logoutBtn').onclick=logout;$('refreshBtn').onclick=refreshAll;$('saveStoreBtn').onclick=saveStore;
  $('productSearch').addEventListener('input',renderProducts);$('reloadOrdersBtn').onclick=loadOrders;
  $('ownerEmailBtn').onclick=()=>ownerAction('ownerSetEmail',{email:$('ownerEmail').value},'Alterar o e-mail de autenticação do proprietário?');
  $('ownerPasswordBtn').onclick=()=>{const p=$('ownerPassword').value;if(p.length<10)return toast('Use pelo menos 10 caracteres.');ownerAction('ownerSetPassword',{password:p},'Trocar a senha do proprietário agora?')};
  $('ownerRecoveryBtn').onclick=()=>ownerAction('ownerRecovery',{},'Enviar e-mail de redefinição de senha?');
  $('ownerBanBtn').onclick=()=>ownerAction('ownerBan',{},'Bloquear o proprietário no Supabase Auth?');$('ownerUnbanBtn').onclick=()=>ownerAction('ownerUnban');
  $('deleteOwnerBtn').onclick=async()=>{const x=prompt('Digite EXCLUIR PROPRIETARIO');if(x!=='EXCLUIR PROPRIETARIO')return;try{await god('ownerDelete',{confirm:x});toast('Usuário proprietário excluído.');await refreshAll()}catch(e){toast(e.message)}};
  $('disableStoreBtn').onclick=()=>disableStore(false);$('enableStoreBtn').onclick=()=>disableStore(true);$('deleteStoreBtn').onclick=deleteStore;
  document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+btn.dataset.view));if(btn.dataset.view==='products')loadProducts();if(btn.dataset.view==='orders')loadOrders();if(btn.dataset.view==='team')loadTeam()});
  if(!token)return showLogin();try{await ping();showApp();await refreshAll()}catch{logout()}
});