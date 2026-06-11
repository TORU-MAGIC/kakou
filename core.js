'use strict';
/* ============================================================
   core.js — 共通計算コア（全加工タブ共有）
   ・材料/工具/チップDB（MAT, TOOL, GRADE）
   ・物理計算ユーティリティ（Kienzle切削力, 係合角, Taylor寿命 等）
   ・UI共通ヘルパー（バー描画, 物理パネル, 比較表, Taylor図）
   ※読み込み順は先頭（他ファイルが本ファイルの関数/定数を参照）
   ============================================================ */

/* ================================================================
   【材料データベース】 ★調整可
   Ks1 [N/mm²]=比切削抵抗, mc [-]=Kienzle勾配指数,
   C_T・n_T=Taylor工具寿命係数 (T=C_T / Vc^(1/n_T)),
   cp [J/kg·K]=比熱, lam [W/m·K]=熱伝導率, HB=ブリネル硬度,
   vcM/vcD/vcT=フライス/ドリル/旋盤の推奨切削速度[m/min]
================================================================ */
const MAT = {
  al:      {name:'アルミ合金 A2017',  Ks1:700,  mc:0.25, C_T:600,  n_T:5.0, cp:900,  lam:140, HB:95,
            vcM:{rough:120,semi:160,finish:200}, vcD:{rough:80,finish:60},  vcT:{rough:100,semi:150,finish:200}},
  al7075:  {name:'A7075超ジュラルミン',Ks1:780, mc:0.25, C_T:550,  n_T:5.0, cp:870,  lam:130, HB:150,
            vcM:{rough:100,semi:140,finish:180}, vcD:{rough:70,finish:55},  vcT:{rough:90,semi:130,finish:170}},
  steel:   {name:'S45C / SS400',     Ks1:2100, mc:0.26, C_T:200,  n_T:3.5, cp:490,  lam:48,  HB:180,
            vcM:{rough:50,semi:70,finish:90},   vcD:{rough:35,finish:28},  vcT:{rough:55,semi:80,finish:110}},
  steel_h: {name:'SCM440 HRC30',     Ks1:2500, mc:0.27, C_T:150,  n_T:3.0, cp:480,  lam:42,  HB:290,
            vcM:{rough:20,semi:30,finish:45},   vcD:{rough:18,finish:14},  vcT:{rough:25,semi:40,finish:55}},
  steel_hh:{name:'SKD11 HRC55',      Ks1:3200, mc:0.28, C_T:80,   n_T:2.5, cp:460,  lam:38,  HB:580,
            vcM:{rough:8, semi:12,finish:18},   vcD:{rough:6, finish:5},   vcT:{rough:10,semi:15,finish:22}},
  sus304:  {name:'SUS304',           Ks1:2800, mc:0.30, C_T:120,  n_T:3.0, cp:500,  lam:16,  HB:170,
            vcM:{rough:25,semi:38,finish:50},   vcD:{rough:18,finish:14},  vcT:{rough:28,semi:42,finish:60}},
  sus316:  {name:'SUS316L',          Ks1:2900, mc:0.31, C_T:110,  n_T:2.8, cp:500,  lam:15,  HB:165,
            vcM:{rough:22,semi:33,finish:45},   vcD:{rough:15,finish:12},  vcT:{rough:24,semi:36,finish:52}},
  cast:    {name:'鋳鉄 FC250',        Ks1:1100, mc:0.22, C_T:300,  n_T:4.0, cp:460,  lam:50,  HB:210,
            vcM:{rough:35,semi:50,finish:65},   vcD:{rough:30,finish:25},  vcT:{rough:40,semi:60,finish:80}},
  ti:      {name:'Ti-6Al-4V',        Ks1:2000, mc:0.28, C_T:100,  n_T:2.5, cp:560,  lam:7,   HB:300,
            vcM:{rough:10,semi:15,finish:20},   vcD:{rough:8, finish:6},   vcT:{rough:12,semi:18,finish:25}},
  ni:      {name:'Inconel 718',      Ks1:3500, mc:0.35, C_T:60,   n_T:2.0, cp:430,  lam:11,  HB:350,
            vcM:{rough:6, semi:9, finish:12},   vcD:{rough:5, finish:4},   vcT:{rough:8, semi:12,finish:16}},
  cu:      {name:'銅合金 C3604',      Ks1:600,  mc:0.20, C_T:700,  n_T:5.5, cp:380,  lam:120, HB:80,
            vcM:{rough:150,semi:200,finish:250},vcD:{rough:100,finish:80}, vcT:{rough:120,semi:180,finish:240}},
  cfrp:    {name:'CFRP',             Ks1:500,  mc:0.15, C_T:400,  n_T:4.0, cp:900,  lam:8,   HB:45,
            vcM:{rough:80,semi:120,finish:180}, vcD:{rough:60,finish:50},  vcT:{rough:80,semi:120,finish:160}},
};

