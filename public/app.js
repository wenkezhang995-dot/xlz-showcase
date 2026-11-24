'use strict';
/* =====================================================================
   XLZ 服装档口 · 产品展示  —  应用逻辑（纯前端 / localStorage）
   配色：巴西国旗 绿 #009C3B · 黄 #FFDF00 · 蓝 #002776
   ===================================================================== */
(function () {

/* ------------------------------------------------------------------ *
 * 0. 基础工具
 * ------------------------------------------------------------------ */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const now = () => Date.now();
const debounce = (fn, ms = 150) => {
  let timer = 0;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};
const uid = (prefix = 'p') => prefix + now().toString(36) + Math.random().toString(36).slice(2, 6);
const SESSION_MS = 8 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * 1. SHA-256（管理员密码不以明文存储）
 * ------------------------------------------------------------------ */
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
function sha256(text) {
  const bytes = new TextEncoder().encode(String(text));
  const bitLen = bytes.length * 8;
  const total = ((bytes.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 4294967296));
  dv.setUint32(total - 4, bitLen >>> 0);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H).map((x) => x.toString(16).padStart(8, '0')).join('');
}
const SALT = 'XLZ#ATACADO';
const hashPwd = (user, pwd) => sha256(SALT + '|' + String(user).toLowerCase() + '|' + String(pwd));

/* ------------------------------------------------------------------ *
 * 2. 常量与默认数据
 * ------------------------------------------------------------------ */
const KEY = {
  products: 'xlz.products.v1',
  admins: 'xlz.admins.v1',
  cats: 'xlz.categories.v1',
  settings: 'xlz.settings.v1',
  session: 'xlz.session.v1',
  lang: 'xlz.lang.v1'
};
const SIZE_ORDER = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3', 'G4'];
const DEFAULT_CATS = [
  { id: 'tops', zh: '上衣', pt: 'Partes de Cima' },
  { id: 'bottoms', zh: '下装', pt: 'Partes de Baixo' }
];
const DEFAULT_SETTINGS = {
  phone: '+55 11 91234-5678',
  address: 'Rua 25 de Março, 1234 — Centro, São Paulo — SP',
  mapQuery: 'Rua 25 de Março 1234 São Paulo'
};

const state = {
  lang: 'mix',
  products: [],
  admins: [],
  cats: [],
  settings: {},
  session: null,
  query: '',
  cat: 'all'
};
let F = null;            // 当前表单状态
let detailColor = 0;     // 详情页当前颜色
let lastProductId = '';
let pendingRoute = '';
let lastKey = '';

/* ------------------------------------------------------------------ *
 * 3. 多语言
 * ------------------------------------------------------------------ */
const I18N = {
  login: ['登录', 'Entrar'],
  logout: ['退出登录', 'Sair'],
  back: ['返回', 'Voltar'],
  backHome: ['返回首页', 'Voltar ao início'],
  clear: ['清空', 'Limpar'],
  searchPh: ['搜索品名 / 型号', 'Buscar nome ou modelo'],
  searchResult: ['搜索', 'Busca'],
  pieces: ['款', 'peças'],
  kicker: ['2026 秋冬系列', 'Coleção 2026'],
  heroTitle: ['本周上新', 'Novo drop'],
  heroSub: ['圣保罗档口现货 · 支持拿货', 'Peças prontas em São Paulo para revenda'],
  statOnSale: ['款在售', 'à venda'],
  statCats: ['个栏目', 'seções'],
  allCats: ['全部', 'Todos'],
  emptyCat: ['该栏目暂无产品', 'Nenhum produto nesta seção'],
  emptySearch: ['没有找到相关产品', 'Nada encontrado'],
  emptySearchHint: ['换个品名、型号或颜色试试', 'Tente outro nome, modelo ou cor'],
  emptyNone: ['还没有上架产品', 'Ainda não há produtos'],
  emptyNoneHint: ['管理员登录后点击「+」上传第一款产品', 'Entre como administrador e use + para publicar'],
  addProduct: ['新增产品', 'Novo produto'],
  badgeNew: ['新品', 'Novo'],
  badgeOff: ['已下架', 'Inativo'],
  starBadge: ['星标', 'Destaque'],
  formNew: ['新增产品', 'Novo produto'],
  formEdit: ['编辑产品', 'Editar produto'],
  notFound: ['产品不存在或已下架', 'Produto indisponível'],
  price: ['售价', 'Preço'],
  model: ['型号', 'Modelo'],
  colors: ['颜色', 'Cores'],
  sizes: ['尺码', 'Tamanhos'],
  stockHint: ['选择颜色查看尺码库存', 'Escolha a cor para ver o estoque'],
  inStock: ['有货', 'Disponível'],
  oos: ['无货', 'Esgotado'],
  soldOut: ['该颜色暂时售罄', 'Cor esgotada'],
  contact: ['到店看货', 'Visite a loja'],
  comeVisit: ['批发 · 零售', 'Atacado e varejo'],
  phone: ['电话', 'Telefone'],
  address: ['地址', 'Endereço'],
  callNow: ['一键拨号', 'Ligar agora'],
  zoomHint: ['点击放大', 'Toque para ampliar'],
  edit: ['编辑', 'Editar'],
  delete: ['删除', 'Excluir'],
  save: ['保存', 'Salvar'],
  cancel: ['取消', 'Cancelar'],
  confirm: ['确认', 'Confirmar'],
  confirmDel: ['确认删除', 'Excluir'],
  adminTitle: ['管理后台', 'Painel'],
  tabProducts: ['产品', 'Produtos'],
  tabAccounts: ['账号', 'Contas'],
  tabSettings: ['店铺', 'Loja'],
  allProducts: ['产品库', 'Produtos'],
  statusOn: ['上架', 'Ativo'],
  statusOff: ['下架', 'Inativo'],
  newMark: ['新品', 'Novo'],
  starMark: ['星标', 'Destaque'],
  accountsTitle: ['管理员账号', 'Administradores'],
  addAccount: ['新增账号', 'Nova conta'],
  changePwd: ['修改密码', 'Alterar senha'],
  curPwd: ['当前密码', 'Senha atual'],
  newPwd: ['新密码', 'Nova senha'],
  confirmPwd: ['确认新密码', 'Confirmar senha'],
  createdOn: ['创建于', 'Criado em'],
  you: ['当前', 'Você'],
  storeInfo: ['店铺信息', 'Informações da loja'],
  storePhone: ['联系电话', 'Telefone'],
  storeAddr: ['门店地址', 'Endereço'],
  categories: ['产品分类', 'Categorias'],
  catZh: ['中文名称', 'Nome em chinês'],
  catPt: ['葡文名称', 'Nome em português'],
  addCategory: ['添加分类', 'Adicionar'],
  catInUse: ['该分类下还有产品，无法删除', 'Categoria com produtos'],
  dataTitle: ['数据备份', 'Backup de dados'],
  exportJson: ['导出备份', 'Exportar'],
  importJson: ['导入备份', 'Importar'],
  dataNote: ['数据保存在本机浏览器。换设备时，可用备份文件迁移。', 'Os dados ficam neste navegador. Use o backup para migrar.'],
  fBasic: ['基本信息', 'Informações básicas'],
  fImages: ['产品图片', 'Fotos'],
  fTags: ['颜色与尺码', 'Cores e tamanhos'],
  fStatus: ['状态与标记', 'Status e destaques'],
  fCategory: ['产品分类', 'Categoria'],
  fNameZh: ['品名（中文）', 'Nome (chinês)'],
  fNamePt: ['品名（葡文）', 'Nome (português)'],
  fModel: ['产品型号', 'Modelo'],
  fPrice: ['售价（R$）', 'Preço (R$)'],
  photoHint: ['1–10 张，首张为封面', '1 a 10 fotos · a primeira é a capa'],
  addPhoto: ['添加图片', 'Adicionar foto'],
  coverLabel: ['封面', 'Capa'],
  fColors: ['颜色标签', 'Cores'],
  colorPh: ['如：红色', 'Ex.: Vermelho'],
  fSizes: ['尺码标签', 'Tamanhos'],
  fStock: ['库存状态', 'Estoque'],
  fStockHint: ['点击格子切换有货 / 无货', 'Toque para alternar disponível / esgotado'],
  onShelfLabel: ['上架销售', 'À venda'],
  onShelfHint: ['下架后访客看不到该产品', 'Inativo não aparece na loja'],
  newHint: ['新品排在栏目最前', 'Novo aparece primeiro'],
  starHint: ['星标排在栏目最前', 'Destaque aparece primeiro'],
  saveProduct: ['保存产品', 'Salvar produto'],
  matrixHint: ['添加颜色与尺码后即可标记库存', 'Adicione cores e tamanhos para marcar o estoque'],
  noColors: ['还没有颜色', 'Sem cores'],
  loginTitle: ['管理员登录', 'Acesso do administrador'],
  loginSub: ['登录后可上传、编辑与删除产品', 'Entre para gerenciar o catálogo'],
  loginBtn: ['登录', 'Entrar'],
  loginDemo: ['初始账号', 'Contas iniciais'],
  username: ['账号', 'Usuário'],
  password: ['密码', 'Senha'],
  footTag: ['服装批发 · 圣保罗', 'Atacado de roupas · São Paulo'],
  footNote: ['演示数据保存在本机浏览器', 'Dados salvos neste navegador'],
  adminLogin: ['管理员登录', 'Área do administrador'],
  eName: ['请填写中文品名', 'Informe o nome em chinês'],
  eModel: ['请填写产品型号', 'Informe o modelo'],
  ePrice: ['请填写大于 0 的售价', 'Informe um preço maior que 0'],
  eImages: ['请至少上传 1 张图片', 'Adicione ao menos 1 foto'],
  eImagesMax: ['最多上传 10 张图片', 'Máximo de 10 fotos'],
  eColors: ['请至少添加 1 个颜色', 'Adicione ao menos 1 cor'],
  eSizes: ['请至少选择 1 个尺码', 'Selecione ao menos 1 tamanho'],
  eLogin: ['账号或密码错误', 'Usuário ou senha incorretos'],
  eUserExists: ['该账号已存在', 'Usuário já existe'],
  eUserShort: ['账号至少 2 位', 'Usuário com no mínimo 2 caracteres'],
  ePwdShort: ['密码至少 4 位', 'Senha com no mínimo 4 caracteres'],
  ePwdMatch: ['两次输入的密码不一致', 'As senhas não coincidem'],
  ePwdWrong: ['当前密码不正确', 'Senha atual incorreta'],
  eSelf: ['不能删除当前登录的账号', 'Não é possível excluir a conta atual'],
  eLastAcc: ['至少保留 1 个管理员账号', 'Mantenha ao menos 1 conta'],
  eFileType: ['仅支持 JPG / PNG / WebP', 'Use JPG, PNG ou WebP'],
  eFileSize: ['单张图片不能超过 5MB', 'Máximo de 5MB por foto'],
  eCatName: ['请填写分类名称', 'Informe o nome da categoria'],
  eFields: ['请检查标红的字段', 'Verifique os campos destacados'],
  eQuota: ['本地存储空间不足，请压缩图片或删除旧产品', 'Armazenamento local cheio'],
  eNoCat: ['请先创建产品分类', 'Crie uma categoria primeiro'],
  eColorDup: ['该颜色已存在', 'Cor já adicionada'],
  eImport: ['文件格式不正确', 'Arquivo inválido'],
  importWarn: ['导入会覆盖当前全部产品、账号与店铺设置，确定继续？', 'A importação substitui todos os dados atuais. Continuar?'],
  sSaved: ['已保存', 'Salvo'],
  sDeleted: ['已删除', 'Excluído'],
  sLogin: ['登录成功', 'Bem-vindo'],
  sLogout: ['已退出登录', 'Sessão encerrada'],
  sPwd: ['密码已更新', 'Senha atualizada'],
  sAccount: ['账号已创建', 'Conta criada'],
  sAccountDel: ['账号已删除', 'Conta removida'],
  sCatAdded: ['分类已添加', 'Categoria adicionada'],
  sCatDel: ['分类已删除', 'Categoria removida'],
  sImported: ['备份已导入', 'Backup importado'],
  sExported: ['备份已导出', 'Backup exportado'],
  delProductTitle: ['删除该产品？', 'Excluir este produto?'],
  delProductText: ['删除后不可恢复，主页与详情页会同时移除。', 'Esta ação não pode ser desfeita.'],
  delAccountTitle: ['删除该账号？', 'Excluir esta conta?'],
  delAccountText: ['删除后该账号将无法登录。', 'A conta perderá o acesso.'],
  delCatTitle: ['删除该分类？', 'Excluir esta categoria?'],
  delCatText: ['仅能删除没有产品的分类。', 'Só categorias vazias podem ser excluídas.']
};

function t(key) {
  const e = I18N[key] || [key, key];
  if (state.lang === 'zh') return esc(e[0]);
  if (state.lang === 'pt') return esc(e[1]);
  return '<span class="tw"><span class="tz">' + esc(e[0]) + '</span><span class="tp">' + esc(e[1]) + '</span></span>';
}
function tt(key) {
  const e = I18N[key] || [key, key];
  if (state.lang === 'zh') return e[0];
  if (state.lang === 'pt') return e[1];
  return e[1] + ' / ' + e[0];
}
/* 紧凑标签：混排时只显示葡文，避免小尺寸控件拥挤 */
function tc(key) {
  const e = I18N[key] || [key, key];
  return state.lang === 'zh' ? esc(e[0]) : esc(e[1]);
}
/* 单个名称：中文模式取中文，其余取葡文 */
function oneName(obj) {
  if (!obj) return '';
  return state.lang === 'zh' ? (obj.zh || obj.pt || '') : (obj.pt || obj.zh || '');
}

/* 商品/分类名称排版：混排时葡文为主、中文为辅 */
function nm(obj) {
  const zh = (obj && obj.zh) || (obj && obj.pt) || '';
  const pt = (obj && obj.pt) || zh;
  if (state.lang === 'zh') return '<span class="nm">' + esc(zh) + '</span>';
  if (state.lang === 'pt') return '<span class="nm">' + esc(pt) + '</span>';
  return '<span class="nm"><span class="zh">' + esc(zh) + '</span><span class="pt">' + esc(pt) + '</span></span>';
}
function colorNameHTML(col) {
  const zh = col.zh || '', pt = col.pt || col.zh || '';
  if (state.lang === 'pt') return '<span class="cn">' + esc(pt) + '</span>';
  if (state.lang === 'zh') return '<span class="cn">' + esc(zh) + '</span>';
  return '<span class="cn">' + esc(zh) + '</span><span class="cp">' + esc(pt) + '</span>';
}

/* ------------------------------------------------------------------ *
 * 4. 内置商品插图（SVG，占位实拍图，不依赖任何外部图片）
 * ------------------------------------------------------------------ */
const SHAPES = {
  top: 'M200 94C170 94 142 100 122 110L58 156 34 230 94 250 112 212V448C112 458 120 466 130 466H270C280 466 288 458 288 448V212L306 250 366 230 342 156 278 110C258 100 230 94 200 94Z',
  torso: 'M200 94C176 94 152 99 134 108L112 126V448C112 458 120 466 130 466H270C280 466 288 458 288 448V126L266 108C248 99 224 94 200 94Z',
  sleeveL: 'M134 108 98 132 86 366 120 372 126 150Z',
  sleeveR: 'M266 108 302 132 314 366 280 372 274 150Z',
  pants: 'M134 94H266L270 446H212L200 242 188 446H130Z',
  skirt: 'M148 118H252L306 434H94Z'
};
const SEAM = 'rgba(0,0,0,.10)';
const DETAILS = {
  polo: `
    <path d="M200 94 174 114 200 142 226 114Z" fill="rgba(0,0,0,.17)"/>
    <path d="M200 142V246" stroke="rgba(0,0,0,.22)" stroke-width="2" stroke-linecap="round"/>
    <circle cx="200" cy="164" r="2.8" fill="rgba(255,255,255,.8)"/>
    <circle cx="200" cy="194" r="2.8" fill="rgba(255,255,255,.8)"/>
    <path d="M120 216V444M280 216V444" stroke="rgba(0,0,0,.07)" stroke-width="2"/>
    <path d="M38 240 98 258M362 240 302 258" stroke="rgba(0,0,0,.10)" stroke-width="2"/>
    <path d="M116 452H284" stroke="rgba(0,0,0,.09)" stroke-width="2"/>`,
  tee: `
    <path d="M200 94C176 94 156 102 144 116C162 138 180 148 200 148C220 148 238 138 256 116C244 102 224 94 200 94Z" fill="rgba(0,0,0,.08)"/>
    <g transform="translate(200 238)" fill="none" stroke="rgba(20,30,25,.42)" stroke-width="2.4" stroke-linecap="round">
      <circle r="25"/><path d="M-25 0H25"/><path d="M0-25C13-8 13 8 0 25"/>
    </g>
    <path d="M120 216V444M280 216V444" stroke="rgba(0,0,0,.06)" stroke-width="2"/>`,
  cardigan: `
    <path d="M200 96V462" stroke="rgba(0,0,0,.15)" stroke-width="2"/>
    <path d="M200 96 174 118M200 96 226 118" stroke="rgba(0,0,0,.15)" stroke-width="2"/>
    <circle cx="214" cy="152" r="3" fill="rgba(255,255,255,.6)"/>
    <circle cx="214" cy="208" r="3" fill="rgba(255,255,255,.6)"/>
    <circle cx="214" cy="264" r="3" fill="rgba(255,255,255,.6)"/>
    <circle cx="214" cy="320" r="3" fill="rgba(255,255,255,.6)"/>
    <path d="M132 446V464M144 446V464M156 446V464M168 446V464M180 446V464M192 446V464M204 446V464M216 446V464M228 446V464M240 446V464M252 446V464M264 446V464" stroke="rgba(0,0,0,.07)" stroke-width="1.6"/>
    <path d="M96 352H120M280 352H304" stroke="rgba(0,0,0,.08)" stroke-width="6"/>`,
  jacket: `
    <path d="M200 94 170 118 200 142 230 118Z" fill="rgba(0,0,0,.15)"/>
    <path d="M200 142V458" stroke="rgba(255,255,255,.32)" stroke-width="2"/>
    <circle cx="200" cy="178" r="2.8" fill="rgba(255,255,255,.65)"/>
    <circle cx="200" cy="238" r="2.8" fill="rgba(255,255,255,.65)"/>
    <circle cx="200" cy="298" r="2.8" fill="rgba(255,255,255,.65)"/>
    <rect x="126" y="196" width="56" height="54" rx="6" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-dasharray="4 4"/>
    <rect x="218" y="196" width="56" height="54" rx="6" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-dasharray="4 4"/>
    <path d="M118 336H282" stroke="rgba(0,0,0,.07)" stroke-width="2"/>
    <path d="M94 354H120M280 354H306" stroke="rgba(0,0,0,.08)" stroke-width="6"/>`,
  puffer: `
    <path d="M152 120C154 78 246 78 248 120" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="7" stroke-linecap="round"/>
    <path d="M200 142V458" stroke="rgba(0,0,0,.18)" stroke-width="3"/>
    <path d="M118 186H282M114 236H286M114 286H286M116 336H284M120 386H280" stroke="rgba(255,255,255,.16)" stroke-width="2.5"/>
    <path d="M88 210H110M290 210H312" stroke="rgba(255,255,255,.14)" stroke-width="2.5"/>`,
  jeans: `
    <rect x="134" y="94" width="132" height="22" fill="rgba(0,0,0,.16)"/>
    <path d="M200 116V198" stroke="rgba(255,255,255,.28)" stroke-width="2"/>
    <path d="M150 124C158 150 172 158 186 154" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="2"/>
    <path d="M250 124C242 150 228 158 214 154" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="2"/>
    <path d="M162 150 152 430M238 150 248 430" stroke="rgba(0,0,0,.10)" stroke-width="2"/>
    <path d="M132 436H188M212 436H268" stroke="rgba(255,255,255,.24)" stroke-width="2" stroke-dasharray="3 4"/>
    <circle cx="158" cy="126" r="2.4" fill="rgba(255,255,255,.5)"/><circle cx="242" cy="126" r="2.4" fill="rgba(255,255,255,.5)"/>`,
  trousers: `
    <rect x="134" y="94" width="132" height="22" fill="rgba(0,0,0,.18)"/>
    <path d="M200 116V196" stroke="rgba(255,255,255,.22)" stroke-width="2"/>
    <path d="M152 124C160 148 172 156 184 152" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
    <path d="M248 124C240 148 228 156 216 152" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
    <path d="M164 152 154 430M236 152 246 430" stroke="rgba(0,0,0,.12)" stroke-width="2"/>
    <path d="M132 436H188M212 436H268" stroke="rgba(0,0,0,.10)" stroke-width="2"/>`,
  skirt: `
    <rect x="148" y="118" width="104" height="20" fill="rgba(0,0,0,.14)"/>
    <path d="M172 138 120 428M200 138V428M228 138 280 428" stroke="rgba(0,0,0,.09)" stroke-width="2"/>
    <path d="M96 428H304" stroke="rgba(255,255,255,.22)" stroke-width="2"/>
    <path d="M154 148C150 240 140 340 128 420" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"/>`
};
function garmentSVG(kind, id) {
  const fill = 'url(#f' + id + ')';
  const edge = 'stroke="rgba(0,0,0,.10)" stroke-width="1.2"';
  const detail = DETAILS[kind] || '';
  if (kind === 'pants' || kind === 'jeans' || kind === 'trousers') {
    return '<path d="' + SHAPES.pants + '" fill="' + fill + '" ' + edge + '/>' + detail;
  }
  if (kind === 'skirt') {
    return '<path d="' + SHAPES.skirt + '" fill="' + fill + '" ' + edge + '/>' + detail;
  }
  if (kind === 'cardigan' || kind === 'jacket' || kind === 'puffer') {
    return '<path d="' + SHAPES.sleeveL + '" fill="' + fill + '" ' + edge + '/>'
      + '<path d="' + SHAPES.sleeveR + '" fill="' + fill + '" ' + edge + '/>'
      + '<path d="' + SHAPES.torso + '" fill="' + fill + '" ' + edge + '/>' + detail;
  }
  return '<path d="' + SHAPES.top + '" fill="' + fill + '" ' + edge + '/>' + detail;
}
function artDataUri(opt) {
  const kind = opt.kind || 'tee';
  const color = opt.color || '#8C8C8C';
  const dark = opt.dark || color;
  const bg = opt.bg || '#F2EADB';
  const model = opt.model || '';
  const look = opt.look || 1;
  const zoom = look === 2;
  const flip = look === 3;
  const id = 'a' + Math.random().toString(36).slice(2, 8);
  const vb = zoom ? '64 86 272 340' : '0 0 400 520';
  const labels = '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="800" height="1040" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg${id}" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#E5D7BE"/>
    </linearGradient>
    <linearGradient id="f${id}" x1=".2" y1="0" x2=".8" y2="1">
      <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <pattern id="p${id}" width="9" height="9" patternUnits="userSpaceOnUse">
      <path d="M0 9 9 0" stroke="rgba(11,31,18,.035)" stroke-width="1"/>
    </pattern>
    <radialGradient id="g${id}" cx=".5" cy=".4" r=".62">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="520" fill="url(#bg${id})"/>
  <rect width="400" height="520" fill="url(#p${id})"/>
  <circle cx="200" cy="244" r="158" fill="url(#g${id})"/>
  <circle cx="200" cy="244" r="158" fill="none" stroke="rgba(11,31,18,.055)"/>
  <ellipse cx="200" cy="474" rx="104" ry="11" fill="#0B1F12" opacity=".07"/>
  <g ${flip ? 'transform="translate(400,0) scale(-1,1)"' : ''}>${garmentSVG(kind, id)}</g>
  ${labels}
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const FALLBACK_ART = artDataUri({ kind: 'tee', color: '#009C3B', dark: '#006827', bg: '#F2EADB' });

/* ------------------------------------------------------------------ *
 * 5. 种子数据
 * ------------------------------------------------------------------ */
function artSet(kind, pal, model) {
  return [1, 2, 3].map((look) => artDataUri({ kind, color: pal[0], dark: pal[1], bg: pal[2], model, look }));
}
function makeProduct(o) {
  return {
    id: 'p' + o.model,
    category: o.cat,
    name: o.name,
    model: o.model,
    price: o.price,
    sizes: o.sizes,
    colors: o.colors,
    images: artSet(o.art.kind, o.art.pal, o.model),
    onShelf: o.onShelf !== false,
    isNew: !!o.isNew,
    starred: !!o.starred,
    createdAt: now() - (o.age || 0) * 86400000
  };
}
function seedProducts() {
  return [
    makeProduct({
      cat: 'tops', name: { zh: 'polo 衫', pt: 'Camisa Polo' }, model: '2506', price: 79.9,
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [{ zh: '红色', pt: 'Vermelho', stock: { P: true, M: false, G: true, GG: true } }],
      art: { kind: 'polo', pal: ['#C8102E', '#8E0A20', '#F2E8D8'] }, isNew: true, age: 2
    }),
    makeProduct({
      cat: 'tops', name: { zh: '针织开衫', pt: 'Cardigã de Tricô' }, model: '2511', price: 129.9,
      sizes: ['P', 'M', 'G'],
      colors: [
        { zh: '米色', pt: 'Bege', stock: { P: true, M: true, G: true } },
        { zh: '黑色', pt: 'Preto', stock: { P: true, M: false, G: true } }
      ],
      art: { kind: 'cardigan', pal: ['#D6BF9C', '#B99E77', '#EFE5D3'] }, starred: true, age: 9
    }),
    makeProduct({
      cat: 'tops', name: { zh: '印花T恤', pt: 'Camiseta Estampada' }, model: '2502', price: 49.9,
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [
        { zh: '白色', pt: 'Branco', stock: { P: true, M: true, G: false, GG: true } },
        { zh: '黑色', pt: 'Preto', stock: { P: true, M: true, G: true, GG: true } }
      ],
      art: { kind: 'tee', pal: ['#F7F3E8', '#DDD5C3', '#EFE6D4'] }, isNew: true, starred: true, age: 3
    }),
    makeProduct({
      cat: 'tops', name: { zh: '牛仔外套', pt: 'Jaqueta Jeans' }, model: '2518', price: 189.9,
      sizes: ['M', 'G', 'GG'],
      colors: [{ zh: '牛仔蓝', pt: 'Azul Jeans', stock: { M: true, G: true, GG: false } }],
      art: { kind: 'jacket', pal: ['#4A6E9C', '#345274', '#F0E8DA'] }, isNew: true, age: 1
    }),
    makeProduct({
      cat: 'bottoms', name: { zh: '直筒牛仔裤', pt: 'Calça Jeans Reta' }, model: '2501', price: 159.9,
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [
        { zh: '蓝色', pt: 'Azul', stock: { P: true, M: true, G: true, GG: true } },
        { zh: '黑色', pt: 'Preto', stock: { P: false, M: true, G: true, GG: true } }
      ],
      art: { kind: 'jeans', pal: ['#3E6493', '#2A476B', '#F2EADD'] }, starred: true, age: 12
    }),
    makeProduct({
      cat: 'bottoms', name: { zh: '阔腿西裤', pt: 'Calça Wide Leg' }, model: '2509', price: 139.9,
      sizes: ['P', 'M', 'G'],
      colors: [
        { zh: '黑色', pt: 'Preto', stock: { P: true, M: true, G: true } },
        { zh: '米色', pt: 'Bege', stock: { P: true, M: false, G: true } }
      ],
      art: { kind: 'trousers', pal: ['#2A2A2E', '#141417', '#F3EBDD'] }, isNew: true, age: 4
    }),
    makeProduct({
      cat: 'bottoms', name: { zh: '缎面半裙', pt: 'Saia Midi Cetim' }, model: '2504', price: 99.9,
      sizes: ['P', 'M', 'G'],
      colors: [{ zh: '米色', pt: 'Bege', stock: { P: true, M: true, G: true } }],
      art: { kind: 'skirt', pal: ['#D9C7AE', '#BFA983', '#F1E8D9'] }, age: 16
    }),
    makeProduct({
      cat: 'tops', name: { zh: '棉服外套', pt: 'Jaqueta Puffer' }, model: '2500', price: 259.9,
      sizes: ['M', 'G', 'GG'],
      colors: [{ zh: '墨绿', pt: 'Verde Musgo', stock: { M: true, G: true, GG: true } }],
      art: { kind: 'puffer', pal: ['#24513A', '#163525', '#EFE7D8'] }, onShelf: false, age: 30
    })
  ];
}
function seedAdmins() {
  const ts = now();
  return [
    { u: 'admin', h: hashPwd('admin', 'admin123'), created: ts },
    { u: 'staff', h: hashPwd('staff', 'staff123'), created: ts }
  ];
}

/* ------------------------------------------------------------------ *
 * 6. 存储与读取
 * ------------------------------------------------------------------ */
function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function writeLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { return false; }
}
function saveProducts() {
  try { localStorage.setItem(KEY.products, JSON.stringify(state.products)); return true; }
  catch (e) { toast(t('eQuota')); return false; }
}
function saveAdmins() {
  try { localStorage.setItem(KEY.admins, JSON.stringify(state.admins)); return true; }
  catch (e) { toast(t('eQuota')); return false; }
}
function saveSettings() {
  return writeLS(KEY.settings, state.settings);
}
function saveCats() {
  return writeLS(KEY.cats, state.cats);
}
function loadAll() {
  const lang = readLS(KEY.lang, 'mix');
  state.lang = ['zh', 'pt', 'mix'].indexOf(lang) >= 0 ? lang : 'mix';

  const cats = readLS(KEY.cats, null);
  state.cats = (Array.isArray(cats) && cats.length) ? cats : DEFAULT_CATS.map((c) => ({ ...c }));
  const settings = readLS(KEY.settings, null);
  state.settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  state.admins = readLS(KEY.admins, null);
  state.products = readLS(KEY.products, null);

  let seeded = false;
  if (!Array.isArray(state.admins) || !state.admins.length) { state.admins = seedAdmins(); seeded = true; }
  if (!Array.isArray(state.products)) { state.products = seedProducts(); seeded = true; }
  if (!readLS(KEY.cats, null)) writeLS(KEY.cats, state.cats);
  if (!readLS(KEY.settings, null)) writeLS(KEY.settings, state.settings);
  if (seeded) {
    writeLS(KEY.admins, state.admins);
    try { localStorage.setItem(KEY.products, JSON.stringify(state.products)); } catch (e) { /* 忽略 */ }
  }

  const s = readLS(KEY.session, null);
  state.session = (s && s.u && s.exp > now() && state.admins.some((a) => a.u === s.u))
    ? { u: s.u, exp: s.exp } : null;

  if (state.cat !== 'all' && !state.cats.some((c) => c.id === state.cat)) state.cat = 'all';
}

/* ------------------------------------------------------------------ *
 * 7. 图标
 * ------------------------------------------------------------------ */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9Z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.9 2.2Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/>',
  left: '<path d="m14 7-5 5 5 5"/>',
  right: '<path d="m10 7 5 5-5 5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  sparkle: '<path d="M12 4v3M12 17v3M4 12h3M17 12h3"/><path d="m6.3 6.3 2 2M15.7 15.7l2 2M17.7 6.3l-2 2M8.3 15.7l-2 2"/>'
};
function ic(name, size, opt) {
  const o = opt || {};
  const filled = o.fill ? 'currentColor' : 'none';
  return '<svg class="ic" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="' + filled
    + '" stroke="currentColor" stroke-width="' + (o.sw === 0 ? 0 : (o.sw || 1.9))
    + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

/* ------------------------------------------------------------------ *
 * 8. 通用助手
 * ------------------------------------------------------------------ */
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function money(n) { return brl.format(Number(n) || 0); }
function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString('pt-BR'); } catch (e) { return ''; }
}
function modelNum(m) {
  const hit = String(m || '').match(/\d+/);
  return hit ? parseInt(hit[0], 10) : 1e9;
}
function sortedProducts(list) {
  const loc = state.lang === 'pt' ? 'pt-BR' : 'zh-Hans-CN';
  return list.slice().sort((a, b) => {
    const ra = a.isNew ? 0 : (a.starred ? 1 : 2);
    const rb = b.isNew ? 0 : (b.starred ? 1 : 2);
    if (ra !== rb) return ra - rb;
    const na = modelNum(a.model), nb = modelNum(b.model);
    if (na !== nb) return na - nb;
    return String(a.name.zh || a.name.pt || '').localeCompare(String(b.name.zh || b.name.pt || ''), loc)
      || String(a.name.pt || '').localeCompare(String(b.name.pt || ''), 'pt-BR');
  });
}
function matches(p, q) {
  if (!q) return true;
  const hay = [p.name.zh, p.name.pt, p.model]
    .concat((p.colors || []).map((c) => c.zh), (p.colors || []).map((c) => c.pt))
    .join(' ').toLowerCase();
  return hay.indexOf(q) >= 0;
}
function catById(id) { return state.cats.find((c) => c.id === id); }
function currentProduct() {
  const r = parseRoute();
  return r.name === 'detail' ? state.products.find((p) => p.id === r.id) : null;
}
const COLOR_HEX = {
  '黑': '#111214', '黑色': '#111214', '白': '#F7F5EF', '白色': '#F7F5EF', '红': '#C8102E', '红色': '#C8102E',
  '米': '#D9C7AE', '米色': '#D9C7AE', '米白': '#EFE6D4', '蓝': '#2E5A94', '蓝色': '#2E5A94', '牛仔蓝': '#3E6493',
  '绿': '#1F6B3F', '绿色': '#1F6B3F', '墨绿': '#24513A', '黄': '#E9B81C', '黄色': '#E9B81C',
  '灰': '#9AA3A0', '灰色': '#9AA3A0', '粉': '#E5A0B0', '粉色': '#E5A0B0', '棕': '#7A5742', '棕色': '#7A5742',
  '咖': '#6B4B36', '咖啡': '#6B4B36', '紫': '#6C4C8C', '紫色': '#6C4C8C', '橙': '#D9722B', '橙色': '#D9722B',
  '酒红': '#6E1226', '藏青': '#1B2A4A', '卡其': '#B7A57C', '驼色': '#B98C5E', '杏色': '#E2BE9C'
};
const COLOR_PT = {
  '黑': 'Preto', '黑色': 'Preto', '白': 'Branco', '白色': 'Branco', '红': 'Vermelho', '红色': 'Vermelho',
  '米': 'Bege', '米色': 'Bege', '米白': 'Off-white', '蓝': 'Azul', '蓝色': 'Azul', '牛仔蓝': 'Azul Jeans',
  '绿': 'Verde', '绿色': 'Verde', '墨绿': 'Verde Musgo', '黄': 'Amarelo', '黄色': 'Amarelo',
  '灰': 'Cinza', '灰色': 'Cinza', '粉': 'Rosa', '粉色': 'Rosa', '棕': 'Marrom', '棕色': 'Marrom',
  '咖': 'Marrom', '咖啡': 'Marrom', '紫': 'Roxo', '紫色': 'Roxo', '橙': 'Laranja', '橙色': 'Laranja',
  '酒红': 'Vinho', '藏青': 'Azul Marinho', '卡其': 'Caqui', '驼色': 'Camel', '杏色': 'Pêssego'
};
function colorHex(name) { return COLOR_HEX[String(name || '').trim()] || '#C9C4B5'; }
function ptColor(name) { return COLOR_PT[String(name || '').trim()] || ''; }

