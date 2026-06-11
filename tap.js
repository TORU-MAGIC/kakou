'use strict';
/* ============================================================
   tap.js — タップ加工（ねじ規格DB / トルク / 下穴 / 同期送り）
   依存: core.js
   ============================================================ */


/* ================================================================
   ☆ タップ加工 データベース・計算
================================================================ */

/* ねじ規格データベース
   D=公称(基準)径[mm], P=ピッチ[mm], cat=分類, name=表示名
   drill=規格指定下穴径[mm](管用ねじのみ), taper=テーパねじフラグ
   cat: 'M'=メートル並目 'Mf'=メートル細目 'UNC'/'UNF'=ユニファイ
        'G'=管用平行(JIS B 0202) 'Rc'=管用テーパ(JIS B 0203)
   angle: ねじ山角(60°=メートル/ユニファイ, 55°=管用ウィットワース) */
const THREADS = {
  // ===== メートル並目 (JIS B 0205 / ISO 261) =====
  'M1_0.25':{D:1.0,P:0.25,cat:'M',angle:60,name:'M1 × P0.25'},
  'M1.2_0.25':{D:1.2,P:0.25,cat:'M',angle:60,name:'M1.2 × P0.25'},
  'M1.4_0.3':{D:1.4,P:0.3,cat:'M',angle:60,name:'M1.4 × P0.3'},
  'M1.6_0.35':{D:1.6,P:0.35,cat:'M',angle:60,name:'M1.6 × P0.35'},
  'M2_0.4':{D:2.0,P:0.4,cat:'M',angle:60,name:'M2 × P0.4'},
  'M2.5_0.45':{D:2.5,P:0.45,cat:'M',angle:60,name:'M2.5 × P0.45'},
  'M3_0.5':{D:3.0,P:0.5,cat:'M',angle:60,name:'M3 × P0.5'},
  'M3.5_0.6':{D:3.5,P:0.6,cat:'M',angle:60,name:'M3.5 × P0.6'},
  'M4_0.7':{D:4.0,P:0.7,cat:'M',angle:60,name:'M4 × P0.7'},
  'M5_0.8':{D:5.0,P:0.8,cat:'M',angle:60,name:'M5 × P0.8'},
  'M6_1.0':{D:6.0,P:1.0,cat:'M',angle:60,name:'M6 × P1.0'},
  'M7_1.0':{D:7.0,P:1.0,cat:'M',angle:60,name:'M7 × P1.0'},
  'M8_1.25':{D:8.0,P:1.25,cat:'M',angle:60,name:'M8 × P1.25'},
  'M10_1.5':{D:10.0,P:1.5,cat:'M',angle:60,name:'M10 × P1.5'},
  'M12_1.75':{D:12.0,P:1.75,cat:'M',angle:60,name:'M12 × P1.75'},
  'M14_2.0':{D:14.0,P:2.0,cat:'M',angle:60,name:'M14 × P2.0'},
  'M16_2.0':{D:16.0,P:2.0,cat:'M',angle:60,name:'M16 × P2.0'},
  'M18_2.5':{D:18.0,P:2.5,cat:'M',angle:60,name:'M18 × P2.5'},
  'M20_2.5':{D:20.0,P:2.5,cat:'M',angle:60,name:'M20 × P2.5'},
  'M22_2.5':{D:22.0,P:2.5,cat:'M',angle:60,name:'M22 × P2.5'},
  'M24_3.0':{D:24.0,P:3.0,cat:'M',angle:60,name:'M24 × P3.0'},
  'M27_3.0':{D:27.0,P:3.0,cat:'M',angle:60,name:'M27 × P3.0'},
  'M30_3.5':{D:30.0,P:3.5,cat:'M',angle:60,name:'M30 × P3.5'},
  'M33_3.5':{D:33.0,P:3.5,cat:'M',angle:60,name:'M33 × P3.5'},
  'M36_4.0':{D:36.0,P:4.0,cat:'M',angle:60,name:'M36 × P4.0'},
  'M39_4.0':{D:39.0,P:4.0,cat:'M',angle:60,name:'M39 × P4.0'},
  'M42_4.5':{D:42.0,P:4.5,cat:'M',angle:60,name:'M42 × P4.5'},
  'M45_4.5':{D:45.0,P:4.5,cat:'M',angle:60,name:'M45 × P4.5'},
  'M48_5.0':{D:48.0,P:5.0,cat:'M',angle:60,name:'M48 × P5.0'},
  'M52_5.0':{D:52.0,P:5.0,cat:'M',angle:60,name:'M52 × P5.0'},
  'M56_5.5':{D:56.0,P:5.5,cat:'M',angle:60,name:'M56 × P5.5'},
  'M60_5.5':{D:60.0,P:5.5,cat:'M',angle:60,name:'M60 × P5.5'},
  'M64_6.0':{D:64.0,P:6.0,cat:'M',angle:60,name:'M64 × P6.0'},
  'M68_6.0':{D:68.0,P:6.0,cat:'M',angle:60,name:'M68 × P6.0'},
  // ===== メートル細目 (JIS B 0207 / ISO 261 fine) =====
  'M4_0.5f':{D:4.0,P:0.5,cat:'Mf',angle:60,name:'M4 × P0.5 (細目)'},
  'M5_0.5f':{D:5.0,P:0.5,cat:'Mf',angle:60,name:'M5 × P0.5 (細目)'},
  'M6_0.75f':{D:6.0,P:0.75,cat:'Mf',angle:60,name:'M6 × P0.75 (細目)'},
  'M8_1.0f':{D:8.0,P:1.0,cat:'Mf',angle:60,name:'M8 × P1.0 (細目)'},
  'M8_0.75f':{D:8.0,P:0.75,cat:'Mf',angle:60,name:'M8 × P0.75 (細目)'},
  'M10_1.25f':{D:10.0,P:1.25,cat:'Mf',angle:60,name:'M10 × P1.25 (細目)'},
  'M10_1.0f':{D:10.0,P:1.0,cat:'Mf',angle:60,name:'M10 × P1.0 (細目)'},
  'M12_1.5f':{D:12.0,P:1.5,cat:'Mf',angle:60,name:'M12 × P1.5 (細目)'},
  'M12_1.25f':{D:12.0,P:1.25,cat:'Mf',angle:60,name:'M12 × P1.25 (細目)'},
  'M14_1.5f':{D:14.0,P:1.5,cat:'Mf',angle:60,name:'M14 × P1.5 (細目)'},
  'M16_1.5f':{D:16.0,P:1.5,cat:'Mf',angle:60,name:'M16 × P1.5 (細目)'},
  'M18_1.5f':{D:18.0,P:1.5,cat:'Mf',angle:60,name:'M18 × P1.5 (細目)'},
  'M20_1.5f':{D:20.0,P:1.5,cat:'Mf',angle:60,name:'M20 × P1.5 (細目)'},
  'M22_1.5f':{D:22.0,P:1.5,cat:'Mf',angle:60,name:'M22 × P1.5 (細目)'},
  'M24_2.0f':{D:24.0,P:2.0,cat:'Mf',angle:60,name:'M24 × P2.0 (細目)'},
  'M27_2.0f':{D:27.0,P:2.0,cat:'Mf',angle:60,name:'M27 × P2.0 (細目)'},
  'M30_2.0f':{D:30.0,P:2.0,cat:'Mf',angle:60,name:'M30 × P2.0 (細目)'},
  'M33_2.0f':{D:33.0,P:2.0,cat:'Mf',angle:60,name:'M33 × P2.0 (細目)'},
  'M36_3.0f':{D:36.0,P:3.0,cat:'Mf',angle:60,name:'M36 × P3.0 (細目)'},
  // ===== ユニファイ並目 UNC (JIS B 0206 / ASME B1.1) =====
  'UNC_4':{D:2.845,P:0.635,cat:'UNC',angle:60,name:'No.4-40 UNC'},
  'UNC_6':{D:3.505,P:0.7938,cat:'UNC',angle:60,name:'No.6-32 UNC'},
  'UNC_8':{D:4.166,P:0.7938,cat:'UNC',angle:60,name:'No.8-32 UNC'},
  'UNC_10':{D:4.826,P:1.0583,cat:'UNC',angle:60,name:'No.10-24 UNC'},
  'UNC_1/4':{D:6.350,P:1.270,cat:'UNC',angle:60,name:'1/4-20 UNC'},
  'UNC_5/16':{D:7.938,P:1.4111,cat:'UNC',angle:60,name:'5/16-18 UNC'},
  'UNC_3/8':{D:9.525,P:1.5875,cat:'UNC',angle:60,name:'3/8-16 UNC'},
  'UNC_7/16':{D:11.113,P:1.8143,cat:'UNC',angle:60,name:'7/16-14 UNC'},
  'UNC_1/2':{D:12.700,P:1.9538,cat:'UNC',angle:60,name:'1/2-13 UNC'},
  'UNC_5/8':{D:15.875,P:2.3091,cat:'UNC',angle:60,name:'5/8-11 UNC'},
  'UNC_3/4':{D:19.050,P:2.5400,cat:'UNC',angle:60,name:'3/4-10 UNC'},
  'UNC_1':{D:25.400,P:3.1750,cat:'UNC',angle:60,name:'1"-8 UNC'},
  // ===== ユニファイ細目 UNF (JIS B 0208 / ASME B1.1) =====
  'UNF_6':{D:3.505,P:0.6350,cat:'UNF',angle:60,name:'No.6-40 UNF'},
  'UNF_8':{D:4.166,P:0.7056,cat:'UNF',angle:60,name:'No.8-36 UNF'},
  'UNF_10':{D:4.826,P:0.7938,cat:'UNF',angle:60,name:'No.10-32 UNF'},
  'UNF_1/4':{D:6.350,P:0.9071,cat:'UNF',angle:60,name:'1/4-28 UNF'},
  'UNF_5/16':{D:7.938,P:1.0583,cat:'UNF',angle:60,name:'5/16-24 UNF'},
  'UNF_3/8':{D:9.525,P:1.0583,cat:'UNF',angle:60,name:'3/8-24 UNF'},
  'UNF_7/16':{D:11.113,P:1.2700,cat:'UNF',angle:60,name:'7/16-20 UNF'},
  'UNF_1/2':{D:12.700,P:1.2700,cat:'UNF',angle:60,name:'1/2-20 UNF'},
  'UNF_5/8':{D:15.875,P:1.4111,cat:'UNF',angle:60,name:'5/8-18 UNF'},
  'UNF_3/4':{D:19.050,P:1.5875,cat:'UNF',angle:60,name:'3/4-16 UNF'},
  // ===== 管用平行ねじ G / PF (JIS B 0202 / ISO 228, 55°ウィットワース) =====
  'G1/16':{D:7.723,P:0.9071,cat:'G',angle:55,drill:6.8,name:'G1/16 (管用平行)'},
  'G1/8':{D:9.728,P:0.9071,cat:'G',angle:55,drill:8.8,name:'G1/8 (管用平行)'},
  'G1/4':{D:13.157,P:1.3368,cat:'G',angle:55,drill:11.8,name:'G1/4 (管用平行)'},
  'G3/8':{D:16.662,P:1.3368,cat:'G',angle:55,drill:15.25,name:'G3/8 (管用平行)'},
  'G1/2':{D:20.955,P:1.8143,cat:'G',angle:55,drill:19.0,name:'G1/2 (管用平行)'},
  'G5/8':{D:22.911,P:1.8143,cat:'G',angle:55,drill:21.0,name:'G5/8 (管用平行)'},
  'G3/4':{D:26.441,P:1.8143,cat:'G',angle:55,drill:24.5,name:'G3/4 (管用平行)'},
  'G7/8':{D:30.201,P:1.8143,cat:'G',angle:55,drill:28.25,name:'G7/8 (管用平行)'},
  'G1':{D:33.249,P:2.3091,cat:'G',angle:55,drill:30.75,name:'G1 (管用平行)'},
  'G1.1/4':{D:41.910,P:2.3091,cat:'G',angle:55,drill:39.5,name:'G1.1/4 (管用平行)'},
  'G1.1/2':{D:47.803,P:2.3091,cat:'G',angle:55,drill:45.5,name:'G1.1/2 (管用平行)'},
  'G2':{D:59.614,P:2.3091,cat:'G',angle:55,drill:57.5,name:'G2 (管用平行)'},
  'G2.1/2':{D:75.184,P:2.3091,cat:'G',angle:55,drill:73.0,name:'G2.1/2 (管用平行)'},
  'G3':{D:87.884,P:2.3091,cat:'G',angle:55,drill:85.5,name:'G3 (管用平行)'},
  // ===== 管用テーパねじ Rc / PT (JIS B 0203, 55°ウィットワース・テーパ1/16) =====
  'Rc1/16':{D:7.723,P:0.9071,cat:'Rc',angle:55,drill:6.8,taper:true,name:'Rc1/16 (管用テーパ)'},
  'Rc1/8':{D:9.728,P:0.9071,cat:'Rc',angle:55,drill:8.4,taper:true,name:'Rc1/8 (管用テーパ)'},
  'Rc1/4':{D:13.157,P:1.3368,cat:'Rc',angle:55,drill:11.2,taper:true,name:'Rc1/4 (管用テーパ)'},
  'Rc3/8':{D:16.662,P:1.3368,cat:'Rc',angle:55,drill:14.75,taper:true,name:'Rc3/8 (管用テーパ)'},
  'Rc1/2':{D:20.955,P:1.8143,cat:'Rc',angle:55,drill:18.25,taper:true,name:'Rc1/2 (管用テーパ)'},
  'Rc3/4':{D:26.441,P:1.8143,cat:'Rc',angle:55,drill:23.75,taper:true,name:'Rc3/4 (管用テーパ)'},
  'Rc1':{D:33.249,P:2.3091,cat:'Rc',angle:55,drill:30.0,taper:true,name:'Rc1 (管用テーパ)'},
  'Rc1.1/4':{D:41.910,P:2.3091,cat:'Rc',angle:55,drill:38.75,taper:true,name:'Rc1.1/4 (管用テーパ)'},
  'Rc1.1/2':{D:47.803,P:2.3091,cat:'Rc',angle:55,drill:44.5,taper:true,name:'Rc1.1/2 (管用テーパ)'},
  'Rc2':{D:59.614,P:2.3091,cat:'Rc',angle:55,drill:56.0,taper:true,name:'Rc2 (管用テーパ)'},
  'Rc2.1/2':{D:75.184,P:2.3091,cat:'Rc',angle:55,drill:72.0,taper:true,name:'Rc2.1/2 (管用テーパ)'},
  'Rc3':{D:87.884,P:2.3091,cat:'Rc',angle:55,drill:84.5,taper:true,name:'Rc3 (管用テーパ)'},
};
/* 旧名互換 */
const METRIC_THREADS = THREADS;
/* 分類グループ表示名 (プルダウンoptgroup用) */
const THREAD_GROUPS = {
  M:'メートル並目ねじ (M)', Mf:'メートル細目ねじ (M×細目)',
  UNC:'ユニファイ並目ねじ (UNC)', UNF:'ユニファイ細目ねじ (UNF)',
  G:'管用平行ねじ (G / PF)', Rc:'管用テーパねじ (Rc / PT) ★',
};