/* ================================================================
   工具材質データベース（拡張版）
================================================================ */
const TOOL = {
  hss:    {name:'HSS',        vcF:1.00,sigma:380,rho:1.00,E:210000,desc:'汎用・靭性最高。耐熱600℃。断続◎',chips:['Vc低め','靭性◎','衝撃◎']},
  cobalt: {name:'Co-HSS',    vcF:1.20,sigma:440,rho:1.00,E:215000,desc:'耐熱650℃。難削材に有効。靭性◎',chips:['Vc中','靭性◎','耐熱+']},
  carbide:{name:'Carbide',   vcF:2.00,sigma:520,rho:0.60,E:550000,desc:'耐摩耗◎。脆性あり。耐熱800℃',chips:['Vc高','耐摩耗◎','脆性注意']},
  altin:  {name:'AlTiN超硬', vcF:2.60,sigma:500,rho:0.55,E:530000,desc:'高速乾式◎。耐熱900℃。脆性注意',chips:['Vc最高','乾式◎','耐熱◎']},
  altisiN:{name:'AlTiSiN',   vcF:2.80,sigma:490,rho:0.52,E:520000,desc:'耐熱1000℃。Ti/Inconel有効',chips:['Vc最高','超耐熱','難削材◎']},
  diamond:{name:'DLC/Diamond',vcF:3.20,sigma:400,rho:0.40,E:800000,desc:'アルミ専用。超低摩擦。耐衝撃×',chips:['Al専用','超低摩擦','耐衝撃×']},
  coated: {name:'TiAlN超硬', vcF:2.40,sigma:500,rho:0.55,E:530000,desc:'汎用コーティング。耐熱900℃',chips:['Vc高','汎用','耐熱◎']},
  cermet: {name:'サーメット', vcF:2.40,sigma:420,rho:0.45,E:400000,desc:'仕上げ専用。超低摩擦。断続×',chips:['仕上げ専用','低摩擦','断続×']},
  cbn:    {name:'CBN',       vcF:3.50,sigma:350,rho:0.30,E:680000,desc:'焼入鋼専用。耐熱1100℃。脆性最大',chips:['焼入鋼専用','超耐熱','最脆性']},
  pcd:    {name:'PCD',       vcF:4.00,sigma:360,rho:0.35,E:700000,desc:'アルミ/銅専用。超長寿命。Fe×',chips:['Al/Cu専用','超長寿命','Fe不可']},
};

/* ================================================================
   チップ材種データベース (ISO P/M/K/N/S/H分類)
================================================================ */
const GRADE = {
  P10:{vcF:2.60,fzF:0.85,name:'P10',desc:'鋼・高速・軽切削。仕上げ用。断続切削に注意'},
  P20:{vcF:2.20,fzF:1.00,name:'P20',desc:'鋼・汎用。荒〜中仕上げ。最も一般的'},
  P30:{vcF:1.80,fzF:1.15,name:'P30',desc:'鋼・強断続・深い切込み対応。靭性重視'},
  M10:{vcF:1.90,fzF:0.85,name:'M10',desc:'SUS・高速仕上げ。耐溶着性重視'},
  M20:{vcF:1.60,fzF:1.00,name:'M20',desc:'SUS・汎用。荒〜中仕上げ対応'},
  K10:{vcF:2.30,fzF:0.85,name:'K10',desc:'鋳鉄・高速。アルミ兼用可'},
  K20:{vcF:2.00,fzF:1.00,name:'K20',desc:'鋳鉄・汎用。荒〜中仕上げ'},
  N10:{vcF:3.00,fzF:0.90,name:'N10',desc:'アルミ・銅高速切削専用。超低摩擦'},
  S10:{vcF:1.20,fzF:0.80,name:'S10',desc:'Ti・Ni超耐熱合金用。耐溶着・耐熱性重視'},
  S20:{vcF:1.00,fzF:0.90,name:'S20',desc:'耐熱合金汎用。S10より靭性重視'},
  H10:{vcF:2.80,fzF:0.70,name:'H10',desc:'焼入鋼専用。硬脆性材切削。CBN相当'},
};

