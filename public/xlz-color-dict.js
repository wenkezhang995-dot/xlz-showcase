'use strict';
/* =====================================================================
   XLZ 颜色翻译词典（本地 · 中葡捆绑）
   ---------------------------------------------------------------------
   - 每条颜色捆绑中文(zh)与葡文(pt)两份写法，人工维护，不接入机器翻译。
   - 双向查询：按中文查葡文 / 按葡文查中文，附色值 hex 与别名 alias。
   - 未收录颜色允许手工填写，查询未命中时原样返回，不阻断保存。

   接入方式（纯静态站点）：
   1. 将本文件放入站点 public/ 目录；
   2. 在 index.html 中于 app.js 之前引入：
      <script src="xlz-color-dict.js"></script>
      <script src="app.js"></script>
   3. app.js 内用下列方法替换原有内置颜色常量表：
      XLZColor.ptOf(zh)   中文 → 葡文
      XLZColor.zhOf(pt)   葡文 → 中文
      XLZColor.hexOf(name) 颜色名 → 色值
      XLZColor.all()      全部词典条目（副本）

   字段限制：中文 ≤ 12 字符，葡文 ≤ 20 字符（与需求文档一致）。
   ===================================================================== */

(function (global) {

  /* 预置颜色：id 稳定不变；zh 主名；pt 葡文；hex 色值；alias 中文别名 */
  var DICT = [
    { id: 'preto',      zh: '黑色',     pt: 'Preto',        hex: '#111214', alias: ['黑'] },
    { id: 'branco',     zh: '白色',     pt: 'Branco',       hex: '#F7F5EF', alias: ['白'] },
    { id: 'vermelho',   zh: '红色',     pt: 'Vermelho',     hex: '#C8102E', alias: ['红'] },
    { id: 'bege',       zh: '米色',     pt: 'Bege',         hex: '#D9C7AE', alias: ['米'] },
    { id: 'offwhite',   zh: '米白',     pt: 'Off-white',    hex: '#EFE6D4', alias: [] },
    { id: 'creme',      zh: '奶油色',   pt: 'Creme',        hex: '#F2E8D8', alias: [] },
    { id: 'pessego',    zh: '杏色',     pt: 'Pêssego',      hex: '#E2BE9C', alias: [] },
    { id: 'camel',      zh: '驼色',     pt: 'Camel',        hex: '#B98C5E', alias: [] },
    { id: 'caqui',      zh: '卡其',     pt: 'Caqui',        hex: '#B7A57C', alias: [] },
    { id: 'marrom',     zh: '棕色',     pt: 'Marrom',       hex: '#7A5742', alias: ['棕'] },
    { id: 'cafe',       zh: '咖色',     pt: 'Marrom Café',  hex: '#6B4B36', alias: ['咖', '咖啡'] },
    { id: 'marromEsc',  zh: '深棕',     pt: 'Marrom Escuro',hex: '#4A3527', alias: [] },
    { id: 'azul',       zh: '蓝色',     pt: 'Azul',          hex: '#2E5A94', alias: ['蓝'] },
    { id: 'azulJeans',  zh: '牛仔蓝',   pt: 'Azul Jeans',   hex: '#3E6493', alias: [] },
    { id: 'azulMarinho',zh: '藏青',     pt: 'Azul Marinho', hex: '#1B2A4A', alias: [] },
    { id: 'azulClaro',  zh: '浅蓝',     pt: 'Azul Claro',   hex: '#A9C6E8', alias: [] },
    { id: 'verde',      zh: '绿色',     pt: 'Verde',        hex: '#1F6B3F', alias: ['绿'] },
    { id: 'verdeMusgo', zh: '墨绿',     pt: 'Verde Musgo',  hex: '#24513A', alias: [] },
    { id: 'verdeOliva', zh: '军绿',     pt: 'Verde Oliva',  hex: '#556B2F', alias: [] },
    { id: 'verdeMenta', zh: '薄荷绿',   pt: 'Verde Menta',  hex: '#98D8C8', alias: [] },
    { id: 'amarelo',    zh: '黄色',     pt: 'Amarelo',      hex: '#E9B81C', alias: ['黄'] },
    { id: 'laranja',    zh: '橙色',     pt: 'Laranja',      hex: '#D9722B', alias: ['橙'] },
    { id: 'rosa',       zh: '粉色',     pt: 'Rosa',          hex: '#E5A0B0', alias: ['粉'] },
    { id: 'roxo',       zh: '紫色',     pt: 'Roxo',          hex: '#6C4C8C', alias: ['紫'] },
    { id: 'cinza',      zh: '灰色',     pt: 'Cinza',         hex: '#9AA3A0', alias: ['灰'] },
    { id: 'vinho',      zh: '酒红',     pt: 'Vinho',        hex: '#6E1226', alias: [] },
    { id: 'prateado',   zh: '银色',     pt: 'Prateado',     hex: '#C0C0C0', alias: [] },
    { id: 'dourado',    zh: '金色',     pt: 'Dourado',      hex: '#D4AF37', alias: [] }
  ];

  function normZh(v) { return String(v == null ? '' : v).trim(); }
  function normPt(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  /* 按中文主名或别名查找 */
  function findByZh(zh) {
    var k = normZh(zh);
    if (!k) return null;
    for (var i = 0; i < DICT.length; i++) {
      var c = DICT[i];
      if (c.zh === k || c.alias.indexOf(k) >= 0) return c;
    }
    return null;
  }

  /* 按葡文查找（忽略大小写） */
  function findByPt(pt) {
    var k = normPt(pt);
    if (!k) return null;
    for (var i = 0; i < DICT.length; i++) {
      if (normPt(DICT[i].pt) === k) return DICT[i];
    }
    return null;
  }

  /* 中文 → 葡文；未收录原样返回 */
  function ptOf(zh) { var c = findByZh(zh); return c ? c.pt : normZh(zh); }

  /* 葡文 → 中文；未收录原样返回 */
  function zhOf(pt) { var c = findByPt(pt); return c ? c.zh : normPt(pt); }

  /* 颜色名 → 色值；未收录返回兜底色 */
  function hexOf(name) {
    var c = findByZh(name) || findByPt(name);
    return c ? c.hex : '#C9C4B5';
  }

  /* 全部条目副本，避免外部修改预置表 */
  function all() { return DICT.map(function (c) { return { id: c.id, zh: c.zh, pt: c.pt, hex: c.hex, alias: c.alias.slice() }; }); }

  global.XLZ_COLOR_DICT = DICT;
  global.XLZColor = {
    findByZh: findByZh,
    findByPt: findByPt,
    ptOf: ptOf,
    zhOf: zhOf,
    hexOf: hexOf,
    all: all
  };

})(window);