/* タップ工具材質 (tau_allow: せん断許容応力[MPa]) */
const TAP_TOOL = {
  hss:    {name:'HSS',              tau:300, vcF:1.00, desc:'汎用。靭性高。M1〜M68対応。非鉄〜鋼向き。'},
  cobalt: {name:'コバルトハイス',    tau:360, vcF:1.30, desc:'耐熱650℃。SUS・Ti・Inconel有効。靭性◎。'},
  carbide:{name:'超硬ソリッド',      tau:280, vcF:2.00, desc:'高速加工。脆性あり。Al・鋳鉄・鋼向き。'},
  coated: {name:'AlTiNコーティング超硬',tau:270,vcF:2.80,desc:'最高速度域。SUS・鋼長寿命。M3以上推奨。'},
};

/* タップ加工材料データ (Km: トルク係数, Vc推奨範囲[m/min]) */
const TAP_MAT = {
  al:     {Km:0.50,VcL:15,VcH:25,VcLc:40,VcHc:60,name:'アルミ合金'},
  al7075: {Km:0.55,VcL:12,VcH:22,VcLc:35,VcHc:55,name:'A7075'},
  steel:  {Km:1.00,VcL:8, VcH:14,VcLc:15,VcHc:25,name:'S45C/SS400'},
  steel_h:{Km:1.30,VcL:6, VcH:10,VcLc:12,VcHc:20,name:'SCM440 HRC30'},
  steel_hh:{Km:2.00,VcL:3,VcH:6, VcLc:8, VcHc:14,name:'SKD11 HRC55'},
  sus304: {Km:1.60,VcL:5, VcH:8, VcLc:10,VcHc:18,name:'SUS304'},
  sus316: {Km:1.70,VcL:4, VcH:7, VcLc:9, VcHc:16,name:'SUS316L'},
  cast:   {Km:0.60,VcL:10,VcH:18,VcLc:20,VcHc:35,name:'鋳鉄 FC250'},
  ti:     {Km:2.00,VcL:4, VcH:7, VcLc:8, VcHc:12,name:'Ti-6Al-4V'},
  ni:     {Km:2.80,VcL:2, VcH:4, VcLc:5, VcHc:8, name:'Inconel 718'},
  cu:     {Km:0.45,VcL:20,VcH:35,VcLc:50,VcHc:80,name:'銅合金 C3604'},
};