/* ================================================================
   【バイトインサート形状データベース】 ★調整可  — 旋盤/MC1本バイト共通
   ISOインサート形状(呼称1文字目)。ノーズ(コーナー)内角=「当たり面」の刃先強度。
   ・内角が大きい(丸R/四角S90°/トライゴンW80°/ひし形C80°)ほど刃先が強く、
     送り・切込みを大きく取れる(=送り係数strF・ap係数apFが大)。
   ・内角が小さい(三角T60°/ひし形D55°/ひし形V35°)ほど倣い・突っ込み性◎だが
     刃先が弱く、送りは控えめにする。
   eps  = ノーズ内角[deg]（180=丸の便宜値）
   strF = 送り係数（基準C(80°)=1.00 に対する比。刃先強度に対応）
   apF  = 推奨ap係数（同上・目安表示用）
   ※「当たり面(切れ刃係合長) b = ap/sin(κr)」「切りくず断面 A = ap×f」は
     insertShapeAdjust() でκr・ap・fから別途算出する。
================================================================ */
const INSERT_SHAPE = {
  R:{name:'丸 R (RNMG/RCMT)',                     eps:180, strF:1.30, apF:1.30, desc:'丸チップ。刃先最強。倣い・重切削・R/コーナ加工。送り最大・大ap可だが背分力(径方向力)が大きくびびり注意'},
  S:{name:'四角 90° S (SNMG)',                    eps:90,  strF:1.15, apF:1.20, desc:'スクエア4〜8コーナー。刃先が強く端面・荒・強断続向き。経済的'},
  W:{name:'三角フラット(トライゴン)80° W (WNMG)', eps:80,  strF:1.05, apF:1.10, desc:'トライゴン両面6コーナー。80°で刃先が強い。強断続・汎用・経済的'},
  C:{name:'ひし形 80° C (CNMG)',                  eps:80,  strF:1.00, apF:1.00, desc:'80°ひし形。最も汎用の基準形状。外径荒〜仕上げ・端面'},
  T:{name:'三角 60° T (TNMG)',                    eps:60,  strF:0.85, apF:0.90, desc:'三角60°。3〜6コーナーで経済的。汎用・段付き。Cより刃先弱め'},
  D:{name:'ひし形 55° D (DNMG)',                  eps:55,  strF:0.78, apF:0.85, desc:'55°ひし形。倣い加工の定番。刃先やや弱く送り控えめ'},
  V:{name:'ひし形 35° V (VNMG)',                  eps:35,  strF:0.60, apF:0.65, desc:'35°ひし形。倣い・突っ込み・仕上げ。刃先弱く送り/ap控えめ'},
};
/* 形状＋ap・f・κr から 送り/刃先強度補正と「当たり面(切れ刃係合)」を返す */
function insertShapeAdjust(shapeKey, ap, f, kr_deg){
  const sh = INSERT_SHAPE[shapeKey] || INSERT_SHAPE.C;
  const kr = kr_deg || 75;
  const b_eng = ap>0 ? ap/Math.sin(kr*Math.PI/180) : 0;   // 切れ刃係合長(当たり面の幅)[mm]
  const area  = (ap>0 && f>0) ? ap*f : 0;                  // 切りくず断面積[mm²]
  const epsTxt = sh.eps>=180 ? '丸(R)' : sh.eps+'°';
  return {sh, name:sh.name, eps:sh.eps, epsTxt, strF:sh.strF, apF:sh.apF, b_eng, area, kr};
}

/* ================================================================
   物理計算ユーティリティ
================================================================ */

/* 径依存 fz カタログ補正 (小径ほど小さい送りが適正) */
function fzDiamFactor(D) {
  return D<=6?0.60:D<=8?0.70:D<=10?0.80:D<=16?1.00:D<=20?1.15:D<=25?1.30:D<=32?1.45:1.55;
}

function interp(x, pts) {
  if(x<=pts[0][0]) return pts[0][1];
  for(let i=1;i<pts.length;i++){
    if(x<=pts[i][0]){const t=(x-pts[i-1][0])/(pts[i][0]-pts[i-1][0]);return pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t;}
  }
  return pts[pts.length-1][1];
}

/* OH/D補正係数 (突き出し/径比による剛性低下) */
function ohFactor(OH, D) {
  const r = OH/D;
  return interp(r, [[0,1.0],[1,1.0],[2,0.95],[3,0.88],[4,0.80],[5,0.70],[6,0.60],[7,0.50],[8,0.42],[10,0.30],[12,0.22],[15,0.15]]);
}

/* 振動安定性係数 */
function vibFactor(OH, D) {
  const r = OH/D;
  if(r<=2) return {stable:true, lv:'安定'};
  if(r<=3) return {stable:true, lv:'良好'};
  if(r<=4) return {stable:false, lv:'注意'};
  if(r<=5) return {stable:false, lv:'高びびり危険'};
  return {stable:false, lv:'加工困難'};
}