/* ------------------------------------------------------------------ *
 * 9. 顶栏 / 页脚
 * ------------------------------------------------------------------ */
function brandHTML() {
  return '<a class="brand" href="#/" aria-label="XLZ ATACADO">'
    + '<span class="brand-mark" aria-hidden="true"></span>'
    + '<span class="brand-text"><b>XLZ</b><small>ATACADO</small></span></a>';
}
function langHTML() {
  const opts = [['zh', '中'], ['pt', 'PT'], ['mix', '中·PT']];
  return '<div class="lang" role="group" aria-label="Language / 语言">'
    + opts.map(([id, label]) =>
      '<button type="button" class="' + (state.lang === id ? 'on' : '') + '" data-act="lang" data-lang="' + id
      + '" aria-pressed="' + (state.lang === id) + '">' + label + '</button>').join('')
    + '</div>';
}
function accountHTML() {
  if (state.session) {
    return '<a class="tb-admin" href="#/admin/products" aria-label="' + esc(tt('adminTitle')) + '">'
      + '<span class="tb-dot"></span>' + esc(state.session.u) + '</a>';
  }
  return '<a class="tb-login" href="#/login" aria-label="' + esc(tt('login')) + '">'
    + ic('user', 16) + '<span>' + t('login') + '</span></a>';
}
function topbar(opt) {
  const o = opt || {};
  return '<header class="topbar"><div class="wrap topbar-in">'
    + (o.back ? '<a class="icon-btn" href="' + esc(o.back) + '" aria-label="' + esc(tt('back')) + '">' + ic('back', 20) + '</a>' : '')
    + (o.back ? '' : brandHTML())
    + (o.title ? '<h1 class="topbar-title"><span class="ttl">' + o.title + '</span></h1>' : '')
    + (o.back && !o.title ? '<span class="topbar-title" style="opacity:.9">XLZ</span>' : '')
    + '<div class="topbar-right">' + langHTML() + (o.hideAccount ? '' : accountHTML()) + '</div>'
    + '</div></header>';
}
function footerHTML() {
  const s = state.settings;
  const tel = String(s.phone || '').replace(/[^\d+]/g, '');
  const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.mapQuery || s.address || '');
  return '<footer class="footer' + (state.session ? ' with-fab' : '') + '"><div class="wrap">'
    + '<div class="foot-top"><div class="foot-brand"><span class="brand-mark" aria-hidden="true"></span>'
    + '<b>XLZ</b><small>ATACADO</small></div><p class="foot-tag">' + t('footTag') + '</p></div>'
    + '<div class="foot-list">'
    + '<a class="foot-item" href="tel:' + esc(tel) + '"><span class="fi">' + ic('phone', 18) + '</span>'
    + '<span class="ft"><small>' + t('phone') + '</small><b>' + esc(s.phone) + '</b></span></a>'
    + '<a class="foot-item" href="' + esc(map) + '" target="_blank" rel="noopener"><span class="fi">' + ic('pin', 18) + '</span>'
    + '<span class="ft"><small>' + t('address') + '</small><b>' + esc(s.address) + '</b></span></a>'
    + '</div>'
    + '<div class="foot-bottom"><span>' + t('footNote') + '</span>'
    + (state.session
      ? '<button type="button" class="foot-link" data-act="logout">' + t('logout') + '</button>'
      : '<a class="foot-link" href="#/login">' + t('adminLogin') + '</a>')
    + '</div></div></footer>';
}