/* タップ種別係数
   Ct: トルク係数 / vcF: 切削速度補正 / forCat: 推奨ねじ分類 */
const TAP_TYPE = {
  spiral:    {Ct:1.00,vcF:1.00,name:'スパイラルタップ',   desc:'止まり穴標準。切りくずを上方排出。靭性必要。'},
  point:     {Ct:0.85,vcF:1.15,name:'ポイントタップ',     desc:'貫通穴標準。切りくずを前方押出し。高速向き。'},
  str:       {Ct:1.10,vcF:0.80,name:'ストレートフルート', desc:'精密加工用。切りくず管理が必要。低速推奨。'},
  form:      {Ct:0.70,vcF:1.10,name:'盛上げタップ',       desc:'切りくずゼロ。止まり穴最適。下穴径やや大。'},
  pipe_str:  {Ct:1.25,vcF:0.75,name:'管用平行タップ(ストレート)', desc:'管用平行ねじG用。長いねじ部を一度に切削。低速・潤滑重視。'},
  pipe_sp:   {Ct:1.10,vcF:0.85,name:'管用平行タップ(スパイラル)', desc:'管用平行ねじG用。止まり穴・切りくず排出性◎。'},
  pipe_taper:{Ct:1.55,vcF:0.60,name:'管用テーパタップ',   desc:'管用テーパねじRc専用。全刃が漸進的に全山切削→トルク大。極低速・高潤滑必須。'},
};