/* 工具断面係数 エンドミル */
function coreRatioEM(Z) {
  return Z<=2?0.55:Z<=3?0.60:Z<=4?0.65:0.70;
}
function sectionModulusEM(D, Z) {
  const dc = D*coreRatioEM(Z);
  return Math.PI*(Math.pow(D,4)-Math.pow(dc,4))/(32*D);
}

/* 平均切削厚さ hm (係合角厳密式)
   h(θ)=fz·sinθ を係合区間[0,φ]で平均: hm = fz·(1-cosφ)/φ
   ※ (1-cosφ)=2sin²(φ/2)。スロット加工(φ=π)で hm=2fz/π に一致 */
function hmM(fz, ae, D) {
  const r = Math.min(ae/D, 1.0);
  const phi = Math.acos(Math.max(-1, Math.min(1, 1-2*r)));
  if(phi<1e-9) return 0;
  return fz*(1-Math.cos(phi))/phi;
}

/* 係合角 deg */
function phiDeg(ae, D) {
  return Math.acos(Math.max(-1,Math.min(1,1-2*Math.min(ae/D,1))))*180/Math.PI;
}

/* 有効刃数 */
function Zeff(Z, ae, D) {
  const phi = Math.acos(Math.max(-1,Math.min(1,1-2*Math.min(ae/D,1))));
  return Z*phi/(2*Math.PI);
}

/* 1刃切削力 */
function FcTooth(fz, ae, D, ap, mat) {
  const hm = hmM(fz, ae, D);
  if(hm<=0) return 0;
  const db = MAT[mat];
  return db.Ks1*Math.pow(hm, 1-db.mc)*ap;
}

/* 全体切削力(平均) */
function FcTotal(fz, ae, D, ap, Z, mat) {
  return FcTooth(fz,ae,D,ap,mat)*Zeff(Z,ae,D);
}

/* fz_max逆算 (ミリング汎用) */
function fzMaxMilling(ae, D, ap, Z, mat, toolSigma, toolRho, Vc, Pm, eta, OH) {
  const db = MAT[mat];
  const P_avail = Pm*eta;
  const Fc_motor = (P_avail*1000*60)/Vc;
  const L_oh = OH || 3*D;
  const Zsec = sectionModulusEM(D, Z);
  const sigma_eff = toolSigma*toolRho;
  const M_all = sigma_eff*Zsec;
  // 工具曲げ制約: 全切削力の合力FcTがOHで受ける → FcT_max = M_allow/OH
  // (誤: Fc_tool_1t*ze は工具強度をZeff倍に過大評価してしまう)
  const Fc_tool_max = M_all/L_oh;  // 合計切削力の上限
  const ze = Zeff(Z, ae, D);
  const Fc_max = Math.min(Fc_motor, Fc_tool_max);
  const C_ae = hmM(1.0, ae, D);
  if(C_ae<=0||ze<=0) return 0;
  const exponent = 1/(1-db.mc);
  const rhs = Fc_max/(db.Ks1*Math.pow(C_ae,1-db.mc)*ap*ze);
  if(rhs<=0) return 0;
  return Math.pow(rhs, exponent);
}

/* Taylor工具寿命  ★出典: F.W.Taylor 標準式  Vc·T^n = C  →  T = (C/Vc)^(1/n)
   本アプリのデータ規約: C_T = C(寿命1minとなる切削速度[m/min]), n_T = 1/n(速度感度指数, 超硬-鋼で約3〜4)
   よって  T[min] = (C_T / Vc)^n_T
   ※v4.2.1修正: 旧コードは C_T/Vc^(1/n_T) で指数が小さすぎ寿命曲線が平坦すぎた(非現実的)→標準式に是正。
     これで「速度2倍→寿命が材料相応に激減」というTaylorの強い速度依存を正しく再現する。 */
function taylorLife(Vc, mat) {
  const db = MAT[mat];
  if(Vc<=0) return 0;
  return Math.pow(db.C_T / Vc, db.n_T);
}

/* 理論面粗さ Rz [μm] */
function theorRz(f, re) {
  return (f*f/(8*re))*1000; // mm→μm
}

/* Kienzle式の進入角補正。
   Sandvik等の標準的な切削力式では、実切削厚 h=f×sin(KAPR) として
   kc = kc1×h^(-mc) を使うため、旋削/中ぐりでは sin(KAPR)^(-mc) を掛ける。 */
