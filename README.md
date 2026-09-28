# SuperAdmin GOD — Império do Açaí

Painel administrativo exclusivo do estabelecimento **Império do Açaí**.

## Escopo

O backend está travado no estabelecimento:

`01df0795-8f3b-4484-97b5-6b75bb0d3276`

Mesmo usando a `service_role` no servidor, a Edge Function `super-admin-god` valida e executa ações somente para esse estabelecimento.

## Funções

- editar os dados e o status da loja;
- listar, ativar, desativar e excluir produtos;
- visualizar pedidos e alterar status;
- visualizar equipe, garçons e entregadores;
- ativar/desativar membros da equipe;
- visualizar o proprietário;
- trocar e-mail e senha do proprietário;
- enviar recuperação de senha;
- bloquear/desbloquear o proprietário;
- excluir o usuário proprietário com confirmação;
- excluir o estabelecimento com confirmação forte;
- registrar ações críticas em `super_admin_logs`.

## Segurança

O navegador não contém a `SUPABASE_SERVICE_ROLE_KEY`. O frontend usa a sessão temporária do `super-admin-api` existente. As operações privilegiadas são executadas na Edge Function `super-admin-god`.

A função foi publicada no projeto Supabase `cardapio-digital`.