/* ------------------------------------------------------------------ *
 * 10. 主页
 * ------------------------------------------------------------------ */
function heroHTML(vis) {
  const onSale = vis.filter((p) => p.onShelf).length;
  return '<section class="hero">'
    + '<div class="hero-deco" aria-hidden="true"><span class="hd-glow"></span><span class="hd-diamond"></span>'
    + '<span class="hd-dot d1"></span><span class="hd-dot d2"></span><span class="hd-dot d3"></span></div>'
    + '<span class="hero-wm" aria-hidden="true">XLZ</span>'
    + '<div class="wrap hero-in">'
    + '<span class="pill"><i class="pill-dot"></i>' + t('kicker') + '</span>'
    + '<h1 class="hero-title">' + heroTitleHTML() + '</h1>'
    + '<p class="hero-sub">' + heroSubHTML() + '</p>'
    + '<div class="hero-stats">'
    + '<div class="stat"><b>' + String(onSale).padStart(2, '0') + '</b><small>' + statLabel('statOnSale') + '</small></div>'
    + '<div class="stat"><b>' + String(state.cats.length).padStart(2, '0') + '</b><small>' + statLabel('statCats') + '</small></div>'
    + '</div></div></section>';
}
function heroSubHTML() {
  const zh = I18N.heroSub[0], pt = I18N.heroSub[1];
  if (state.lang === 'zh') return esc(zh);
  if (state.lang === 'pt') return esc(pt);
  return '<span class="hs-zh">' + esc(zh) + '</span><span class="hs-pt">' + esc(pt) + '</span>';
}
function statLabel(key) {
  const e = I18N[key] || [key, key];
  if (state.lang === 'zh') return esc(e[0]);
  if (state.lang === 'pt') return esc(e[1]);
  return '<span class="sz">' + esc(e[0]) + '</span><span class="sp">' + esc(e[1]) + '</span>';
}
function heroTitleHTML() {
  const zh = I18N.heroTitle[0], pt = I18N.heroTitle[1];
  if (state.lang === 'zh') return '<span class="hero-line">' + esc(zh) + '</span>';
  if (state.lang === 'pt') return '<span class="hero-line pt">' + esc(pt) + '</span>';
  return '<span class="hero-line zh">' + esc(zh) + '</span><span class="hero-line pt">' + esc(pt) + '</span>';
}
function searchHTML() {
  return '<div class="searchbar" role="search"><label class="search">'
    + '<span class="search-ic">' + ic('search', 18) + '</span>'
    + '<input id="q" type="search" autocomplete="off" enterkeyhint="search" value="' + esc(state.query) + '"'
    + ' placeholder="' + esc(searchPlaceholder()) + '" aria-label="' + esc(searchPlaceholder()) + '">'
    + '<button type="button" class="search-clear" data-act="clear" aria-label="' + esc(tt('clear')) + '"' + (state.query ? '' : ' hidden') + '>'
    + ic('x', 16) + '</button></label></div>';
}
function filtersHTML() {
  const items = [{ id: 'all', zh: I18N.allCats[0], pt: I18N.allCats[1] }].concat(state.cats);
  return '<div class="filters">' + items.map((c) =>
    '<button type="button" class="filter-chip' + (state.cat === c.id ? ' on' : '') + '" data-act="filter" data-cat="'
    + esc(c.id) + '" title="' + esc((c.zh || '') + ' / ' + (c.pt || '')) + '">' + nm(c) + '</button>').join('') + '</div>';
}
function searchPlaceholder() {
  if (state.lang === 'zh') return '搜索品名 / 型号';
  if (state.lang === 'pt') return 'Buscar nome ou modelo';
  return '搜索品名 · Buscar nome';
}
function cardHTML(p, isAdmin) {
  const img = (p.images && p.images[0]) || FALLBACK_ART;
  return '<article class="card' + (p.onShelf ? '' : ' is-off') + '" data-act="open" data-id="' + esc(p.id) + '"'
    + ' tabindex="0" role="link" aria-label="' + esc((p.name.zh || '') + ' ' + (p.name.pt || '')) + '">'
    + '<div class="card-media"><img src="' + img + '" alt="' + esc((p.name.zh || '') + ' ' + (p.name.pt || '')) + '" loading="lazy" decoding="async">'
    + (p.isNew ? '<span class="badge badge-new">' + t('badgeNew') + '</span>' : '')
    + (p.starred ? '<span class="badge badge-star" title="' + esc(tt('starBadge')) + '">' + ic('star', 12, { fill: true, sw: 0 }) + '</span>' : '')
    + (p.onShelf ? '' : '<span class="badge badge-off">' + t('badgeOff') + '</span>')
    + (isAdmin ? '<button type="button" class="card-edit" data-act="edit" data-id="' + esc(p.id) + '" aria-label="' + esc(tt('edit')) + '">' + ic('edit', 14) + '</button>' : '')
    + '</div>'
    + '<div class="card-body"><div class="card-name">' + nm(p.name) + '</div>'
    + '<div class="card-model">№ ' + esc(p.model) + '</div></div></article>';
}
function catSectionHTML(cat, items, isAdmin) {
  return '<section class="cat" id="cat-' + esc(cat.id) + '">'
    + '<div class="cat-head"><h2 class="cat-title"><span class="cat-bar"></span>' + nm(cat) + '</h2>'
    + '<span class="cat-count">' + items.length + '</span></div>'
    + (items.length
      ? '<div class="grid">' + items.map((p) => cardHTML(p, isAdmin)).join('') + '</div>'
      : '<div class="cat-empty">' + t('emptyCat')
        + (isAdmin ? ' · <a class="link" href="#/new">' + t('addProduct') + '</a>' : '') + '</div>')
    + '</section>';
}
function emptyHTML(kind, isAdmin) {
  if (kind === 'search') {
    return '<div class="empty"><div class="empty-ic">' + ic('search', 24) + '</div>'
      + '<h3>' + t('emptySearch') + '</h3><p>' + t('emptySearchHint') + '</p></div>';
  }
  return '<div class="empty"><div class="empty-ic">' + ic('camera', 24) + '</div>'
    + '<h3>' + t('emptyNone') + '</h3><p>' + t('emptyNoneHint') + '</p>'
    + (isAdmin ? '<a class="btn btn-primary" href="#/new">' + ic('plus', 18) + t('addProduct') + '</a>' : '') + '</div>';
}
function feedHTML(list, q, isAdmin) {
  let out = '';
  if (q) {
    if (!list.length) return emptyHTML('search', isAdmin);
    out += '<div class="result-bar"><span>' + t('searchResult') + ' <b>' + esc(state.query.trim()) + '</b></span>'
      + '<span class="result-n">' + list.length + ' ' + tc('pieces') + '</span></div>';
  }
  const scope = state.cat === 'all' ? state.cats : state.cats.filter((c) => c.id === state.cat);
  scope.forEach((cat) => {
    const items = sortedProducts(list.filter((p) => p.category === cat.id));
    if (q && !items.length) return;
    out += catSectionHTML(cat, items, isAdmin);
  });
  return out || emptyHTML(q ? 'search' : 'none', isAdmin);
}
function renderHome() {
  const isAdmin = !!state.session;
  const vis = state.products.filter((p) => isAdmin || p.onShelf);
  const q = state.query.trim().toLowerCase();
  const matched = vis.filter((p) => matches(p, q));
  return topbar()
    + '<main class="home">'
    + heroHTML(vis)
    + '<div class="wrap">' + searchHTML() + filtersHTML() + '<div id="feed">' + feedHTML(matched, q, isAdmin) + '</div></div>'
    + footerHTML()
    + '</main>'
    + (isAdmin ? '<button type="button" class="fab" data-act="new" aria-label="' + esc(tt('addProduct')) + '">' + ic('plus', 26) + '</button>' : '');
}
function refreshFeed() {
  const feed = $('#feed');
  if (!feed) return;
  const isAdmin = !!state.session;
  const vis = state.products.filter((p) => isAdmin || p.onShelf);
  const q = state.query.trim().toLowerCase();
  feed.innerHTML = feedHTML(vis.filter((p) => matches(p, q)), q, isAdmin);
}