function kaprKienzleFactor(matKey, kr_deg){
  const db = MAT[matKey] || MAT.steel;
  const kr = (kr_deg || 75) * Math.PI / 180;
  const sinK = Math.max(Math.sin(kr), 0.15);
  return Math.pow(sinK, -db.mc);
}

/* 工具材質×被削材の相性警告。計算自体は止めず、専用工具の誤用を見える化する。 */
function toolMaterialWarning(toolKey, matKey){
  const nonFerrous = (matKey==='al'||matKey==='al7075'||matKey==='cu'||matKey==='cfrp');
  if((toolKey==='pcd'||toolKey==='diamond') && !nonFerrous){
    return '⚠ PCD/Diamond系はアルミ・銅・CFRPなどの非鉄向きです。鋼・SUS・鋳鉄・Ti/Niではメーカー推奨工具へ変更してください。';
  }
  if(toolKey==='cbn' && matKey!=='steel_hh'){
    return '⚠ CBNは主に高硬度焼入鋼向きです。この材料では超硬/PVD/CVD系の推奨グレード確認が必要です。';
  }
  if(toolKey==='cermet' && (matKey==='ti'||matKey==='ni'||matKey==='steel_hh'||nonFerrous)){
    return '⚠ サーメットは主に鋼の連続仕上げ向きです。断続・難削材・非鉄では専用超硬/PCD/CBNを確認してください。';
  }
  return '';
}

/* ================================================================
   【クーラント（油種）モデル】 ★調整可  — 現場の油種でVc/送り/寿命が変わる
   vcF: 切削速度係数 / fzF: 送り(1刃)係数 / 基準=水溶性(wet)
================================================================ */
const COOLANT = {
  wet: {name:'水溶性（エマルジョン）', vcF:1.00, fzF:1.00, desc:'汎用標準。冷却◎・潤滑中。高〜中速の万能。'},
  oil: {name:'油性（不水溶性切削油）', vcF:0.90, fzF:1.10, desc:'潤滑◎・冷却低。構成刃先/かじり抑制、仕上げ・難削材向き。高速は発煙注意。'},
  dry: {name:'乾式（エアブロー）',     vcF:0.85, fzF:0.95, desc:'冷却・潤滑なし。コーティング超硬の高速向き。鋼/SUSは要注意。'},
  mql: {name:'MQL（セミドライ）',      vcF:0.95, fzF:1.00, desc:'微量油＋エア。アルミ/鋳鉄に好適。環境配慮。'},
};
/* 被削材×工具×油種の相性補正（現場知見）。COOLANT基準にさらに乗算する。
   返り: {vcF,fzF,warn,name,desc} */
function coolantAdjust(coolKey, matKey, toolKey){
  const base = COOLANT[coolKey]||COOLANT.wet;
  let vcF=base.vcF, fzF=base.fzF, warn='';
  const nm = (MAT[matKey]&&MAT[matKey].name)||matKey;
  const coated = (toolKey==='altin'||toolKey==='altisiN'||toolKey==='coated'||toolKey==='diamond'||toolKey==='cermet'||toolKey==='cbn');
  const sticky = (matKey==='sus304'||matKey==='sus316'||matKey==='ti'||matKey==='ni');   // 溶着・加工硬化系
  const gummyAl = (matKey==='al'||matKey==='al7075'||matKey==='cu');                       // 溶着しやすい軟質
  const castiron = (matKey==='cast');
  if(coolKey==='dry'){
    if(sticky){ vcF*=0.92; fzF*=0.95; warn=`⚠ ${nm} の乾式は構成刃先・加工硬化・溶着のリスク大。水溶性か油性を強く推奨。`; }
    else if(coated && (matKey==='steel'||matKey==='steel_h'||matKey==='steel_hh'||matKey==='cast')){ vcF*=1.10; }
    else if(gummyAl){ vcF*=0.95; warn='アルミ/銅の乾式は切りくず溶着に注意。MQL推奨。'; }
  } else if(coolKey==='oil'){
    if(sticky){ fzF*=1.05; }                                  // 難削材で油性が効く
    if(castiron){ warn='鋳鉄は乾式/MQLが一般的。油性はスラッジに注意。'; }
  } else if(coolKey==='mql'){
    if(sticky){ warn='SUS/Ti/Niは冷却不足になりがち。水溶性/油性が無難。'; }
  } else if(coolKey==='wet'){
    if(castiron){ warn='鋳鉄の水溶性はスラッジ・錆に注意（乾式も可）。'; }
  }
  return {vcF, fzF, warn, name:base.name, desc:base.desc};
}