/* クーラント補正係数 */
const TAP_COOL = {
  ext: {fC:1.00,desc:'外部クーラント（標準）'},
  dry: {fC:1.30,desc:'ドライ/エアーブロー（トルク+30%）'},
  tsc: {fC:0.80,desc:'内部高圧クーラント（トルク-20%）'},
  mql: {fC:0.90,desc:'MQL最小量潤滑（トルク-10%）'},
};

/* タップコア径 [mm] (ねじ谷径相当 = タップ心厚の目安)
   60°ねじ(M/UN): dc = D - 1.2269×P  (ISO 724 d3式)
   55°ねじ(G/Rc): dc = D - 1.281×P   (ウィットワース全山深さ 0.6403P×2) */
function tapCoreDia(D, P, angle){
  const k = (angle===55) ? 1.281 : 1.2269;
  return D - k*P;
}

/* タップ許容トルク Ta [N·m] (材料力学: 中実円形断面のねじり)
   ※これは「実際に折れる破断トルク」ではなく、せん断許容応力τ_allow(=安全率込み)と
     谷径相当コア径dcから求めた “許容作業トルク” の保守値。
     実破断トルクはこの約3〜5倍。判定はこの保守値基準＝安全側に出る。
   T = τ_allow × (π × dc³/16) [N·mm] → /1000 → [N·m] */
function tapBreakTorque(D, P, toolKey, angle){
  const tl = TAP_TOOL[toolKey]||TAP_TOOL.hss;
  const dc = tapCoreDia(D, P, angle);
  if(dc<=0) return 0;
  return tl.tau * Math.PI * Math.pow(dc,3) / 16 / 1000;
}

/* ねじ係合率 [%] — 60°ねじ(M/UNC/UNF)の標準式  %thread = 76.98×(D−d_hole)/P
   ★JISタップドリル表と整合 (例 M6×1.0, 下穴5.0mm → 約77%)。
     係合率の目安: 100%=完全(下穴小・高トルク) / 75%≒標準 / 60〜65%=量産推奨(低トルク・タップ長寿命) */
function threadEngagement(D, d_hole, P){
  return 76.98 * (D - d_hole) / P;
}

/* タッピングトルク [N·m]  (経験式・安全側の目安)
   Tm = 0.035 × Ct × Km × D^2.2 × P^0.8 × fC × taperF
   taperF: 管用テーパねじは全刃が漸進的に全山切削するため割増 */
function tapTorque(D, P, typeKey, matKey, coolKey, isTaper){
  const tt = TAP_TYPE[typeKey]||TAP_TYPE.spiral;
  const tm = TAP_MAT[matKey]||TAP_MAT.steel;
  const tc = TAP_COOL[coolKey]||TAP_COOL.ext;
  const taperF = isTaper ? 1.30 : 1.0;
  return 0.035 * tt.Ct * tm.Km * Math.pow(D,2.2) * Math.pow(P,0.8) * tc.fC * taperF;
}

/* 推奨Vc [m/min] — タップ種別vcF・ねじ分類補正込み */
function tapVcRec(matKey, toolKey, typeKey, cat){
  const tm = TAP_MAT[matKey]||TAP_MAT.steel;
  const isCoated = (toolKey==='coated'||toolKey==='carbide');
  const toolF = TAP_TOOL[toolKey]?TAP_TOOL[toolKey].vcF:1.0;
  const typeF = TAP_TYPE[typeKey]?TAP_TYPE[typeKey].vcF:1.0;
  // 管用ねじ分類補正: テーパは特に低速
  const catF = cat==='Rc'?0.55 : cat==='G'?0.75 : 1.0;
  let lo,hi;
  if(isCoated){ lo=tm.VcLc; hi=tm.VcHc; }
  else        { lo=tm.VcL*toolF; hi=tm.VcH*toolF; }
  lo *= typeF*catF; hi *= typeF*catF;
  return {lo:Math.max(1,Math.round(lo)), hi:Math.max(2,Math.round(hi)), rec:Math.max(1,Math.round((lo+hi)/2))};
}

/* 下穴径推奨 [mm]
   方針: 下穴が大きい → ねじ係合率↓ → タッピングトルク↓ → タップ折損リスク大幅減。
         実用上ねじ係合率60〜80%で強度は十分なため、安全側=大きい径を優先する。
         ただし管用ねじ(G/Rc)はゲージ管理・シール性が絡むため、登録済みの基準下穴径を固定表示する。
   返り値: lo=許容下限(=標準/最小径) rec=推奨(やや大きめ) hi=許容上限(最大径・最も安全)
           tight=強度最優先時のみ可(下限以下) fixed=管用規格指定ドリルか
   ※量産・シール用途・特殊タップでは必ず使用タップメーカー表とねじゲージで最終確認する。 */
function tapPilotDia(D, P, typeKey, th){
  // --- 管用ねじ(G/Rc): 登録済みの基準ストレートドリル径を固定表示 ---
  if(th && th.drill){
    const d = th.drill;
    return {
      lo:  p2(d),
      rec: p2(d),
      hi:  p2(d),
      tight: p2(d),
      fixed:true,
      note: th.taper
        ? '管用テーパねじは基準下穴径を固定表示。下穴を大きくすると有効山高さ・ゲージ位置・シール性不足の恐れがあるため、使用タップメーカー表と管用テーパねじゲージで確認'
        : '管用平行ねじは基準下穴径を固定表示。シール方式(ガスケット/Oリング等)と使用タップメーカー表で確認'
    };
  }
  // --- 盛上げ(転造)タップ: 切りくずなし。下穴 ≒ D-0.45P (メーカー表確認必須) ---
  if(typeKey==='form'){
    return {
      lo:  p2(D - 0.55*P),
      rec: p2(D - 0.45*P),        // 転造タップメーカー推奨域
      hi:  p2(D - 0.35*P),        // 許容上限(最大)
      tight: p2(D - 0.62*P),
      fixed:false,
      note:'盛上げ(転造)タップ。許容範囲を大きい径側に設定 — かじり・過大トルクを防止。実値は使用タップメーカー表で確認'
    };
  }
  // --- 切削タップ(M並目/細目・UNC/UNF): 標準 D-P。許容範囲を大きい径側へ ---
  return {
    lo:  p2(D - 1.00*P),          // 標準 D-P (約78%係合) = 許容下限
    rec: p2(D - 0.90*P),          // 推奨(やや大きめ・約70%係合)
    hi:  p2(D - 0.75*P),          // 許容上限(最大・約58%係合・タップ最保護)
    tight: p2(D - 1.08*P),        // 強度最優先時のみ(約85%係合)
    fixed:false,
    note:'切削タップ。標準的な下穴目安=D-P。許容範囲を大きい径側に設定 — タップ折損リスク低減を優先 (係合率60〜80%で実用強度十分)'
  };
}