/* ------------------------------------------------------------------ *
 * 11. 详情页
 * ------------------------------------------------------------------ */
function stockAreaHTML(p) {
  const sizes = SIZE_ORDER.filter((s) => p.sizes.indexOf(s) >= 0);
  const col = p.colors[detailColor] || p.colors[0];
  if (!col) return '';
  const anyStock = sizes.some((s) => !!(col.stock && col.stock[s]));
  const colorsHTML = p.colors.map((c, i) => {
    const has = sizes.some((s) => !!(c.stock && c.stock[s]));
    return '<button type="button" class="color' + (i === detailColor ? ' on' : '') + (has ? '' : ' oos') + '"'
      + ' data-act="color" data-i="' + i + '">'
      + '<span class="dot" style="background:' + colorHex(c.zh) + '"></span>' + colorNameHTML(c) + '</button>';
  }).join('');
  const sizesHTML = sizes.map((s) => {
    const ok = !!(col.stock && col.stock[s]);
    return '<div class="size' + (ok ? '' : ' oos') + '"><span>' + esc(s) + '</span><small>'
      + (ok ? tc('inStock') : tc('oos')) + '</small></div>';
  }).join('');
  return '<div class="colors">' + colorsHTML + '</div>'
    + '<div class="sizes">' + sizesHTML + '</div>'
    + '<div class="legend"><span><i class="lg-dot ok"></i>' + t('inStock') + '</span>'
    + '<span><i class="lg-dot no"></i>' + t('oos') + '</span>'
    + (anyStock ? '' : '<span class="lg-alert">' + t('soldOut') + '</span>') + '</div>';
}
function renderDetail(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p || (!p.onShelf && !state.session)) {
    return topbar({ back: '#/' }) + '<main class="wrap"><div class="empty" style="margin-top:26px">'
      + '<div class="empty-ic">' + ic('alert', 24) + '</div><h3>' + t('notFound') + '</h3>'
      + '<a class="btn btn-primary" href="#/">' + t('backHome') + '</a></div></main>';
  }
  if (lastProductId !== p.id) { lastProductId = p.id; detailColor = 0; }
  if (detailColor >= p.colors.length) detailColor = 0;
  const imgs = (p.images && p.images.length) ? p.images : [FALLBACK_ART];
  const cat = catById(p.category);
  const s = state.settings;
  const tel = String(s.phone || '').replace(/[^\d+]/g, '');
  const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.mapQuery || s.address || '');
  return topbar({ back: '#/' })
    + '<div class="detail-page">'
    + '<div class="gallery"><div class="gal-track" id="galTrack">'
    + imgs.map((src, i) => '<div class="gal-slide"><img src="' + src + '" alt="' + esc((p.name.zh || '') + ' ' + (p.name.pt || '') + ' ' + (i + 1)) + '"'
      + (i ? ' loading="lazy"' : '') + ' data-act="zoom" data-i="' + i + '"></div>').join('')
    + '</div>'
    + '<div class="gal-top"><span class="gal-hint">' + ic('eye', 13) + t('zoomHint') + '</span>'
    + '<span class="gal-count"><b id="galNow">1</b> / ' + imgs.length + '</span></div>'
    + (imgs.length > 1
      ? '<button type="button" class="gal-arrow left" data-act="gal" data-dir="-1" aria-label="prev">' + ic('left', 20) + '</button>'
        + '<button type="button" class="gal-arrow right" data-act="gal" data-dir="1" aria-label="next">' + ic('right', 20) + '</button>'
        + '<div class="gal-dots" id="galDots">' + imgs.map((_, i) =>
          '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-act="gal-dot" data-i="' + i + '" aria-label="' + (i + 1) + '"></button>').join('')
        + '</div>'
      : '')
    + '</div>'
    + '<main class="detail-sheet">'
    + '<div class="d-card"><div class="d-flags">'
    + (cat ? '<span class="tag tag-cat">' + nm(cat) + '</span>' : '')
    + (p.isNew ? '<span class="tag tag-new">' + t('badgeNew') + '</span>' : '')
    + (p.starred ? '<span class="tag tag-star">' + ic('star', 11, { fill: true, sw: 0 }) + t('starBadge') + '</span>' : '')
    + (p.onShelf ? '' : '<span class="tag tag-off">' + t('badgeOff') + '</span>')
    + '</div>'
    + '<h1 class="d-title">' + nm(p.name) + '</h1>'
    + '<div class="d-sub"><span class="d-model">' + t('model') + ' № ' + esc(p.model) + '</span></div>'
    + '<div class="price"><b>' + money(p.price) + '</b><small>' + t('price') + '</small></div>'
    + '</div>'
    + '<div class="d-card"><div class="block-head"><h3>' + t('fTags') + '</h3></div>'
    + '<p class="hint block-hint">' + t('stockHint') + '</p>'
    + '<div id="stockArea">' + stockAreaHTML(p) + '</div></div>'
    + '<section class="contact"><div class="contact-head"><h3>' + t('contact') + '</h3></div>'
    + '<a class="contact-row" href="tel:' + esc(tel) + '"><span class="fi">' + ic('phone', 18) + '</span>'
    + '<span><small>' + t('phone') + '</small><b>' + esc(s.phone) + '</b></span></a>'
    + '<a class="contact-row" href="' + esc(map) + '" target="_blank" rel="noopener"><span class="fi">' + ic('pin', 18) + '</span>'
    + '<span><small>' + t('address') + '</small><b>' + esc(s.address) + '</b></span></a>'
    + '<a class="btn btn-primary btn-block" href="tel:' + esc(tel) + '">' + ic('phone', 18) + t('callNow') + '</a>'
    + '</section>'
    + (state.session
      ? '<div class="d-admin"><a class="btn btn-green" href="#/edit/' + esc(p.id) + '">' + ic('edit', 18) + t('edit') + '</a>'
        + '<button type="button" class="btn btn-danger" data-act="del" data-id="' + esc(p.id) + '">' + ic('trash', 18) + t('delete') + '</button></div>'
      : '')
    + '<p class="d-note">XLZ · ATACADO · SÃO PAULO</p>'
    + '</main></div>';
}
function syncGallery(i) {
  const nowEl = document.getElementById('galNow');
  if (nowEl) nowEl.textContent = String(i + 1);
  $$('#galDots button').forEach((d, k) => d.classList.toggle('on', k === i));
}
function bindGallery() {
  const track = document.getElementById('galTrack');
  if (!track) return;
  let raf = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      syncGallery(i);
    });
  }, { passive: true });
  syncGallery(0);
}