/* ================================================================
   【ap/ae → Vc/fz 連動モデル】 ★調整可  — 切込みが変われば速度・送りも変わる
================================================================ */
/* 径方向係合 ae/D → Vc係数（低係合=高速HSM、フルスロット=低速）。基準 ae/D=0.5 で 1.0 */
function aeVcFactor(ae, D){
  const r = Math.min(ae/Math.max(D,0.001), 1.0);
  return interp(r, [[0.05,1.55],[0.1,1.45],[0.2,1.30],[0.3,1.18],[0.5,1.00],[0.75,0.93],[1.0,0.85]]);
}
/* 軸方向 ap/D → Vc係数（深切込みは発熱増で微減）。基準 ap/D≈0.5 で 1.0 */
function apVcFactor(ap, D){
  const r = ap/Math.max(D,0.001);
  return interp(r, [[0,1.05],[0.5,1.00],[1.0,0.96],[2.0,0.90],[3.0,0.85],[5.0,0.78]]);
}
/* 径方向切りくず薄化(RCTF): ae<D/2 で実切削厚が薄くなり、同じ刃先負荷でも送りを増やせる。
   RCTF = 1/(2√(r(1−r)))、r=ae/D。ae≥D/2 は 1.0、上限2.5。 */
function chipThinning(ae, D){
  const r = Math.min(ae/Math.max(D,0.001), 1.0);
  if(r>=0.5) return 1.0;
  const v = 2*Math.sqrt(r*(1-r));
  return v>0 ? Math.min(1/v, 2.5) : 1.0;
}

/* ================================================================
   【ISCAR（イスカル）工具データ】 ★調整可
   実在グレード＋現行コート超硬の推奨切削速度(目安)。
   ※値はISCAR一般カタログ/ITA(ISCAR Tool Advisor)の代表レンジに基づく目安。
     実加工では必ず ISCAR ITA / 最新カタログで最終確認すること。
   iso: ISO適用分類(P鋼/M ステンレス/K鋳鉄/N非鉄/S 耐熱・チタン/H 硬材)
   op:  mill=ミーリング / turn=旋削 / both=両用 / drill=穴あけ
================================================================ */
const ISCAR_GRADES = {
  none:   {name:'メーカー指定なし（汎用式）', iso:'-',      op:'any',  line:'-',                 desc:'被削材×工具材質の汎用推奨式で計算（従来どおり）'},
  // ---- 旋削 ----
  IC8250: {name:'ISCAR IC8250', iso:'P',      op:'turn', line:'ISO-TURN（CVD）',     desc:'鋼旋削CVDコート。連続・高速切削向き'},
  IC6025: {name:'ISCAR IC6025', iso:'P/M',    op:'turn', line:'ISO-TURN（CVD）',     desc:'鋼〜ステンレス汎用CVD。靭性と耐摩耗のバランス'},
  IC907:  {name:'ISCAR IC907',  iso:'M/P/S',  op:'both', line:'ISO-TURN/HELItool（PVD）', desc:'万能PVD(TiAlN)。ステンレス・汎用の定番'},
  IC806:  {name:'ISCAR IC806',  iso:'S/M',    op:'both', line:'ISO-TURN（PVD）',     desc:'チタン・耐熱合金(HRSA)・ステンレス用'},
  // ---- ミーリング ----
  IC830:  {name:'ISCAR IC830',  iso:'P/M/K',  op:'mill', line:'HELIMILL/TANGMILL/HELIDO', desc:'万能ミーリング定番PVD(AlTiN)'},
  IC900:  {name:'ISCAR IC900',  iso:'M/S',    op:'mill', line:'HELIDO/HELIMILL',    desc:'ステンレス・耐熱合金ミーリング'},
  IC328:  {name:'ISCAR IC328',  iso:'N',      op:'mill', line:'HELIMILL/SOLIDMILL', desc:'アルミ・非鉄ミーリング'},
  // ---- 穴あけ ----
  IC908d: {name:'ISCAR IC908 (SUMOCHAM)', iso:'P/M/S', op:'drill', line:'SUMOCHAM/CHAMDRILL', desc:'交換ヘッドドリル。汎用〜ステンレス'},
};
/* ISCAR現行コート超硬の推奨切削速度 Vc[m/min]（荒加工基準の目安・ITA要確認） */
const ISCAR_VC = {
  mill: {al:400,al7075:350,steel:200,steel_h:140,steel_hh:60,sus304:120,sus316:100,cast:180,ti:55,ni:35,cu:300,cfrp:150},
  turn: {al:600,al7075:500,steel:280,steel_h:200,steel_hh:100,sus304:180,sus316:150,cast:250,ti:70,ni:40,cu:400,cfrp:120},
  drill:{al:120,al7075:110,steel:90, steel_h:65, steel_hh:30,sus304:55, sus316:48, cast:80, ti:25, ni:18, cu:100,cfrp:60},
};
/* 加工区分による速度補正（仕上げほど高速・軽負荷） */
const ISCAR_PROC = {rough:1.00, semi:1.20, finish:1.45};
/* ISCAR推奨Vc[m/min] を返す（op: mill/turn/drill, proc: rough/semi/finish） */
function iscarVcRec(matKey, op, proc){
  const tbl = ISCAR_VC[op] || ISCAR_VC.mill;
  const base = (tbl[matKey]!=null) ? tbl[matKey] : tbl.steel;
  return Math.round(base * (ISCAR_PROC[proc]||1.00));
}
/* 被削材×加工に推奨されるISCAR製品ライン(ガイダンス文) */
function iscarLineHint(matKey, op){
  if(op==='turn') return 'ISO-TURN（PCLNR/DCLNR等）。ステンレス/耐熱はIC907・IC806、鋼はIC8250/IC6025。溝入れはTANG-GRIP。';
  if(op==='drill') return 'SUMOCHAM（交換ヘッド）/ CHAMDRILL。中心まで超硬で高送り。深穴は内部給油必須。';
  // mill
  if(matKey==='sus304'||matKey==='sus316'||matKey==='ti'||matKey==='ni') return 'HELIDO/HELIMILL（IC900/IC806）。難削材は等高送り(トロコイド)＋低ae推奨。';
  if(matKey==='al'||matKey==='al7075'||matKey==='cu') return 'SOLIDMILL/HELIMILL（IC328）。高Vc・高送り、内部エア/MQL。';
  if(matKey==='cast') return 'HELIDO/FEEDMILL（K種）。乾式可。';
  return 'HELIMILL/TANGMILL/HELIDO（IC830）。肩削りはHELI2000、高送りはFEEDMILL/TANG-FIN。';
}