function refreshTap(){
  const tkey = s('tap_thread')||'M6_1.0';
  const th = THREADS[tkey]||{D:6,P:1.0,cat:'M',angle:60,name:tkey};
  const D=th.D, P=th.P, cat=th.cat||'M', isTaper=!!th.taper, isPipe=(cat==='G'||cat==='Rc');
  const typeKey=s('tap_type')||'spiral';
  const toolKey=s('tap_tool')||'hss';
  const matKey=s('tap_mat')||'steel';
  const coolKey=s('tap_cool')||'ext';
  const nmax=n('tap_nmax')||6000;
  const tt=TAP_TYPE[typeKey], tl=TAP_TOOL[toolKey];
  const tm=TAP_MAT[matKey]||TAP_MAT.steel, tc=TAP_COOL[coolKey];

  document.getElementById('tap_tool_desc').innerHTML=
    `<b>${tl.name}</b>: ${tl.desc}<br><b>${tt.name}</b>: ${tt.desc}`
    +`<br><b>ねじ規格:</b> ${th.name} — ${THREAD_GROUPS[cat]||cat} / ねじ山角${th.angle||60}°`
    +(isTaper?'<br><span style="color:#fca5a5">⚠ テーパねじ: 全刃が漸進的に全山を切削 → トルクが大きい。極低速・高潤滑で加工。</span>':'');
  document.getElementById('tap_P').value=P;

  // 推奨Vc・S・F (ねじ分類・タップ種別補正込み)
  const vcr=tapVcRec(matKey,toolKey,typeKey,cat);
  const Vc=vcr.rec;
  const S_theo=Math.round(Vc*1000/(Math.PI*D));
  const S=Math.min(S_theo,nmax);
  const Vc_act=Math.round(S*Math.PI*D/1000*10)/10;
  const F=Math.round(S*P*10)/10;

  document.getElementById('tap_Vc').value=Vc_act;
  document.getElementById('tap_S').value=S;
  document.getElementById('tap_F').value=F;

  // 下穴推奨 (許容範囲を大きい径側に設定)
  const pilot=tapPilotDia(D,P,typeKey,th);
  // ねじ係合率(%) — 60°切削タップ(M/UN)のみ算出。転造/管用ねじは概念が異なるため注記表示。
  const is60cut = (th.angle!==55) && typeKey!=='form';
  const engInfo = is60cut
    ? `<br><b>ねじ係合率(目安):</b> 下限${threadEngagement(D,pilot.lo,P).toFixed(0)}% ／ <span style="color:#ffd700">推奨${threadEngagement(D,pilot.rec,P).toFixed(0)}%</span> ／ 上限${threadEngagement(D,pilot.hi,P).toFixed(0)}% <span style="color:var(--txt3);font-size:10px">（75%≒標準・60〜65%=量産推奨でタップ長寿命）</span>`
    : (typeKey==='form'
        ? '<br><span style="color:var(--txt3);font-size:10px">※盛上げ(転造)ねじは塑性成形のため係合率の概念が切削ねじと異なる</span>'
        : '<br><span style="color:var(--txt3);font-size:10px">※管用ねじは規格指定ドリル径基準（係合率管理ではない）</span>');
  document.getElementById('tap_pilot_panel').innerHTML=
    `<b>${pilot.fixed?'基準下穴径':'推奨下穴径'}:</b> <span style="color:#ffd700;font-size:16px;font-weight:800">${pilot.rec} mm</span>
     <span style="color:var(--txt3);font-size:10px">（${pilot.fixed?'管用ねじは基準径固定・ゲージ確認':'やや大きめ・タップ保護優先'}）</span><br>
     <b>${pilot.fixed?'基準範囲':'許容範囲'}:</b> <span style="color:#86efac;font-weight:700;font-size:13px">${pilot.lo} 〜 ${pilot.hi} mm</span>
     <span style="color:var(--txt3);font-size:10px">（${pilot.fixed?'登録基準径。大きめ変更はメーカー表/ゲージ確認必須':'下限=標準 D-P ／ 上限=最大径・トルク最小案'}）</span><br>
     <span style="color:var(--txt3);font-size:10px">${pilot.note}</span><br>
     <span style="color:#fcd34d;font-size:10px">${pilot.fixed?'💡 管用ねじは下穴径より、正しいタップ種別・ねじ込み深さ・ゲージ管理を優先。':'💡 迷ったら大きい径を選択 — 下穴大→係合率↓→トルク↓→タップ折損リスク↓。強度を最優先する場合のみ '+pilot.tight+'mm まで縮小可。'}</span>${engInfo}
     ${isTaper?'<br><span style="color:#fcd34d;font-size:10px">⚠ テーパねじはストレートドリル下穴が標準。リーマ仕上げ不要。ねじゲージ(管用テーパ用)で深さ管理。</span>':''}
     ${typeKey==='form'?'<br><span style="color:#fcd34d;font-size:10px">⚠ 盛上げタップは切削タップより大きい下穴径。下穴が小さいとトルク急増・かじり発生。</span>':''}`;

  // トルク計算
  const Tm=tapTorque(D,P,typeKey,matKey,coolKey,isTaper);
  const Tb=tapBreakTorque(D,P,toolKey,th.angle);
  const torqRatio=Tb>0?Tm/Tb:999;
  const dc=tapCoreDia(D,P,th.angle);

  const items=[
    {l:cat==='Rc'||cat==='G'?'基準径 D':'公称径 D',v:D+' mm'},
    {l:'ピッチ P',v:P+' mm'},
    {l:'コア径 dc',v:dc.toFixed(3)+' mm'},
    {l:'推奨Vc',v:vcr.lo+'〜'+vcr.hi+' m/min'},
    {l:'回転数 S',v:S+(S>=nmax?' (上限制限)':'')+' rpm'},
    {l:'同期送り F',v:F+' mm/min'},
    {l:'タッピングTm(推定)',v:Tm.toFixed(2)+' N·m'},
    {l:'許容トルクTa(安全率込)',v:Tb.toFixed(2)+' N·m'},
    {l:'トルク比 Tm/Ta',v:(torqRatio*100).toFixed(0)+'%'},
    {l:pilot.fixed?'基準下穴径':'推奨下穴径',v:pilot.rec+' mm'},
    {l:pilot.fixed?'下穴基準範囲':'下穴許容範囲',v:pilot.lo+'〜'+pilot.hi+' mm'},
  ];
  let st,vt;
  if(torqRatio>1.0){st='crit';vt='🚫 タップ破断危険 — 条件変更必須';}
  else if(torqRatio>0.80){st='ng';vt='⚠ 破断リスク高 ('+( torqRatio*100).toFixed(0)+'%) — 速度低減・クーラント強化';}
  else if(torqRatio>0.60){st='warn';vt='⚠ 注意域 ('+( torqRatio*100).toFixed(0)+'%) — 慎重に加工';}
  else{st='ok';vt='✅ 安全 — トルク比'+(torqRatio*100).toFixed(0)+'% (許容トルクに'+(100-torqRatio*100).toFixed(0)+'%余裕)';}

  setPhys('tap',items,vt,st);
  drawBar('tap_bar_torq','tap_pct_torq',torqRatio*100);

  const Vc_pct=Math.round((Vc_act-vcr.lo)/((vcr.hi-vcr.lo)||1)*100);
  document.getElementById('tap_bar_vc').style.width=Math.max(5,Math.min(100,Vc_pct))+'%';
  document.getElementById('tap_pct_vc').textContent='適正域内';

  // ねじ分類とタップ種別の整合チェック
  let matchWarn='';
  if(cat==='Rc'&&typeKey!=='pipe_taper') matchWarn='<br><span style="color:#fca5a5">⚠ 管用テーパねじには「管用テーパタップ」を選択してください</span>';
  else if(cat==='G'&&typeKey!=='pipe_str'&&typeKey!=='pipe_sp') matchWarn='<br><span style="color:#fca5a5">⚠ 管用平行ねじには「管用平行タップ」を選択してください</span>';
  else if((typeKey==='pipe_taper'||typeKey==='pipe_str'||typeKey==='pipe_sp')&&!isPipe) matchWarn='<br><span style="color:#fca5a5">⚠ 管用タップは管用ねじ(G/Rc)に使用してください</span>';

  document.getElementById('tap_rec_body').innerHTML=`
<p style="font-size:11px;line-height:2.0;color:var(--txt2)">
<b>ねじ:</b> ${th.name} | <b>タップ:</b> ${tl.name} | <b>種別:</b> ${tt.name}<br>
<b>被削材:</b> ${tm.name} | <b>クーラント:</b> ${tc.desc}<br>
<b>推奨Vc範囲:</b> ${vcr.lo}〜${vcr.hi} m/min | <b>使用Vc:</b> ${Vc_act} m/min<br>
<b>Tm = 0.035×${tt.Ct}(Ct)×${tm.Km}(Km)×${D}^2.2×${P}^0.8×${tc.fC}(cool)${isTaper?'×1.30(テーパ)':''}</b><br>
<b>タッピングトルク Tm(推定):</b> <span style="color:#ffd700;font-weight:800">${Tm.toFixed(2)} N·m</span><br>
<b>許容トルク Ta(安全率込):</b> ${Tb.toFixed(2)} N·m &nbsp;→&nbsp; トルク比 Tm/Ta: <span style="color:${torqRatio<0.6?'#86efac':torqRatio<0.8?'#fcd34d':'#fca5a5'}">${(torqRatio*100).toFixed(0)}%</span><br>
<span style="color:var(--txt3);font-size:10px">※トルクは安全率込みの保守的推定値（実トルクは材料ロット・潤滑・下穴径で±40%程度ばらつく）。判定は折損を避ける安全側。</span>${matchWarn}
</p>`;
}

