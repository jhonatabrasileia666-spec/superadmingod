# Universal v2 — patch sobre o projeto Michel

Esta branch é de desenvolvimento e não altera a main.

## Linha-base
- Michel continua sendo o motor universal de produtos/categorias/variações.
- LV/LW são usados apenas como referência para módulos operacionais.
- Todo módulo e dado novo é isolado por estabelecimento.

## Banco já preparado
- estabelecimentos.modulos_config
- financeiro_custos_diarios
- financeiro_despesas
- ia_config_estabelecimento
- universal_contexto_acesso(uuid)
- universal_listar_mesas(uuid)
- universal_criar_pedido_garcom(uuid,uuid,text,jsonb)
- Edge Function universal-staff-login

## Arquivos desta pasta
- universal-modules.js / universal-modules.css: módulos do painel
- garcom.html / garcom.js / garcom.css: operação do garçom por mesa

No projeto Michel, carregue universal-modules.css no head e universal-modules.js depois de app.js.
O formulário de produtos do Michel não deve ser substituído.