/* ================================================================
   バー・UI ヘルパー
================================================================ */
function drawBar(bid, pctId, pct) {
  const b=document.getElementById(bid), p=document.getElementById(pctId);
  if(!b||!p) return;
  const c=Math.min(Math.max(pct,0),120);
  b.style.width=Math.min(c,100)+'%';
  p.textContent=c.toFixed(0)+'%';
  b.style.background=c<40?'#22c55e':c<65?'#3b82f6':c<85?'#f97316':c<100?'#ef4444':'#7c3aed';
}

function setPhys(pre, items, verdTxt, status) {
  const panel=document.getElementById(pre+'_phys_panel');
  const grid=document.getElementById(pre+'_phys_grid');
  const verd=document.getElementById(pre+'_verdict');
  if(!panel) return;
  panel.className='phys-panel '+status;
  verd.className='verdict '+status;
  verd.textContent=verdTxt;
  grid.innerHTML=items.map(it=>`<div class="phys-item"><div class="p-lbl">${it.l}</div><div class="p-val">${it.v}</div></div>`).join('');
}

function setFeedField(id, val, status) {
  const el=document.getElementById(id);
  if(!el) return;
  el.value=(status==='ng')?'0 ← 加工不可':p4(val);
  el.className=status==='ok'?'f-ok':status==='warn'?'f-warn':'f-ng';
}

function setBtn(id, enabled) {
  const b=document.getElementById(id);
  if(!b) return;
  b.className='calc-btn '+(enabled?'enabled':'disabled-btn');
  b.disabled=!enabled;
}

function p4(v){return parseFloat(v.toFixed(4));}
function p2(v){return parseFloat(v.toFixed(2));}
function n(id){const v=parseFloat(document.getElementById(id).value);return isNaN(v)?0:v;}
function s(id){const el=document.getElementById(id);return el?el.value:'';}
function fmtT(sec){const m=Math.floor(sec/60),s2=Math.round(sec%60);return m>0?`${m}分${s2}秒`:`${s2}秒`;}

function getToolChips(toolKey) {
  const t=TOOL[toolKey];
  if(!t) return '';
  return `<div class="td-row">${t.chips.map(c=>`<span class="td-chip">${c}</span>`).join('')}</div>`;
}

/* ================================================================
   タブ切替
================================================================ */
function switchMain(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(e=>e.classList.remove('active'));
  const el=document.getElementById('tab_'+tab);
  if(el) el.classList.add('active');
  btn.classList.add('active');
}