function calcTap(){
  const tkey=s('tap_thread')||'M6_1.0';
  const th=THREADS[tkey]||{D:6,P:1.0,cat:'M',angle:60,name:tkey};
  const D=th.D, P=th.P, cat=th.cat||'M', isTaper=!!th.taper, isPipe=(cat==='G'||cat==='Rc');
  const typeKey=s('tap_type')||'spiral';
  const toolKey=s('tap_tool')||'hss';
  const matKey=s('tap_mat')||'steel';
  const coolKey=s('tap_cool')||'ext';
  const holeType=s('tap_hole')||'through';
  const Le=n('tap_le')||12, depth=n('tap_depth')||20;
  const holes=parseInt(document.getElementById('tap_holes').value)||1;
  const modeKey=s('tap_mode')||'rigid';
  const nmax=n('tap_nmax')||6000;

  const tt=TAP_TYPE[typeKey], tl=TAP_TOOL[toolKey];
  const tm=TAP_MAT[matKey]||TAP_MAT.steel, tc=TAP_COOL[coolKey];

  const vcr=tapVcRec(matKey,toolKey,typeKey,cat);
  const Vc=vcr.rec;
  const S_theo=Math.round(Vc*1000/(Math.PI*D));
  const S=Math.min(S_theo,nmax);
  const Vc_act=Math.round(S*Math.PI*D/1000*10)/10;
  const F=Math.round(S*P*10)/10;

  const Tm=tapTorque(D,P,typeKey,matKey,coolKey,isTaper);
  const Tb=tapBreakTorque(D,P,toolKey,th.angle);
  const torqRatio=Tb>0?Tm/Tb:999;
  const dc=tapCoreDia(D,P,th.angle);
  const pilot=tapPilotDia(D,P,typeKey,th);
  // ねじ係合率(%) — 60°切削タップのみ算出（転造/管用は概念が異なるためnull）
  const engRec = (th.angle!==55 && typeKey!=='form') ? threadEngagement(D,pilot.rec,P) : null;

  // 加工時間 (往復 × 穴数)
  // 【整理 v4.1】工具Z移動量: 貫通=板厚(穴深さL) / 止まり=ねじ有効深さLe。
  //   旧版は逆(貫通でLe=過小, 止まりでdepth)だったため修正。※食付き(リード)分は安全側で無視。
  const cutting_depth = (holeType==='through') ? depth : Le;
  const t1_down = cutting_depth/F*60; // 秒
  const t1_up = cutting_depth/F*60;   // 逆転引き抜き
  const t1 = t1_down + t1_up;
  const tTotal = t1 * holes;

  const ok = torqRatio<=0.80;
  document.getElementById('tap_rh').className=`result-header ${ok?'ok-res':torqRatio>1.0?'ng-res':'warn-res'}`;
  document.getElementById('tap_rg').innerHTML=`
    <div class="res-item res-hl"><div class="res-lbl">🔴 主軸回転数 S</div><div class="res-val">${S} rpm</div></div>
    <div class="res-item res-hl"><div class="res-lbl">🏆 同期送り F (= S × P)</div><div class="res-val">${F} mm/min</div></div>
    <div class="res-item"><div class="res-lbl">使用切削速度 Vc</div><div class="res-val">${Vc_act} m/min</div></div>
    <div class="res-item"><div class="res-lbl">推奨Vc範囲</div><div class="res-val">${vcr.lo}〜${vcr.hi} m/min</div></div>
    <div class="res-item"><div class="res-lbl">ピッチ P</div><div class="res-val">${P} mm</div></div>
    <div class="res-item"><div class="res-lbl">コア径 dc</div><div class="res-val">${dc.toFixed(3)} mm</div></div>
    <div class="res-item"><div class="res-lbl">タッピングトルク Tm(推定)</div><div class="res-val">${Tm.toFixed(2)} N·m</div></div>
    <div class="res-item"><div class="res-lbl">許容トルク Ta(安全率込)</div><div class="res-val">${Tb.toFixed(2)} N·m</div></div>
    <div class="res-item"><div class="res-lbl">トルク比 Tm/Ta</div><div class="res-val" style="color:${torqRatio<0.6?'#86efac':torqRatio<0.8?'#fcd34d':'#fca5a5'}">${(torqRatio*100).toFixed(0)}%</div></div>
    <div class="res-item res-hl"><div class="res-lbl">🔩 ${pilot.fixed?'基準下穴径（管用・ゲージ確認）':'推奨下穴径（やや大きめ・タップ保護）'}</div><div class="res-val">${pilot.rec} mm</div></div>
    ${engRec!==null?`<div class="res-item"><div class="res-lbl">ねじ係合率（推奨下穴）</div><div class="res-val">${engRec.toFixed(0)} %</div></div>`:''}
    <div class="res-item res-hl"><div class="res-lbl">下穴 ${pilot.fixed?'基準範囲':'許容範囲（下限〜上限）'}</div><div class="res-val">${pilot.lo} 〜 ${pilot.hi} mm</div></div>
    ${pilot.fixed?'':`<div class="res-item"><div class="res-lbl">強度最優先時のみ（下限以下）</div><div class="res-val">${pilot.tight} mm</div></div>`}
    <div class="res-item"><div class="res-lbl">1穴加工時間</div><div class="res-val">${fmtT(t1)}</div></div>
    <div class="res-item res-hl"><div class="res-lbl">総加工時間 (${holes}穴)</div><div class="res-val">${fmtT(tTotal)}</div></div>`;

  const wc=document.getElementById('tap_warns'); wc.innerHTML='';
  if(torqRatio>1.0) wc.innerHTML+='<div class="info-box ib-red"><h3>🚫 タップ破断危険</h3><p>現在の条件ではタップが折れます。材質変更(コバルト/超硬)・クーラント強化(TSC)・速度低減・または下穴径を大きくしてください。</p></div>';
  else if(torqRatio>0.80) wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ 高破断リスク</h3><p>安全率が低すぎます。速度を20%以上落とすか、クーラントをTSCに変更してください。</p></div>';
  if(S>=nmax) wc.innerHTML+=`<div class="info-box ib-blue"><h3>💡 主軸上限制限</h3><p>推奨速度を達成できません。実際のVc=${Vc_act} m/minで計算しています。</p></div>`;
  if(isTaper){
    wc.innerHTML+=`<div class="info-box ib-purple"><h3>🔻 管用テーパねじ (${th.name})</h3><p>テーパ比1/16(片角約1.79°)。全刃が漸進的に全山を切削するためトルクが標準ねじの約1.3倍。<b>極低速・高潤滑(切削油たっぷり)・剛性タップ推奨</b>。ねじ込み量はねじゲージ(管用テーパねじ用)で管理し、基準径位置を出すこと。シール用途のためテフロンシール材併用が一般的。</p></div>`;
    if(coolKey==='dry') wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ テーパタップ × ドライ</h3><p>テーパタップのドライ加工は焼付き・破断のリスク大。必ず切削油または内部給油を使用してください。</p></div>';
  }
  if(cat==='G') wc.innerHTML+=`<div class="info-box ib-blue"><h3>🔧 管用平行ねじ (${th.name})</h3><p>ねじ部が長く一度に多くの刃が係合するためトルク高め。低速・潤滑重視。シールは平行ねじのためガスケット/Oリングで行う(ねじ自体は密封しない)。</p></div>`;
  if(holeType==='blind') wc.innerHTML+=`<div class="info-box ib-yellow"><h3>⚠ 止まり穴 — 追い抜き注意</h3><p>穴底から最低 ${(2*P).toFixed(2)}mm (= 2P) の逃げ深さを確保してください。スパイラルタップ使用推奨。</p></div>`;
  if(modeKey==='rigid') wc.innerHTML+='<div class="info-box ib-green"><h3>✅ 剛性タッピング</h3><p>送り速度 F = S × P = <b>'+F+' mm/min</b> を機械に正確に設定してください。NCプログラムでG84サイクル（剛性タップ）を使用。</p></div>';
  if(typeKey==='form'&&(matKey==='ti'||matKey==='ni')) wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ 盛上げタップ × 難削材</h3><p>Ti/Inconelへの盛上げタップは切削抵抗が極めて高く推奨しません。切削タップ(スパイラル)に変更してください。</p></div>';
  if(cat==='Rc'&&typeKey!=='pipe_taper') wc.innerHTML+='<div class="info-box ib-yellow"><h3>⚠ タップ種別の不一致</h3><p>管用テーパねじには「管用テーパタップ」を選択してください。トルク計算が正しく行われません。</p></div>';
  else if(cat==='G'&&typeKey!=='pipe_str'&&typeKey!=='pipe_sp') wc.innerHTML+='<div class="info-box ib-yellow"><h3>⚠ タップ種別の不一致</h3><p>管用平行ねじには「管用平行タップ(ストレート/スパイラル)」を選択してください。</p></div>';
  else if((typeKey==='pipe_taper'||typeKey==='pipe_str'||typeKey==='pipe_sp')&&!isPipe) wc.innerHTML+='<div class="info-box ib-yellow"><h3>⚠ タップ種別の不一致</h3><p>管用タップは管用ねじ(G/Rc)専用です。メートル/ユニファイねじには使用しないでください。</p></div>';

  const angK = th.angle===55?1.281:1.2269;
  document.getElementById('tap_fml').textContent=
`【タップ加工 学術物理計算ログ】
ねじ規格: ${th.name} (${THREAD_GROUPS[cat]||cat}, ねじ山角${th.angle||60}°${isTaper?', テーパ1/16':''})
タップ: ${tl.name} | 種別: ${tt.name} | 被削材: ${tm.name} | クーラント: ${tc.desc}

▼ Step1: 推奨切削速度 Vc (ねじ分類・タップ種別補正込み)
  Vc_range = ${vcr.lo}〜${vcr.hi} m/min | 採用Vc(中央値) = ${Vc} m/min
  ${isPipe?`※ 管用ねじ補正: ${cat==='Rc'?'テーパ ×0.55':'平行 ×0.75'} (低速・潤滑重視)`:''}
  S_theo = Vc×1000/(π×D) = ${Vc}×1000/(π×${D}) = ${S_theo} rpm
  S_actual = min(${S_theo}, ${nmax}[上限]) = ${S} rpm
  Vc_actual = S×π×D/1000 = ${Vc_act} m/min

▼ Step2: 同期送り (剛性タップ必須条件)
  F = S × P = ${S} × ${P} = ${F} mm/min
  ※ 剛性タッピングでは F = S×P が機械制御で自動同期

▼ Step3: タップコア径 (${th.angle===55?'55°ウィットワース (G/Rc)':'60°メートル/ユニファイ JIS/ISO 724'})
  dc = D - ${angK}×P = ${D} - ${angK}×${P} = ${dc.toFixed(4)} mm

▼ Step4: タッピングトルク Tm (推定 / 経験式)
  Tm = 0.035 × Ct × Km × D^2.2 × P^0.8 × fC${isTaper?' × 1.30(テーパ漸進切削)':''}
     = 0.035 × ${tt.Ct}(${tt.name}) × ${tm.Km}(${tm.name})
       × ${D}^2.2 × ${P}^0.8 × ${tc.fC}(${tc.desc})${isTaper?' × 1.30':''}
     = ${Tm.toFixed(4)} N·m

▼ Step5: タップ許容トルク Ta (材料力学: 中実円形断面のねじり / 安全率込み)
  τ_allow = ${tl.tau} MPa (${tl.name}, せん断許容応力=安全率込み)
  Ta = τ_allow × π × dc³/16 / 1000
     = ${tl.tau} × π × ${dc.toFixed(3)}³/16 / 1000
     = ${Tb.toFixed(3)} N·m
  ※ これは“折れる破断トルク”ではなく許容作業トルクの保守値(実破断トルクは約3〜5倍)。

▼ Step6: トルク比評価 (折損を避ける安全側判定)
  トルク比 = Tm/Ta = ${Tm.toFixed(3)}/${Tb.toFixed(3)} = ${(torqRatio*100).toFixed(1)}%
  評価: ${torqRatio<0.6?'✅ 安全':torqRatio<0.8?'⚠ 注意':torqRatio<1.0?'❗ 危険(条件見直し)':'🚫 トルク超過(条件変更必須)'}
  ※ Tm・Ta とも安全率込みの保守的推定値。実トルクは潤滑・下穴径・材料ロットで±40%程度ばらつく。

▼ Step7: 下穴径推奨 (${pilot.fixed?'管用ねじは基準径固定・ゲージ確認':'60°切削ねじは低トルク側の案を併記'})
  ${pilot.note}
  ${pilot.fixed?'基準下穴径':'推奨(やや大きめ)'}: ${pilot.rec} mm
  ${pilot.fixed?'基準範囲':'許容範囲'}: ${pilot.lo} mm(下限=${pilot.fixed?'登録基準径':'標準D-P'}) 〜 ${pilot.hi} mm(${pilot.fixed?'固定':'上限=最大径案'})
  ${pilot.fixed?'管用ねじは使用タップメーカー表とねじゲージで最終確認':'強度最優先時のみ: '+pilot.tight+' mm (下限以下・係合率高)'}
  ${engRec!==null?`ねじ係合率(目安, 60°ねじ %=76.98×(D−d)/P): 下限${threadEngagement(D,pilot.lo,P).toFixed(0)}% / 推奨${engRec.toFixed(0)}% / 上限${threadEngagement(D,pilot.hi,P).toFixed(0)}%`:'※ 転造/管用ねじは係合率の概念が切削ねじと異なるため非表示'}
  ※ 下穴が大きいほど ねじ係合率↓→タッピングトルク↓→タップ折損リスク↓ (実用強度は係合率60〜80%で十分)

▼ Step8: 加工時間
  切削深さ = ${cutting_depth} mm | F = ${F} mm/min
  1穴時間(往復) = ${cutting_depth}/${F}×60×2 = ${t1.toFixed(1)} 秒
  ${holes}穴合計 = ${tTotal.toFixed(1)} 秒 = ${fmtT(tTotal)}`;

  document.getElementById('tap_result_wrap').classList.remove('hidden');
}

/* ねじ規格プルダウンを分類別optgroupで自動生成 */
function populateTapThreads(){
  const sel=document.getElementById('tap_thread');
  if(!sel) return;
  let html='';
  Object.keys(THREAD_GROUPS).forEach(cat=>{
    const keys=Object.keys(THREADS).filter(k=>THREADS[k].cat===cat);
    if(keys.length===0) return;
    html+=`<optgroup label="${THREAD_GROUPS[cat]}">`;
    keys.forEach(k=>{
      html+=`<option value="${k}"${k==='M6_1.0'?' selected':''}>${THREADS[k].name}</option>`;
    });
    html+='</optgroup>';
  });
  sel.innerHTML=html;
}