/* ------------------------------------------------------------------ *
 * 12. 管理后台
 * ------------------------------------------------------------------ */
function tabName(tab) {
  return tab === 'accounts' ? t('tabAccounts') : tab === 'settings' ? t('tabSettings') : t('tabProducts');
}
function adminProductsHTML() {
  const list = sortedProducts(state.products);
  if (!list.length) {
    return '<div class="empty"><div class="empty-ic">' + ic('camera', 24) + '</div>'
      + '<h3>' + t('emptyNone') + '</h3><p>' + t('emptyNoneHint') + '</p>'
      + '<a class="btn btn-primary" href="#/new">' + ic('plus', 18) + t('addProduct') + '</a></div>';
  }
  return '<div class="admin-head"><div><h2>' + t('allProducts') + '</h2>'
    + '<p>' + list.length + ' ' + tc('pieces') + ' · ' + state.cats.length + ' ' + tc('statCats') + '</p></div>'
    + '<a class="btn btn-primary btn-sm" href="#/new">' + ic('plus', 16) + t('addProduct') + '</a></div>'
    + '<div class="arows">' + list.map((p) => {
      const cat = catById(p.category);
      return '<article class="arow' + (p.onShelf ? '' : ' is-off') + '">'
        + '<div class="arow-thumb"><img src="' + ((p.images && p.images[0]) || FALLBACK_ART) + '" alt="" loading="lazy"></div>'
        + '<div class="arow-body">'
        + '<div class="arow-top"><div class="arow-name">' + nm(p.name) + '</div>'
        + '<div class="arow-price">' + money(p.price) + '</div></div>'
        + '<div class="arow-meta"><span>№ ' + esc(p.model) + '</span><span class="sep">·</span><span>' + esc(oneName(cat)) + '</span></div>'
        + '<div class="arow-controls">'
        + '<button type="button" class="tgl' + (p.onShelf ? ' on' : '') + '" data-act="toggle" data-field="onShelf" data-id="' + esc(p.id) + '" aria-pressed="' + p.onShelf + '">'
        + '<span class="track"><i></i></span>' + tc(p.onShelf ? 'statusOn' : 'statusOff') + '</button>'
        + '<button type="button" class="mini-toggle' + (p.isNew ? ' on' : '') + '" data-act="toggle" data-field="isNew" data-id="' + esc(p.id) + '">' + tc('newMark') + '</button>'
        + '<button type="button" class="mini-toggle star' + (p.starred ? ' on' : '') + '" data-act="toggle" data-field="starred" data-id="' + esc(p.id) + '"'
        + ' title="' + esc(tt('starMark')) + '" aria-label="' + esc(tt('starMark')) + '" aria-pressed="' + p.starred + '">'
        + ic('star', 12, { fill: true, sw: 0 }) + '</button>'
        + '<div class="arow-actions">'
        + '<a class="mini-btn" href="#/edit/' + esc(p.id) + '" aria-label="' + esc(tt('edit')) + '">' + ic('edit', 16) + '</a>'
        + '<button type="button" class="mini-btn danger" data-act="del" data-id="' + esc(p.id) + '" aria-label="' + esc(tt('delete')) + '">' + ic('trash', 16) + '</button>'
        + '</div></div></div></article>';
    }).join('') + '</div>';
}
function accountsHTML() {
  return '<div class="admin-head"><div><h2>' + t('accountsTitle') + '</h2>'
    + '<p>' + state.admins.length + ' ' + tc('pieces') + '</p></div>'
    + '<button type="button" class="btn btn-primary btn-sm" data-act="addacc">' + ic('plus', 16) + tc('addAccount') + '</button></div>'
    + '<div class="acc-list">' + state.admins.map((a) => {
      const isSelf = state.session && state.session.u === a.u;
      return '<div class="acc"><span class="acc-avatar">' + esc(String(a.u).slice(0, 1).toUpperCase()) + '</span>'
        + '<div class="acc-info"><b>' + esc(a.u) + '</b><small>' + t('createdOn') + ' ' + fmtDate(a.created) + '</small></div>'
        + (isSelf ? '<span class="mini-tag">' + t('you') + '</span>' : '')
        + '<div class="acc-actions">'
        + '<button type="button" class="mini-btn" data-act="chpw" data-u="' + esc(a.u) + '" aria-label="' + esc(tt('changePwd')) + '">' + ic('lock', 15) + '</button>'
        + '<button type="button" class="mini-btn danger" data-act="delacc" data-u="' + esc(a.u) + '"' + (isSelf || state.admins.length <= 1 ? ' disabled' : '') + ' aria-label="' + esc(tt('delete')) + '">' + ic('trash', 15) + '</button>'
        + '</div></div>';
    }).join('') + '</div>';
}
function settingsHTML() {
  const s = state.settings;
  const catsHTML = state.cats.map((c) => {
    const count = state.products.filter((p) => p.category === c.id).length;
    return '<div class="cat-row"><div class="nm">' + nm(c) + '</div>'
      + '<small>' + count + ' ' + tc('pieces') + '</small>'
      + (count ? '' : '<button type="button" class="mini-btn danger" data-act="delcat" data-id="' + esc(c.id) + '"'
        + ' aria-label="' + esc(tt('delete')) + '" title="' + esc(tt('delete')) + '">' + ic('trash', 14) + '</button>')
      + '</div>';
  }).join('');
  return '<section class="sect"><div class="sect-head"><h3>' + t('storeInfo') + '</h3></div>'
    + '<div class="field"><label class="label" for="setPhone">' + t('storePhone') + '</label>'
    + '<input class="input" id="setPhone" value="' + esc(s.phone) + '"></div>'
    + '<div class="field"><label class="label" for="setAddr">' + t('storeAddr') + '</label>'
    + '<input class="input" id="setAddr" value="' + esc(s.address) + '"></div>'
    + '<button type="button" class="btn btn-green" data-act="saveset">' + t('save') + '</button></section>'
    + '<section class="sect"><div class="sect-head"><h3>' + t('categories') + '</h3></div>'
    + '<div class="cat-list">' + catsHTML + '</div>'
    + '<div class="cat-add">'
    + '<div class="row"><input class="input" id="newCatZh" placeholder="中文名称">'
    + '<input class="input" id="newCatPt" placeholder="Nome em português"></div>'
    + '<button type="button" class="btn btn-green" data-act="addcat">' + ic('plus', 16) + t('addCategory') + '</button>'
    + '</div></section>'
    + '<section class="sect"><div class="sect-head"><h3>' + t('dataTitle') + '</h3></div>'
    + '<div class="row-btns"><button type="button" class="btn btn-ghost" data-act="export">' + ic('download', 16) + t('exportJson') + '</button>'
    + '<button type="button" class="btn btn-ghost" data-act="import">' + ic('upload', 16) + t('importJson') + '</button></div>'
    + '<p class="note">' + t('dataNote') + '</p>'
    + '<input type="file" id="importFile" accept="application/json,.json" hidden></section>';
}
function renderAdmin(tab) {
  const key = ['products', 'accounts', 'settings'].indexOf(tab) >= 0 ? tab : 'products';
  const body = key === 'accounts' ? accountsHTML() : key === 'settings' ? settingsHTML() : adminProductsHTML();
  return topbar({ back: '#/', title: t('adminTitle'), hideAccount: true })
    + '<main class="wrap admin">'
    + '<div class="tabs">' + ['products', 'accounts', 'settings'].map((k) =>
      '<a class="tab' + (k === key ? ' on' : '') + '" href="#/admin/' + k + '">' + tabName(k) + '</a>').join('') + '</div>'
    + body
    + '<div class="admin-foot"><button type="button" class="btn btn-ghost" data-act="logout">' + ic('logout', 16) + t('logout') + '</button></div>'
    + '</main>';
}

/* ------------------------------------------------------------------ *
 * 13. 产品表单
 * ------------------------------------------------------------------ */