/* ================================================================
   比較テーブルへの追加
================================================================ */
const compareData=[];
function addCompare(row){
  compareData.push(row);
  renderCompare();
}
function renderCompare(){
  const ct=document.getElementById('compare_table');
  if(!ct) return;
  if(compareData.length===0){ct.innerHTML='<p style="color:var(--txt3);font-size:12px">各タブで計算を実行してください</p>';return;}
  let h=`<table class="cmp-table"><tr><th>#</th><th>種別</th><th>材料</th><th>工具径D</th><th>Vc</th><th>S(rpm)</th><th>fz/f</th><th>F(mm/min)</th><th>Fc(N)</th><th>Pc(kW)</th><th>負荷%</th><th>MRR</th><th>工具寿命T</th><th>判定</th></tr>`;
  compareData.forEach((r,i)=>{
    h+=`<tr><td>${i+1}</td><td>${r.type}</td><td>${r.mat}</td><td>${r.D}mm</td>
    <td>${r.Vc}m/min</td><td>${r.S}rpm</td><td class="hi">${r.fz}mm</td><td class="hi">${r.F}mm/min</td>
    <td>${r.Fc}N</td><td>${r.Pc}kW</td>
    <td style="color:${r.load>80?'#fca5a5':r.load>60?'#fcd34d':'#86efac'}">${r.load}%</td>
    <td>${r.MRR}</td><td>${r.T}</td><td>${r.ok?'✅':'⚠'}</td></tr>`;
  });
  h+='</table>';
  ct.innerHTML=h;
}
/* 【機能 v4.1】比較表をCSVダウンロード（Excel用にBOM付き／ダブルクリック起動でも動作） */
function exportCompareCSV(){
  if(compareData.length===0){ alert('比較データがありません。各タブで計算を実行してください。'); return; }
  const head=['#','種別','材料','工具径D[mm]','Vc[m/min]','S[rpm]','fz_or_f[mm]','F[mm/min]','Fc[N]','Pc[kW]','負荷[%]','MRR','工具寿命T','判定'];
  const esc=v=>{ const s=String(v==null?'':v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const rows=compareData.map((r,i)=>[i+1,r.type,r.mat,r.D,r.Vc,r.S,r.fz,r.F,r.Fc,r.Pc,r.load,r.MRR,r.T,r.ok?'OK':'要注意'].map(esc).join(','));
  const csv='﻿'+head.join(',')+'\n'+rows.join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');
  const ts=new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
  a.href=URL.createObjectURL(blob); a.download='加工条件比較_'+ts+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
/* 比較表クリア */
function clearCompare(){ compareData.length=0; renderCompare(); }

/* ================================================================
   Taylor SVGプロット
================================================================ */
function drawTaylor(svgId, Vc_curr, mat) {
  const svg=document.getElementById(svgId);
  if(!svg) return;
  const db=MAT[mat];
  const W=400, H=120;
  const vcMin=Vc_curr*0.5, vcMax=Vc_curr*2.0;
  const pts=[];
  for(let i=0;i<=20;i++){
    const vc=vcMin+(vcMax-vcMin)*i/20;
    const T=Math.pow(db.C_T/vc, db.n_T); // ★標準Taylor T=(C/Vc)^n_T (v4.2.1是正)
    pts.push([vc,T]);
  }
  const tMax=Math.max(...pts.map(p=>p[1]));
  const toX=vc=>(vc-vcMin)/(vcMax-vcMin)*(W-40)+20;
  const toY=t=>H-10-(t/tMax)*(H-20);
  const path=pts.map((p,i)=>(i===0?'M':'L')+toX(p[0]).toFixed(1)+','+toY(p[1]).toFixed(1)).join(' ');
  const Tcurr=taylorLife(Vc_curr,mat);
  const cx=toX(Vc_curr), cy=toY(Tcurr);
  svg.innerHTML=`
    <line x1="20" y1="${H-10}" x2="${W-10}" y2="${H-10}" stroke="#334155" stroke-width="1"/>
    <line x1="20" y1="5" x2="20" y2="${H-10}" stroke="#334155" stroke-width="1"/>
    <path d="${path}" fill="none" stroke="#7c3aed" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#ffd700" stroke="#fff" stroke-width="1.5"/>
    <text x="${cx+7}" y="${cy-4}" font-size="9" fill="#ffd700">T=${Tcurr.toFixed(0)}min</text>
    <text x="22" y="${H-12}" font-size="8" fill="#64748b">Vc_low</text>
    <text x="${W-40}" y="${H-12}" font-size="8" fill="#64748b">Vc_high</text>
    <text x="${cx-12}" y="${H-2}" font-size="8" fill="#ffd700">現在Vc</text>`;
}