function initForm(product) {
  const src = product || {
    id: null, category: (state.cats[0] || {}).id || '', name: { zh: '', pt: '' }, model: '', price: '',
    sizes: ['P', 'M', 'G', 'GG'], colors: [], images: [], onShelf: true, isNew: false, starred: false
  };
  return {
    key: product ? product.id : 'new',
    id: product ? product.id : null,
    createdAt: product ? product.createdAt : now(),
    data: {
      category: src.category,
      name: { zh: (src.name && src.name.zh) || '', pt: (src.name && src.name.pt) || '' },
      model: src.model || '',
      price: src.price === 0 || src.price ? String(src.price).replace('.', ',') : '',
      sizes: (src.sizes || []).slice(),
      colors: JSON.parse(JSON.stringify(src.colors || [])),
      images: (src.images || []).slice(),
      onShelf: src.onShelf !== false,
      isNew: !!src.isNew,
      starred: !!src.starred
    }
  };
}
function imagesHTML() {
  const d = F.data;
  const tiles = d.images.map((src, i) =>
    '<div class="img-tile"><img src="' + src + '" alt="">'
    + '<button type="button" class="rm" data-act="rmimg" data-i="' + i + '" aria-label="' + esc(tt('delete')) + '">' + ic('x', 13) + '</button>'
    + (i === 0 ? '<span class="cover-tag">' + t('coverLabel') + '</span>' : '') + '</div>').join('');
  const add = d.images.length < 10
    ? '<button type="button" class="img-add" data-act="pick"><span>' + ic('camera', 22) + '</span><span>' + t('addPhoto') + '</span></button>'
    : '';
  return tiles + add;
}
function colorsEditorHTML() {
  if (!F.data.colors.length) return '<p class="hint">' + t('noColors') + '</p>';
  return F.data.colors.map((c, i) =>
    '<div class="color-edit"><div class="ce-top"><span class="dot" style="background:' + colorHex(c.zh) + '"></span>'
    + '<input class="ce-zh" data-ce="zh" data-i="' + i + '" value="' + esc(c.zh) + '" maxlength="12" aria-label="' + esc(tt('fColors')) + '">'
    + '<button type="button" class="ce-rm" data-act="rmcolor" data-i="' + i + '" aria-label="' + esc(tt('delete')) + '">' + ic('x', 12) + '</button></div>'
    + '<input class="ce-pt" data-ce="pt" data-i="' + i + '" value="' + esc(c.pt || '') + '" maxlength="24" placeholder="Português"></div>').join('');
}
function sizePickHTML() {
  return SIZE_ORDER.map((s) =>
    '<button type="button" class="size-pick-btn' + (F.data.sizes.indexOf(s) >= 0 ? ' on' : '') + '" data-act="size" data-sz="' + s + '" aria-pressed="'
    + (F.data.sizes.indexOf(s) >= 0) + '">' + s + '</button>').join('');
}
function matrixHTML() {
  const sizes = SIZE_ORDER.filter((s) => F.data.sizes.indexOf(s) >= 0);
  if (!F.data.colors.length || !sizes.length) return '<p class="hint">' + t('matrixHint') + '</p>';
  return '<div class="mx-scroll"><table class="mx"><thead><tr><th></th>'
    + sizes.map((s) => '<th>' + s + '</th>').join('') + '</tr></thead><tbody>'
    + F.data.colors.map((c, ci) => '<tr><th class="mx-color"><span class="dot" style="background:' + colorHex(c.zh) + '"></span>' + esc(c.zh) + '</th>'
      + sizes.map((s) => {
        const ok = !!(c.stock && c.stock[s]);
        return '<td><button type="button" class="mcell' + (ok ? '' : ' no') + '" data-act="cell" data-ci="' + ci + '" data-sz="' + s
          + '" aria-pressed="' + ok + '" aria-label="' + esc(c.zh + ' ' + s) + '">' + (ok ? '✓' : '—') + '</button></td>';
      }).join('') + '</tr>').join('')
    + '</tbody></table></div>'
    + '<p class="mx-legend"><span><i class="lg-dot ok"></i>' + t('inStock') + '</span><span><i class="lg-dot no"></i>' + t('oos') + '</span></p>';
}
function renderForm(editId) {
  const editing = editId ? state.products.find((p) => p.id === editId) : null;
  if (editId && !editing) {
    return topbar({ back: '#/admin/products' }) + '<main class="wrap"><div class="empty" style="margin-top:26px">'
      + '<div class="empty-ic">' + ic('alert', 24) + '</div><h3>' + t('notFound') + '</h3>'
      + '<a class="btn btn-primary" href="#/admin/products">' + t('back') + '</a></div></main>';
  }
  if (!F || F.key !== (editing ? editing.id : 'new')) F = initForm(editing);
  if (!state.cats.length) {
    return topbar({ back: '#/admin/products' }) + '<main class="wrap"><div class="empty" style="margin-top:26px">'
      + '<div class="empty-ic">' + ic('alert', 24) + '</div><h3>' + t('eNoCat') + '</h3>'
      + '<a class="btn btn-primary" href="#/admin/settings">' + t('categories') + '</a></div></main>';
  }
  if (!state.cats.some((c) => c.id === F.data.category)) F.data.category = state.cats[0].id;
  const d = F.data;
  return topbar({ back: editing ? '#/p/' + editing.id : '#/admin/products', title: t(editing ? 'formEdit' : 'formNew'), hideAccount: true })
    + '<main class="form">'
    + '<section class="sect"><div class="sect-head"><span class="num">1</span><h3>' + t('fBasic') + '</h3></div>'
    + '<div class="field"><label class="label" for="fCat">' + t('fCategory') + '<span class="req">*</span></label>'
    + '<select class="input" id="fCat" data-f="category">'
    + state.cats.map((c) => '<option value="' + esc(c.id) + '"' + (c.id === d.category ? ' selected' : '') + '>'
      + esc(c.zh) + (c.pt ? ' · ' + esc(c.pt) : '') + '</option>').join('')
    + '</select><p class="ferr"></p></div>'
    + '<div class="two">'
    + '<div class="field"><label class="label" for="fNameZh">' + t('fNameZh') + '<span class="req">*</span></label>'
    + '<input class="input" id="fNameZh" data-f="name.zh" maxlength="40" value="' + esc(d.name.zh) + '" autocomplete="off">'
    + '<p class="ferr"></p></div>'
    + '<div class="field"><label class="label" for="fNamePt">' + t('fNamePt') + '</label>'
    + '<input class="input" id="fNamePt" data-f="name.pt" maxlength="60" value="' + esc(d.name.pt) + '" autocomplete="off">'
    + '<p class="ferr"></p></div></div>'
    + '<div class="two">'
    + '<div class="field"><label class="label" for="fModel">' + t('fModel') + '<span class="req">*</span></label>'
    + '<input class="input" id="fModel" data-f="model" maxlength="20" value="' + esc(d.model) + '" autocomplete="off">'
    + '<p class="ferr"></p></div>'
    + '<div class="field"><label class="label" for="fPrice">' + t('fPrice') + '<span class="req">*</span></label>'
    + '<input class="input" id="fPrice" data-f="price" inputmode="decimal" placeholder="79,90" value="' + esc(d.price) + '" autocomplete="off">'
    + '<p class="ferr"></p></div></div>'
    + '</section>'
    + '<section class="sect"><div class="sect-head"><span class="num">2</span><h3>' + t('fImages') + '</h3><span class="hint">' + t('photoHint') + '</span></div>'
    + '<div class="img-grid" id="imgGrid">' + imagesHTML() + '</div>'
    + '<input type="file" id="fImages" accept="image/jpeg,image/png,image/webp" multiple hidden>'
    + '<p class="ferr" id="imgErr"></p></section>'
    + '<section class="sect"><div class="sect-head"><span class="num">3</span><h3>' + t('fTags') + '</h3></div>'
    + '<div class="field"><label class="label">' + t('fColors') + '<span class="req">*</span></label>'
    + '<div class="color-list" id="colorList">' + colorsEditorHTML() + '</div>'
    + '<div class="color-add"><input class="input" id="newColor" placeholder="' + esc(tt('colorPh')) + '" maxlength="12" autocomplete="off">'
    + '<button type="button" class="btn btn-green" data-act="addcolor" aria-label="' + esc(tt('fColors')) + '">' + ic('plus', 20) + '</button></div>'
    + '<p class="ferr" id="colorErr"></p></div>'
    + '<div class="field"><label class="label">' + t('fSizes') + '<span class="req">*</span></label>'
    + '<div class="size-pick" id="sizePick">' + sizePickHTML() + '</div>'
    + '<p class="ferr" id="sizeErr"></p></div>'
    + '<div class="field"><label class="label">' + t('fStock') + '</label>'
    + '<p class="hint" style="margin-bottom:8px">' + t('fStockHint') + '</p>'
    + '<div id="matrix">' + matrixHTML() + '</div></div>'
    + '</section>'
    + '<section class="sect"><div class="sect-head"><span class="num">4</span><h3>' + t('fStatus') + '</h3></div>'
    + '<div class="switch-row"><div><b>' + t('onShelfLabel') + '</b><small>' + t('onShelfHint') + '</small></div>'
    + '<button type="button" class="switch' + (d.onShelf ? ' on' : '') + '" data-act="flag" data-field="onShelf" aria-pressed="' + d.onShelf + '" aria-label="' + esc(tt('onShelfLabel')) + '"></button></div>'
    + '<div class="switch-row"><div><b>' + t('newMark') + '</b><small>' + t('newHint') + '</small></div>'
    + '<button type="button" class="switch' + (d.isNew ? ' on' : '') + '" data-act="flag" data-field="isNew" aria-pressed="' + d.isNew + '" aria-label="' + esc(tt('newMark')) + '"></button></div>'
    + '<div class="switch-row"><div><b>' + t('starMark') + '</b><small>' + t('starHint') + '</small></div>'
    + '<button type="button" class="switch' + (d.starred ? ' on' : '') + '" data-act="flag" data-field="starred" aria-pressed="' + d.starred + '" aria-label="' + esc(tt('starMark')) + '"></button></div>'
    + '</section></main>'
    + '<div class="formbar"><button type="button" class="btn btn-ghost" data-act="cancel">' + t('cancel') + '</button>'
    + '<button type="button" class="btn btn-primary" data-act="save">' + ic('check', 18) + t('saveProduct') + '</button></div>';
}

/* ------------------------------------------------------------------ *
 * 14. 登录页
 * ------------------------------------------------------------------ */
function renderLogin() {
  return '<div class="auth"><div class="auth-deco" aria-hidden="true"></div>'
    + '<div class="auth-lang">' + langHTML() + '</div>'
    + '<div class="auth-inner">'
    + '<a class="auth-brand" href="#/"><span class="brand-mark" aria-hidden="true"></span>'
    + '<span class="brand-text"><b>XLZ</b><small>ATACADO</small></span></a>'
    + '<div class="auth-card"><h1 class="auth-title">' + authTitleHTML() + '</h1><p>' + t('loginSub') + '</p>'
    + '<div class="field"><label class="label" for="lgUser">' + t('username') + '</label>'
    + '<input class="input" id="lgUser" autocomplete="username" autocapitalize="none" spellcheck="false"></div>'
    + '<div class="field"><label class="label" for="lgPass">' + t('password') + '</label>'
    + '<input class="input" id="lgPass" type="password" autocomplete="current-password"></div>'
    + '<p class="ferr" id="lgErr"></p>'
    + '<button type="button" class="btn btn-primary btn-block" data-act="doLogin">' + t('loginBtn') + '</button>'
    + '<div class="auth-hint"><b>' + t('loginDemo') + '</b><span>admin / admin123 · staff / staff123</span></div>'
    + '</div><a class="auth-back" href="#/">' + ic('back', 16) + t('backHome') + '</a></div></div>';
}
function authTitleHTML() {
  const zh = I18N.loginTitle[0], pt = I18N.loginTitle[1];
  if (state.lang === 'zh') return '<span class="ap">' + esc(zh) + '</span>';
  if (state.lang === 'pt') return '<span class="ap">' + esc(pt) + '</span>';
  return '<span class="az">' + esc(zh) + '</span><span class="ap">' + esc(pt) + '</span>';
}

/* ------------------------------------------------------------------ *
 * 15. 弹层 / 提示
 * ------------------------------------------------------------------ */
let modalEl = null;
let modalResolve = null;
function openModal(html) {
  if (modalEl) closeModal(false);
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
  document.body.appendChild(wrap);
  document.body.classList.add('locked');
  modalEl = wrap;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(false); });
  const focusTarget = wrap.querySelector('input:not([type=hidden]), select, textarea');
  if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), 90);
  return wrap;
}
function closeModal(result) {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  document.body.classList.remove('locked');
  if (modalResolve) {
    const resolve = modalResolve;
    modalResolve = null;
    resolve(result === true);
  }
}
function confirmDialog(opt) {
  return new Promise((resolve) => {
    const wrap = openModal(
      '<div class="modal-head"><h3>' + opt.title + '</h3>'
      + '<button type="button" class="modal-x" data-role="close" aria-label="close">' + ic('x', 16) + '</button></div>'
      + '<div class="modal-text">' + opt.html + '</div>'
      + '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-role="no">' + t('cancel') + '</button>'
      + '<button type="button" class="btn ' + (opt.danger === false ? 'btn-primary' : 'btn-danger-solid') + '" data-role="yes">'
      + (opt.okText || t('confirm')) + '</button></div>'
    );
    modalResolve = resolve;
    wrap.querySelector('[data-role="yes"]').addEventListener('click', () => closeModal(true));
    wrap.querySelector('[data-role="no"]').addEventListener('click', () => closeModal(false));
    wrap.querySelector('[data-role="close"]').addEventListener('click', () => closeModal(false));
  });
}
let toastTimer = 0;
function toast(html) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ------------------------------------------------------------------ *
 * 16. 灯箱
 * ------------------------------------------------------------------ */
let lbEl = null;
let lbImages = [];
let lbIndex = 0;
function openLightbox(images, index) {
  closeLightbox();
  lbImages = images.slice();
  lbIndex = Math.max(0, Math.min(index, lbImages.length - 1));
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = '<button type="button" class="lb-close" data-lb="close" aria-label="close">' + ic('x', 20) + '</button>'
    + '<div class="lb-stage"><img id="lbImg" src="" alt=""></div>'
    + '<div class="lb-bar"><button type="button" class="lb-btn" data-lb="prev" aria-label="prev">' + ic('left', 20) + '</button>'
    + '<span id="lbCount"></span>'
    + '<button type="button" class="lb-btn" data-lb="next" aria-label="next">' + ic('right', 20) + '</button></div>';
  document.body.appendChild(el);
  document.body.classList.add('locked');
  lbEl = el;
  const show = (i) => {
    lbIndex = (i + lbImages.length) % lbImages.length;
    const img = $('#lbImg', el);
    if (img) img.src = lbImages[lbIndex];
    const cnt = $('#lbCount', el);
    if (cnt) cnt.textContent = (lbIndex + 1) + ' / ' + lbImages.length;
    const prev = $('[data-lb="prev"]', el);
    const next = $('[data-lb="next"]', el);
    if (prev) prev.disabled = lbImages.length < 2;
    if (next) next.disabled = lbImages.length < 2;
  };
  show(index);
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lb]');
    if (btn) {
      const act = btn.getAttribute('data-lb');
      if (act === 'close') closeLightbox();
      else if (act === 'prev') show(lbIndex - 1);
      else if (act === 'next') show(lbIndex + 1);
      return;
    }
    if (e.target === el) closeLightbox();
  });
  let x0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) show(lbIndex + (dx < 0 ? 1 : -1));
    x0 = null;
  }, { passive: true });
}
function closeLightbox() {
  if (lbEl) { lbEl.remove(); lbEl = null; }
  document.body.classList.remove('locked');
}

/* ------------------------------------------------------------------ *
 * 17. 路由
 * ------------------------------------------------------------------ */
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw ? raw.split('/').filter(Boolean) : [];
  try {
    if (parts[0] === 'p' && parts[1]) return { name: 'detail', id: decodeURIComponent(parts[1]) };
    if (parts[0] === 'login') return { name: 'login' };
    if (parts[0] === 'admin') return { name: 'admin', tab: parts[1] || 'products' };
    if (parts[0] === 'new') return { name: 'form', id: null };
    if (parts[0] === 'edit' && parts[1]) return { name: 'form', id: decodeURIComponent(parts[1]) };
  } catch (e) { /* ignore */ }
  return { name: 'home' };
}
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
function pageTitle(r) {
  if (r.name === 'detail') {
    const p = state.products.find((x) => x.id === r.id);
    if (p) return (p.name.zh || p.name.pt) + ' № ' + p.model + ' · XLZ';
    return 'XLZ';
  }
  if (r.name === 'login') return tt('loginTitle') + ' · XLZ';
  if (r.name === 'admin') return tt('adminTitle') + ' · XLZ';
  if (r.name === 'form') return tt('formNew') + ' · XLZ';
  return 'XLZ · 服装档口产品展示 | Atacado';
}
function render() {
  const r = parseRoute();
  if ((r.name === 'admin' || r.name === 'form') && !state.session) {
    pendingRoute = location.hash || '#/admin/products';
    location.replace('#/login');
    return;
  }
  if (r.name === 'login' && state.session) {
    location.replace('#/admin/products');
    return;
  }
  if (r.name !== 'form') F = null;

  let html = '';
  let key = '';
  if (r.name === 'detail') { key = 'd:' + r.id; html = renderDetail(r.id); }
  else if (r.name === 'login') { key = 'login'; html = renderLogin(); }
  else if (r.name === 'admin') { key = 'a:' + (r.tab || 'products'); html = renderAdmin(r.tab); }
  else if (r.name === 'form') { key = 'f:' + (r.id || 'new'); html = renderForm(r.id); }
  else { key = 'home'; html = renderHome(); }

  const app = document.getElementById('app');
  app.innerHTML = html;
  document.documentElement.lang = state.lang === 'pt' ? 'pt-BR' : 'zh-CN';
  document.title = pageTitle(r);
  if (key !== lastKey) {
    window.scrollTo(0, 0);
    lastKey = key;
  }
  if (r.name === 'detail') bindGallery();
  if (r.name === 'form') bindForm();
  if (r.name === 'login') {
    const u = document.getElementById('lgUser');
    if (u) setTimeout(() => u.focus({ preventScroll: true }), 140);
  }
}
function bindForm() {
  const file = document.getElementById('fImages');
  if (file) {
    file.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      addFiles(files);
    });
  }
  const color = document.getElementById('newColor');
  if (color) {
    color.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addColor(); }
    });
  }
}

/* ------------------------------------------------------------------ *
 * 18. 表单操作
 * ------------------------------------------------------------------ */
function renderImages() {
  const grid = document.getElementById('imgGrid');
  if (!grid || !F) return;
  grid.innerHTML = imagesHTML();
}
function renderColors() {
  const box = document.getElementById('colorList');
  if (box && F) box.innerHTML = colorsEditorHTML();
}
function renderSizePick() {
  const box = document.getElementById('sizePick');
  if (box && F) box.innerHTML = sizePickHTML();
}
function renderMatrix() {
  const box = document.getElementById('matrix');
  if (box && F) box.innerHTML = matrixHTML();
}
function addColor() {
  if (!F) return;
  const input = document.getElementById('newColor');
  const name = (input.value || '').trim();
  if (!name) return;
  if (F.data.colors.some((c) => c.zh === name)) { toast(t('eColorDup')); return; }
  const stock = {};
  F.data.sizes.forEach((s) => { stock[s] = true; });
  F.data.colors.push({ zh: name, pt: ptColor(name), stock });
  input.value = '';
  renderColors();
  renderMatrix();
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 760;
        const w0 = img.naturalWidth, h0 = img.naturalHeight;
        const scale = Math.min(1, max / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/webp', 0.72);
        if (out.indexOf('data:image/webp') !== 0) out = canvas.toDataURL('image/jpeg', 0.72);
        URL.revokeObjectURL(url);
        resolve(out);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}
async function addFiles(files) {
  if (!F || !files.length) return;
  const room = 10 - F.data.images.length;
  if (room <= 0) { toast(t('eImagesMax')); return; }
  if (files.length > room) toast(t('eImagesMax'));
  const grid = document.getElementById('imgGrid');
  if (grid) grid.classList.add('busy');
  for (const file of files.slice(0, room)) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) { toast(t('eFileType')); continue; }
    if (file.size > 5 * 1024 * 1024) { toast(t('eFileSize')); continue; }
    try {
      const data = await compressImage(file);
      F.data.images.push(data);
      renderImages();
    } catch (e) { toast(t('eFileType')); }
  }
  if (grid) grid.classList.remove('busy');
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}
function setFieldError(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const box = el.closest('.field') || el.closest('.sect');
  if (!box) return;
  box.classList.add('invalid');
  const msg = box.querySelector('.ferr');
  if (msg) msg.textContent = tt(key);
}
function clearFormErrors() {
  $$('.field.invalid, .sect.invalid').forEach((el) => el.classList.remove('invalid'));
  $$('.ferr').forEach((el) => { if (el.id !== 'lgErr') el.textContent = ''; });
}
function saveForm() {
  if (!F) return;
  clearFormErrors();
  const d = F.data;
  const errs = [];
  if (!String(d.name.zh || '').trim()) errs.push(['fNameZh', 'eName']);
  if (!String(d.model || '').trim()) errs.push(['fModel', 'eModel']);
  const price = parseFloat(String(d.price || '').replace(',', '.'));
  if (!isFinite(price) || price <= 0) errs.push(['fPrice', 'ePrice']);
  if (!d.images.length) errs.push(['imgErr', 'eImages']);
  if (!d.colors.length) errs.push(['colorErr', 'eColors']);
  if (!d.sizes.length) errs.push(['sizeErr', 'eSizes']);
  if (!d.category) errs.push(['fCat', 'eNoCat']);
  if (errs.length) {
    errs.forEach(([id, key]) => setFieldError(id, key));
    toast(t('eFields'));
    const first = $('.field.invalid, .sect.invalid');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const colors = d.colors.map((c) => {
    const stock = {};
    d.sizes.forEach((s) => { stock[s] = !!(c.stock && c.stock[s]); });
    return { zh: String(c.zh || '').trim() || '未命名', pt: String(c.pt || '').trim(), stock };
  });
  const product = {
    id: F.id || uid('p'),
    category: d.category,
    name: { zh: String(d.name.zh).trim(), pt: String(d.name.pt || '').trim() },
    model: String(d.model).trim(),
    price: Math.round(price * 100) / 100,
    sizes: SIZE_ORDER.filter((s) => d.sizes.indexOf(s) >= 0),
    colors,
    images: d.images.slice(),
    onShelf: !!d.onShelf,
    isNew: !!d.isNew,
    starred: !!d.starred,
    createdAt: F.createdAt || now()
  };
  const idx = state.products.findIndex((p) => p.id === product.id);
  if (idx >= 0) state.products[idx] = product;
  else state.products.push(product);
  if (!saveProducts()) {
    state.products = readLS(KEY.products, []) || [];
    return;
  }
  toast(t('sSaved'));
  F = null;
  go('#/p/' + product.id);
}

/* ------------------------------------------------------------------ *
 * 19. 账号 / 分类 / 数据
 * ------------------------------------------------------------------ */
function doLogin() {
  const u = (($('#lgUser') || {}).value || '').trim();
  const p = ($('#lgPass') || {}).value || '';
  const acc = state.admins.find((a) => a.u.toLowerCase() === u.toLowerCase());
  const err = document.getElementById('lgErr');
  if (!acc || acc.h !== hashPwd(acc.u, p)) {
    if (err) { err.textContent = tt('eLogin'); err.style.display = 'block'; }
    const pass = document.getElementById('lgPass');
    if (pass) pass.value = '';
    return;
  }
  state.session = { u: acc.u, exp: now() + SESSION_MS };
  writeLS(KEY.session, state.session);
  toast(t('sLogin'));
  const next = pendingRoute && pendingRoute.indexOf('#/login') !== 0 ? pendingRoute : '#/admin/products';
  pendingRoute = '';
  go(next);
}
function logout() {
  state.session = null;
  try { localStorage.removeItem(KEY.session); } catch (e) { /* ignore */ }
  toast(t('sLogout'));
  go('#/');
}
function openAddAccount() {
  const wrap = openModal(
    '<div class="modal-head"><h3>' + t('addAccount') + '</h3>'
    + '<button type="button" class="modal-x" data-role="close" aria-label="close">' + ic('x', 16) + '</button></div>'
    + '<div class="field"><label class="label" for="auUser">' + t('username') + '</label>'
    + '<input class="input" id="auUser" autocomplete="off" autocapitalize="none" spellcheck="false"></div>'
    + '<div class="field"><label class="label" for="auPass">' + t('password') + '</label>'
    + '<input class="input" id="auPass" type="password" autocomplete="new-password"></div>'
    + '<div class="field"><label class="label" for="auPass2">' + t('confirmPwd') + '</label>'
    + '<input class="input" id="auPass2" type="password" autocomplete="new-password">'
    + '<p class="ferr" id="auErr"></p></div>'
    + '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-role="no">' + t('cancel') + '</button>'
    + '<button type="button" class="btn btn-primary" id="auSave">' + t('save') + '</button></div>'
  );
  const save = () => {
    const u = ($('#auUser', wrap).value || '').trim();
    const p = $('#auPass', wrap).value || '';
    const p2 = $('#auPass2', wrap).value || '';
    const err = $('#auErr', wrap);
    const fail = (key) => { if (err) { err.textContent = tt(key); err.style.display = 'block'; } };
    if (u.length < 2) return fail('eUserShort');
    if (state.admins.some((a) => a.u.toLowerCase() === u.toLowerCase())) return fail('eUserExists');
    if (p.length < 4) return fail('ePwdShort');
    if (p !== p2) return fail('ePwdMatch');
    state.admins.push({ u, h: hashPwd(u, p), created: now() });
    if (!saveAdmins()) { state.admins.pop(); return; }
    closeModal(true);
    toast(t('sAccount'));
    render();
  };
  $('#auSave', wrap).addEventListener('click', save);
  ['auPass', 'auPass2', 'auUser'].forEach((id) => {
    const inp = document.getElementById(id);
    if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  });
  wrap.querySelector('[data-role="close"]').addEventListener('click', () => closeModal(false));
  wrap.querySelector('[data-role="no"]').addEventListener('click', () => closeModal(false));
}
function openChangePwd(username) {
  const acc = state.admins.find((a) => a.u === username);
  if (!acc) return;
  const isSelf = state.session && state.session.u === acc.u;
  const fields = (isSelf
    ? '<div class="field"><label class="label" for="cpCur">' + t('curPwd') + '</label>'
      + '<input class="input" id="cpCur" type="password" autocomplete="current-password"></div>'
    : '')
    + '<div class="field"><label class="label" for="cpNew">' + t('newPwd') + '</label>'
    + '<input class="input" id="cpNew" type="password" autocomplete="new-password"></div>'
    + '<div class="field"><label class="label" for="cpNew2">' + t('confirmPwd') + '</label>'
    + '<input class="input" id="cpNew2" type="password" autocomplete="new-password">'
    + '<p class="ferr" id="cpErr"></p></div>';
  const wrap = openModal(
    '<div class="modal-head"><h3>' + t('changePwd') + ' · ' + esc(acc.u) + '</h3>'
    + '<button type="button" class="modal-x" data-role="close" aria-label="close">' + ic('x', 16) + '</button></div>'
    + fields
    + '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-role="no">' + t('cancel') + '</button>'
    + '<button type="button" class="btn btn-primary" id="cpSave">' + t('save') + '</button></div>'
  );
  const save = () => {
    const cur = isSelf ? ($('#cpCur', wrap).value || '') : '';
    const p = $('#cpNew', wrap).value || '';
    const p2 = $('#cpNew2', wrap).value || '';
    const err = $('#cpErr', wrap);
    const fail = (key) => { if (err) { err.textContent = tt(key); err.style.display = 'block'; } };
    if (isSelf && acc.h !== hashPwd(acc.u, cur)) return fail('ePwdWrong');
    if (p.length < 4) return fail('ePwdShort');
    if (p !== p2) return fail('ePwdMatch');
    acc.h = hashPwd(acc.u, p);
    if (!saveAdmins()) return;
    closeModal(true);
    toast(t('sPwd'));
  };
  $('#cpSave', wrap).addEventListener('click', save);
  ['cpCur', 'cpNew', 'cpNew2'].forEach((id) => {
    const inp = document.getElementById(id);
    if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  });
  wrap.querySelector('[data-role="close"]').addEventListener('click', () => closeModal(false));
  wrap.querySelector('[data-role="no"]').addEventListener('click', () => closeModal(false));
}
async function deleteAccount(username) {
  if (state.admins.length <= 1) { toast(t('eLastAcc')); return; }
  if (state.session && state.session.u === username) { toast(t('eSelf')); return; }
  const ok = await confirmDialog({
    title: t('delAccountTitle'),
    html: '<b>' + esc(username) + '</b><br><br>' + t('delAccountText'),
    okText: t('confirmDel')
  });
  if (!ok) return;
  state.admins = state.admins.filter((a) => a.u !== username);
  if (!saveAdmins()) return;
  toast(t('sAccountDel'));
  render();
}
async function deleteProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  const ok = await confirmDialog({
    title: t('delProductTitle'),
    html: '<b>' + esc(p.name.zh || p.name.pt) + '</b> · № ' + esc(p.model) + '<br><br>' + t('delProductText'),
    okText: t('confirmDel')
  });
  if (!ok) return;
  state.products = state.products.filter((x) => x.id !== id);
  if (!saveProducts()) { state.products = readLS(KEY.products, []) || []; return; }
  toast(t('sDeleted'));
  const r = parseRoute();
  if (r.name === 'detail' && r.id === id) go('#/');
  else render();
}
function toggleProductFlag(id, field) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  p[field] = !p[field];
  if (saveProducts()) render();
}
function saveStoreSettings() {
  const phone = ($('#setPhone') || {}).value || '';
  const addr = ($('#setAddr') || {}).value || '';
  state.settings.phone = phone.trim();
  state.settings.address = addr.trim();
  state.settings.mapQuery = addr.trim();
  saveSettings();
  toast(t('sSaved'));
  render();
}
function addCategory() {
  const zh = (($('#newCatZh') || {}).value || '').trim();
  const pt = (($('#newCatPt') || {}).value || '').trim();
  if (!zh) { toast(t('eCatName')); return; }
  const id = 'c' + now().toString(36) + Math.random().toString(36).slice(2, 4);
  state.cats.push({ id, zh, pt: pt || zh });
  saveCats();
  toast(t('sCatAdded'));
  render();
}
async function deleteCategory(id) {
  if (state.products.some((p) => p.category === id)) { toast(t('catInUse')); return; }
  const cat = catById(id);
  const ok = await confirmDialog({
    title: t('delCatTitle'),
    html: '<b>' + esc(cat ? cat.zh : id) + '</b><br><br>' + t('delCatText'),
    okText: t('confirmDel')
  });
  if (!ok) return;
  state.cats = state.cats.filter((c) => c.id !== id);
  if (state.cat === id) state.cat = 'all';
  saveCats();
  toast(t('sCatDel'));
  render();
}
function exportData() {
  const data = {
    app: 'xlz-showcase', version: 1, at: new Date().toISOString(),
    products: state.products, admins: state.admins, cats: state.cats, settings: state.settings
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'xlz-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(t('sExported'));
}
async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || data.app !== 'xlz-showcase' || !Array.isArray(data.products)) throw new Error('bad');
    const ok = await confirmDialog({ title: t('importJson'), html: t('importWarn'), okText: t('confirm'), danger: false });
    if (!ok) return;
    state.products = data.products;
    if (Array.isArray(data.admins) && data.admins.length) state.admins = data.admins;
    if (Array.isArray(data.cats) && data.cats.length) state.cats = data.cats;
    if (data.settings) state.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
    writeLS(KEY.products, state.products);
    writeLS(KEY.admins, state.admins);
    writeLS(KEY.cats, state.cats);
    writeLS(KEY.settings, state.settings);
    if (state.session && !state.admins.some((a) => a.u === state.session.u)) {
      state.session = null;
      localStorage.removeItem(KEY.session);
    }
    toast(t('sImported'));
    render();
  } catch (e) { toast(t('eImport')); }
}

/* ------------------------------------------------------------------ *
 * 20. 事件
 * ------------------------------------------------------------------ */
function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.getAttribute('data-act');
  switch (act) {
    case 'lang':
      state.lang = el.getAttribute('data-lang');
      writeLS(KEY.lang, state.lang);
      render();
      break;
    case 'open': {
      const id = el.getAttribute('data-id');
      if (id) go('#/p/' + id);
      break;
    }
    case 'edit': {
      const id = el.getAttribute('data-id');
      if (id) go('#/edit/' + id);
      break;
    }
    case 'new': go('#/new'); break;
    case 'filter': {
      state.cat = el.getAttribute('data-cat');
      $$('.filter-chip').forEach((b) => b.classList.toggle('on', b.getAttribute('data-cat') === state.cat));
      refreshFeed();
      break;
    }
    case 'clear': {
      const input = document.getElementById('q');
      if (input) { input.value = ''; input.focus({ preventScroll: true }); }
      state.query = '';
      const btn = el;
      if (btn) btn.hidden = true;
      refreshFeed();
      break;
    }
    case 'gal': {
      const track = document.getElementById('galTrack');
      if (track) track.scrollBy({ left: Number(el.getAttribute('data-dir')) * track.clientWidth, behavior: 'smooth' });
      break;
    }
    case 'gal-dot': {
      const track = document.getElementById('galTrack');
      if (track) track.scrollTo({ left: Number(el.getAttribute('data-i')) * track.clientWidth, behavior: 'smooth' });
      break;
    }
    case 'zoom': {
      const p = currentProduct();
      if (!p) break;
      openLightbox((p.images && p.images.length) ? p.images : [FALLBACK_ART], Number(el.getAttribute('data-i')) || 0);
      break;
    }
    case 'color':
      detailColor = Number(el.getAttribute('data-i')) || 0;
      {
        const p = currentProduct();
        const box = document.getElementById('stockArea');
        if (p && box) box.innerHTML = stockAreaHTML(p);
      }
      break;
    case 'del': deleteProduct(el.getAttribute('data-id')); break;
    case 'toggle': toggleProductFlag(el.getAttribute('data-id'), el.getAttribute('data-field')); break;
    case 'logout': logout(); break;
    case 'addacc': openAddAccount(); break;
    case 'chpw': openChangePwd(el.getAttribute('data-u')); break;
    case 'delacc': deleteAccount(el.getAttribute('data-u')); break;
    case 'doLogin': doLogin(); break;
    case 'saveset': saveStoreSettings(); break;
    case 'addcat': addCategory(); break;
    case 'delcat': deleteCategory(el.getAttribute('data-id')); break;
    case 'export': exportData(); break;
    case 'import': {
      const file = document.getElementById('importFile');
      if (file) file.click();
      break;
    }
    case 'pick': {
      const file = document.getElementById('fImages');
      if (file) file.click();
      break;
    }
    case 'rmimg': {
      if (!F) break;
      F.data.images.splice(Number(el.getAttribute('data-i')), 1);
      renderImages();
      break;
    }
    case 'addcolor': addColor(); break;
    case 'rmcolor': {
      if (!F) break;
      F.data.colors.splice(Number(el.getAttribute('data-i')), 1);
      renderColors();
      renderMatrix();
      break;
    }
    case 'size': {
      if (!F) break;
      const sz = el.getAttribute('data-sz');
      const i = F.data.sizes.indexOf(sz);
      if (i >= 0) F.data.sizes.splice(i, 1);
      else {
        F.data.sizes.push(sz);
        F.data.colors.forEach((c) => { if (c.stock[sz] === undefined) c.stock[sz] = true; });
      }
      renderSizePick();
      renderMatrix();
      break;
    }
    case 'cell': {
      if (!F) break;
      const ci = Number(el.getAttribute('data-ci'));
      const sz = el.getAttribute('data-sz');
      const col = F.data.colors[ci];
      if (!col) break;
      col.stock[sz] = !col.stock[sz];
      renderMatrix();
      break;
    }
    case 'flag': {
      if (!F) break;
      const field = el.getAttribute('data-field');
      F.data[field] = !F.data[field];
      el.classList.toggle('on', !!F.data[field]);
      el.setAttribute('aria-pressed', String(!!F.data[field]));
      break;
    }
    case 'save': saveForm(); break;
    case 'cancel': {
      if (!F) { go('#/admin/products'); break; }
      const editing = F.id ? state.products.find((p) => p.id === F.id) : null;
      go(editing ? '#/p/' + editing.id : '#/admin/products');
      break;
    }
    default: break;
  }
}
function onInput(e) {
  const el = e.target;
  if (!el) return;
  if (el.id === 'q') {
    state.query = el.value;
    const btn = document.querySelector('.search-clear');
    if (btn) btn.hidden = !el.value;
    refreshFeed();
    return;
  }
  if (!F) return;
  if (el.dataset && el.dataset.f) setPath(F.data, el.dataset.f, el.value);
  if (el.dataset && el.dataset.ce) {
    const i = Number(el.dataset.i);
    const key = el.dataset.ce;
    if (F.data.colors[i]) {
      F.data.colors[i][key] = el.value;
      if (key === 'zh') {
        const dot = el.closest('.ce-top') && el.closest('.ce-top').querySelector('.dot');
        if (dot) dot.style.background = colorHex(el.value);
      }
    }
  }
  const field = el.closest('.field');
  if (field) field.classList.remove('invalid');
}
function onKey(e) {
  if (e.key === 'Escape') {
    if (lbEl) { closeLightbox(); return; }
    if (modalEl) { closeModal(false); return; }
  }
  if (e.key === 'Enter' && e.target && e.target.id === 'lgPass') {
    e.preventDefault();
    doLogin();
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target) {
    const card = e.target.closest('.card[data-act="open"]');
    if (card && e.target === card) {
      e.preventDefault();
      go('#/p/' + card.getAttribute('data-id'));
    }
  }
}

/* ------------------------------------------------------------------ *
 * 21. 启动
 * ------------------------------------------------------------------ */
loadAll();
window.addEventListener('hashchange', render);
document.addEventListener('click', onClick);
document.addEventListener('input', onInput);
document.addEventListener('keydown', onKey);
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'fCat' && F) F.data.category = e.target.value;
  if (e.target && e.target.id === 'importFile' && e.target.files && e.target.files[0]) {
    importData(e.target.files[0]);
    e.target.value = '';
  }
});
document.addEventListener('error', (e) => {
  const el = e.target;
  if (el && el.tagName === 'IMG' && !el.dataset.fb) {
    el.dataset.fb = '1';
    el.src = FALLBACK_ART;
  }
}, true);
render();

})();
