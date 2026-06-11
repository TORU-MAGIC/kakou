'use strict';
/* ============================================================
   boring.js — MC（マシニングセンタ）用 1本バイト / ボーリング（中ぐり）
   依存: core.js（INSERT_SHAPE, MAT, TOOL, coolantAdjust, iscar系, interp,
                 taylorLife, theorRz 等）, turning.js（T_F_CAT, turningFc）
   ----------------------------------------------------------------
   ・MC主軸に「1本刃のバイト(ボーリングバー/中ぐりバー/フライス治具バイト)」を
     装着して内径(中ぐり)・端面/座ぐり・面取りを行う想定。
   ・回転するのは工具側。 S = 1000·Vc/(π·D)、 F[mm/min] = f[mm/rev]×S。
   ・インサート形状(三角フラット/ひし形/丸 等)の「当たり面=刃先強度」を
     送り係数 strF として送りに反映（core.js INSERT_SHAPE）。
   ・ボーリングバーの突き出し L/D で 曲げ剛性・たわみ・びびり を評価し、
     条件(Vc・f)を自動で抑える。
   ============================================================ */

/* ボーリングバー(シャンク)DB ★調整可
   sigma=許容曲げ応力[MPa], E=縦弾性係数[MPa], ldMax=推奨L/D上限(目安), desc */
const BORING_BAR = {
  steel:   {name:'鋼シャンク',           sigma:340, E:210000, ldMax:4,  desc:'標準・安価。L/D≤4目安。超えると防振/超硬バーを推奨'},
  hm_steel:{name:'超硬ヘッド+鋼シャンク', sigma:420, E:300000, ldMax:6,  desc:'先端超硬・根元鋼の複合。L/D≤5〜6。コスパ良'},
  carbide: {name:'超硬シャンク',         sigma:600, E:550000, ldMax:8,  desc:'高剛性(E≈鋼の2.6倍)。L/D≤6〜8。びびり大幅減・高価・重い'},
  damped:  {name:'防振バー(制振ダンパ)',  sigma:340, E:210000, ldMax:10, desc:'内蔵ダンパで制振。L/D≤7〜10で安定。深い中ぐり向き'},
};

/* ボーリング加工モード係数（Vc・送りの実務補正） */
const BORING_MODE = {
  bore_through:{name:'中ぐり(貫通)',   vcF:0.90, fF:1.00, desc:'内径仕上げ・貫通。切りくずは下へ逃がす。標準'},
  bore_blind:  {name:'中ぐり(止まり)', vcF:0.80, fF:0.90, desc:'止まり穴中ぐり。切りくず排出が最難関→低速・低送り・内部給油/エア必須'},
  face:        {name:'端面/座ぐり',    vcF:1.00, fF:1.00, desc:'端面・座ぐり。径方向送り。中心付近はVc低下に注意'},
  chamfer:     {name:'面取り',         vcF:0.95, fF:0.80, desc:'面取り・取り代少。送り控えめで仕上げ重視'},
};

/* ボーリングバー曲げ制約からの f_max（丸シャンク・片持ち先端負荷） */
function fMaxBoring(ap, mat, barKey, d_bar, OH, Vc, Pm, eta, kr_deg){
  const db  = MAT[mat];
  const bar = BORING_BAR[barKey] || BORING_BAR.steel;
  const Fc_motor = (Pm*eta*1000*60)/Vc;
  const Zb = Math.PI*Math.pow(d_bar,3)/32;       // 丸断面係数 [mm³]
  const M_all = bar.sigma*Zb;                    // 許容曲げモーメント [N·mm]
  const Fc_tool = M_all/Math.max(OH,1);          // 突き出し先端で受けられる切削力 [N]
  const Fc_max = Math.min(Fc_motor, Fc_tool);
  const Kc = kaprKienzleFactor(mat, kr_deg||75);
  const rhs = Fc_max/(db.Ks1*ap*Kc);
  if(rhs<=0) return {f:0, Fc_motor, Fc_tool, Fc_max, Zb, M_all};
  const f = Math.pow(rhs, 1/(1-db.mc));
  return {f, Fc_motor, Fc_tool, Fc_max, Zb, M_all};
}

/* L/D比 → Vc低減係数（びびり対策・推奨L/D上限基準） */
function boringVibFactor(ld, barKey){
  const bar = BORING_BAR[barKey] || BORING_BAR.steel;
  const r = ld/Math.max(bar.ldMax,1);
  return interp(r, [[0,1.0],[0.5,1.0],[0.75,0.93],[1.0,0.80],[1.25,0.62],[1.5,0.48],[2.0,0.32]]);
}

/* ================================================================
   ☆ MC 1本バイト refresh / calc
================================================================ */
function refreshBoring(){
  const D=n('b_D'), ap=n('b_ap');
  const mat=s('b_mat'), proc=s('b_proc'), tool=s('b_tool');
  const kr=parseFloat(s('b_kr'))||75, re=parseFloat(s('b_re'))||0.8;
  const shape=s('b_shape')||'C';
  const mode=s('b_mode')||'bore_through';
  const bar=s('b_bar')||'steel';
  const d_bar=n('b_dbar')||16, OH=n('b_OH')||(d_bar*3);
  const Pm=n('b_motor')||7.5, eta=n('b_eta')||0.80, nmax=n('b_nmax')||8000, torqMax=n('b_torque_max')||80;
  const tl=TOOL[tool], db=MAT[mat]||MAT.steel;
  const cool=s('b_cool')||'wet', coolA=coolantAdjust(cool,mat,tool);
  const toolWarn=toolMaterialWarning(tool,mat);
  const iscar=s('b_iscar')||'none', ig=ISCAR_GRADES[iscar]||ISCAR_GRADES.none;
  const shp=insertShapeAdjust(shape, ap, 0, kr);
  const md=BORING_MODE[mode]||BORING_MODE.bore_through;
  const barDB=BORING_BAR[bar]||BORING_BAR.steel;
  const ld=d_bar>0?OH/d_bar:0;
  const vibF=boringVibFactor(ld,bar);
  const apTF=ap>0?interp(ap,[[0.5,1.06],[1,1.02],[2,1.00],[3,0.95],[5,0.88],[8,0.80],[12,0.72]]):1.0;

  document.getElementById('b_tool_desc').innerHTML=
    `<b>${tl.name}</b>: ${tl.desc}<br>🔷 形状 <b>${shp.name}</b>（ノーズ角 εr=${shp.epsTxt}・送り係数×${shp.strF.toFixed(2)}）<br>${shp.sh.desc}<br>🛠️ ${barDB.name}｜${md.name}｜L/D=${ld.toFixed(1)}（推奨≤${barDB.ldMax}）| κr=${kr}° | Rε=${re}mm | 💧${coolA.name}${getToolChips(tool)}`
    +(iscar!=='none'?`<br>🔶 <b>${ig.name}</b> [ISO ${ig.iso}] — ${ig.desc}<br><span style="color:var(--txt3)">推奨: ${iscarLineHint(mat,'turn')}（ITA要確認）</span>`:'')
    +(toolWarn?`<br><span style="color:#fca5a5">${toolWarn}</span>`:'');

  // ベースVc（ISCAR選択時はISCAR推奨）×油種×ap×モード×L/Dびびり低減
  const Vc_base0=(iscar!=='none')?iscarVcRec(mat,'turn',proc):db.vcT[proc]*tl.vcF;
  const Vc_b=Vc_base0*coolA.vcF*apTF*md.vcF*vibF;
  document.getElementById('b_Vc').value=Math.round(Vc_b);

  if(!D||D<=0||!ap||ap<=0||d_bar<=0){
    ['b_f','b_S','b_F','b_fmax'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('b_feed_panel').innerHTML='加工穴径・切込み・バー径を入力すると表示されます';
    document.getElementById('b_bar_info').innerHTML='ボーリングバー径と突き出しを入力すると表示されます';
    setBtn('b_btn',false);return;
  }

  const Vc=Math.round(Vc_b);
  const res=fMaxBoring(ap,mat,bar,d_bar,OH,Vc,Pm,eta,kr);
  const f_base=(T_F_CAT[mat]||T_F_CAT.steel)[proc];
  const f_cat=f_base*coolA.fzF*shp.strF*md.fF;
  const f_real=Math.min(res.f,f_cat);

  let S=Math.round(Vc*1000/(Math.PI*D));
  let nlimited=false;
  if(S>nmax){S=nmax;nlimited=true;}
  const F=Math.round(S*f_real);
  const b_eng=ap>0?ap/Math.sin(kr*Math.PI/180):0;
  const area=ap*f_real;

  // 切削力・先端たわみ（片持ち梁）
  const Fc=turningFc(f_real,ap,mat,kr);
  const Fr=Fc*0.5;                                   // 径方向たわみに効く代表合力(送り分力+背分力の代表値)
  const I=Math.PI*Math.pow(d_bar,4)/64;              // 断面二次モーメント [mm⁴]
  const delta=Fr*Math.pow(OH,3)/(3*barDB.E*I);       // 先端たわみ [mm]
  const Pc=(Fc*Vc)/(60*1000);
  const P_av=Pm*eta, loadP=(Pc/P_av)*100;
  const toolStress=Fc/res.Fc_tool;
  const Torq=Fc*(D/2)/1000, torqRatio=Torq/torqMax;
  const TaylorT=taylorLife(Vc,mat);
  const Rz=theorRz(f_real,re);

  // L/D 判定
  let ldSt,ldTxt;
  if(ld<=barDB.ldMax*0.75){ldSt='ok';ldTxt='剛性良好';}
  else if(ld<=barDB.ldMax){ldSt='ok';ldTxt='推奨上限内';}
  else if(ld<=barDB.ldMax*1.25){ldSt='warn';ldTxt='びびり注意';}
  else{ldSt='crit';ldTxt='高びびり/防振バー推奨';}

  document.getElementById('b_fmax').value=p4(res.f);
  document.getElementById('b_S').value=S+(nlimited?' (上限)':'');
  document.getElementById('b_F').value=F;

  document.getElementById('b_feed_panel').innerHTML=
    `🔷 <b>${shp.name}</b>｜ノーズ角 εr=<b>${shp.epsTxt}</b>｜当たり面(切れ刃係合長) b=ap/sinκr=<b>${b_eng.toFixed(2)} mm</b>｜切りくず断面 A=ap×f=<b>${area.toFixed(3)} mm²</b><br>`+
    `送り f：カタログ${p4(f_base)}×油種${coolA.fzF.toFixed(2)}×<b>形状${shp.strF.toFixed(2)}</b>×モード${md.fF.toFixed(2)} ⇒ <b style="color:#ffd700">${p4(f_real)} mm/rev</b><br>`+
    `<b>F送り換算：F = f×S = ${p4(f_real)}×${S} = <span style="color:#ffd700">${F} mm/min</span></b>　(S=1000×Vc/πD=${S} rpm${nlimited?'・主軸上限で制限':''})`;

  document.getElementById('b_bar_info').innerHTML=
    `🛠️ <b>${barDB.name}</b>｜バー径 d=${d_bar}mm｜突き出し OH=${OH}mm｜<b>L/D=${ld.toFixed(1)}</b>（推奨≤${barDB.ldMax}）→ <b style="color:${ldSt==='ok'?'#86efac':ldSt==='warn'?'#fcd34d':'#fca5a5'}">${ldTxt}</b><br>`+
    `先端たわみ δ=Fr·L³/(3EI)=<b>${(delta*1000).toFixed(1)} μm</b>（Fr≈0.5Fc=${Fr.toFixed(0)}N）｜びびり対策で Vc×${vibF.toFixed(2)} を自動適用`;

  const feasible=f_real>=0.003&&toolStress<=1.0&&loadP<=100&&torqRatio<=1.0&&ld<=barDB.ldMax*1.25;

  const items=[
    {l:'主軸回転 S',v:S+' rpm'},
    {l:'送り速度 F',v:F+' mm/min'},
    {l:'確定 f',v:p4(f_real)+' mm/rev'},
    {l:'ノーズ角 εr',v:shp.epsTxt},
    {l:'当たり面 b',v:b_eng.toFixed(2)+' mm'},
    {l:'L/D比',v:ld.toFixed(1)+'（≤'+barDB.ldMax+'）'},
    {l:'先端たわみ δ',v:(delta*1000).toFixed(1)+' μm'},
    {l:'実切削力Fc',v:Fc.toFixed(0)+' N'},
    {l:'バー曲げ限界Fc',v:res.Fc_tool.toFixed(0)+' N'},
    {l:'実動力',v:Pc.toFixed(2)+' kW'},
    {l:'機械負荷',v:loadP.toFixed(0)+'%'},
    {l:'Taylor寿命',v:TaylorT.toFixed(0)+' min'},
  ];
  let st,vt;
  if(!feasible){st='crit';vt= ld>barDB.ldMax*1.25?'🚫 L/D過大・びびり危険':'🚫 加工不可';}
  else if(toolStress>0.80||loadP>80||torqRatio>0.90||ldSt==='warn'){st='warn';vt=`⚠ ${ldSt==='warn'?'L/D注意 ':''}負荷${loadP.toFixed(0)}% / δ${(delta*1000).toFixed(0)}μm`;}
  else{st='ok';vt=`✅ 適正 F=${F}mm/min / L/D${ld.toFixed(1)} / δ${(delta*1000).toFixed(0)}μm`;}
  setPhys('b',items,vt,st);
  drawBar('b_bar_load','b_pct_load',loadP);
  drawBar('b_bar_stress','b_pct_stress',toolStress*100);
  setFeedField('b_f',f_real,!feasible?'ng':(toolStress>0.80||loadP>80||ldSt!=='ok')?'warn':'ok');
  setBtn('b_btn',feasible);

  document.getElementById('b_rec_body').innerHTML=`
<p style="font-size:11px;line-height:1.9;color:var(--txt2)">
<b>${iscar!=='none'?ig.name:tl.name}</b> | 🔷${shp.name} εr=${shp.epsTxt} | 🛠️${barDB.name} | ${md.name}<br>
<b>Vc=</b>${iscar!=='none'?`${iscarVcRec(mat,'turn',proc)}(ISCAR)`:`${db.vcT[proc]}×${tl.vcF}(工具)`}×${coolA.vcF.toFixed(2)}(油)×${apTF.toFixed(2)}(ap)×${md.vcF.toFixed(2)}(モード)×${vibF.toFixed(2)}(L/D)=<b style="color:#ffd700">${Vc} m/min</b><br>
<b>確定f:</b> <b style="color:#ffd700">${p4(f_real)} mm/rev</b> → <b>F:</b> <b style="color:#ffd700">${F} mm/min</b>（S=${S}rpm${nlimited?'・上限':''}）<br>
<b>当たり面 b:</b> ${b_eng.toFixed(2)} mm | <b>断面A:</b> ${area.toFixed(3)} mm²<br>
<b>L/D:</b> ${ld.toFixed(1)}（≤${barDB.ldMax}）${ldTxt} | <b>δ:</b> ${(delta*1000).toFixed(1)} μm<br>
<b>Fc:</b> ${Fc.toFixed(0)} N | <b>Torq:</b> ${Torq.toFixed(1)} N·m | <b>Rz:</b> ${Rz.toFixed(2)} μm
</p>`;
}

function calcBoring(){
  const D=n('b_D'), L=n('b_L'), ap=n('b_ap'), pass=parseInt(s('b_pass'))||1;
  const mat=s('b_mat'), proc=s('b_proc'), tool=s('b_tool');
  const kr=parseFloat(s('b_kr'))||75, re=parseFloat(s('b_re'))||0.8;
  const shape=s('b_shape')||'C', mode=s('b_mode')||'bore_through';
  const bar=s('b_bar')||'steel', d_bar=n('b_dbar')||16, OH=n('b_OH')||(d_bar*3);
  const Pm=n('b_motor')||7.5, eta=n('b_eta')||0.80, nmax=n('b_nmax')||8000, torqMax=n('b_torque_max')||80;
  const tl=TOOL[tool], db=MAT[mat]||MAT.steel;
  const cool=s('b_cool')||'wet', coolA=coolantAdjust(cool,mat,tool);
  const toolWarn=toolMaterialWarning(tool,mat);
  const iscar=s('b_iscar')||'none';
  const shp=insertShapeAdjust(shape, ap, 0, kr);
  const md=BORING_MODE[mode]||BORING_MODE.bore_through;
  const barDB=BORING_BAR[bar]||BORING_BAR.steel;
  const ld=d_bar>0?OH/d_bar:0, vibF=boringVibFactor(ld,bar);
  const apTF=ap>0?interp(ap,[[0.5,1.06],[1,1.02],[2,1.00],[3,0.95],[5,0.88],[8,0.80],[12,0.72]]):1.0;
  const Vc_base0=(iscar!=='none')?iscarVcRec(mat,'turn',proc):db.vcT[proc]*tl.vcF;
  const Vc=Math.round(Vc_base0*coolA.vcF*apTF*md.vcF*vibF);
  const res=fMaxBoring(ap,mat,bar,d_bar,OH,Vc,Pm,eta,kr);
  const f_base=(T_F_CAT[mat]||T_F_CAT.steel)[proc];
  const f_cat=f_base*coolA.fzF*shp.strF*md.fF;
  const f=Math.min(res.f,f_cat);
  let S=Math.round(Vc*1000/(Math.PI*D)), nlimited=false;
  const S_raw=S;
  if(S>nmax){S=nmax;nlimited=true;}
  const F=Math.round(S*f);
  const b_eng=ap>0?ap/Math.sin(kr*Math.PI/180):0, area=ap*f;
  const Fc=turningFc(f,ap,mat,kr), Fr=Fc*0.5;
  const I=Math.PI*Math.pow(d_bar,4)/64;
  const delta=Fr*Math.pow(OH,3)/(3*barDB.E*I);
  const Pc=(Fc*Vc)/(60*1000), P_av=Pm*eta, loadP=(Pc/P_av)*100;
  const toolStress=(Fc/res.Fc_tool)*100;
  const MRR=ap*f*Vc;
  const sec=L*pass/F*60;
  const Rz=theorRz(f,re), Ra=(Rz/4).toFixed(3);
  const TaylorT=taylorLife(Vc,mat), Torq=Fc*(D/2)/1000;
  const Kc=kaprKienzleFactor(mat,kr);
  const Zb=Math.PI*Math.pow(d_bar,3)/32;

  document.getElementById('b_rg').innerHTML=`
    <div class="res-item res-hl"><div class="res-lbl">主軸回転数 S</div><div class="res-val">${S} rpm${nlimited?' (上限)':''}</div></div>
    <div class="res-item res-hl"><div class="res-lbl">🏆 送り速度 F</div><div class="res-val">${F} mm/min</div></div>
    <div class="res-item"><div class="res-lbl">切削速度 Vc</div><div class="res-val">${Vc} m/min</div></div>
    <div class="res-item"><div class="res-lbl">確定 f (送り/回転)</div><div class="res-val">${p4(f)} mm/rev</div></div>
    <div class="res-item"><div class="res-lbl">🔷 インサート形状</div><div class="res-val" style="font-size:13px">${shp.name}</div></div>
    <div class="res-item"><div class="res-lbl">ノーズ角 εr</div><div class="res-val">${shp.epsTxt}</div></div>
    <div class="res-item"><div class="res-lbl">当たり面 切れ刃係合長 b</div><div class="res-val">${b_eng.toFixed(2)} mm</div></div>
    <div class="res-item"><div class="res-lbl">切りくず断面積 A</div><div class="res-val">${area.toFixed(3)} mm²</div></div>
    <div class="res-item"><div class="res-lbl">🛠️ バー / L/D</div><div class="res-val" style="font-size:13px">${barDB.name} / ${ld.toFixed(1)}</div></div>
    <div class="res-item"><div class="res-lbl">先端たわみ δ</div><div class="res-val">${(delta*1000).toFixed(1)} μm</div></div>
    <div class="res-item"><div class="res-lbl">実切削力 Fc</div><div class="res-val">${Fc.toFixed(0)} N</div></div>
    <div class="res-item"><div class="res-lbl">スピンドルトルク</div><div class="res-val">${Torq.toFixed(1)} N·m</div></div>
    <div class="res-item"><div class="res-lbl">実動力 Pc</div><div class="res-val">${Pc.toFixed(2)} kW</div></div>
    <div class="res-item"><div class="res-lbl">機械負荷率</div><div class="res-val">${loadP.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">工具応力比(バー曲げ)</div><div class="res-val">${toolStress.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">理論面粗さ Rz</div><div class="res-val">${Rz.toFixed(2)} μm</div></div>
    <div class="res-item"><div class="res-lbl">理論面粗さ Ra≈</div><div class="res-val">${Ra} μm</div></div>
    <div class="res-item"><div class="res-lbl">MRR</div><div class="res-val">${MRR.toFixed(2)} cm³/min</div></div>
    <div class="res-item"><div class="res-lbl">Taylor工具寿命 T</div><div class="res-val">${TaylorT.toFixed(0)} min</div></div>
    <div class="res-item res-hl"><div class="res-lbl">切削時間</div><div class="res-val">${fmtT(sec)}</div></div>`;

  const wc=document.getElementById('b_warns');wc.innerHTML='';
  wc.innerHTML+=`<div class="info-box ib-purple"><h3>🔷 インサート形状: ${shp.name}（当たり面＝刃先強度）</h3><p>${shp.sh.desc}<br>ノーズ角 εr=${shp.epsTxt}（大きいほど刃先が強く高送り可／小さいほど倣い向きで送り控えめ）。送り係数 ×${shp.strF.toFixed(2)}（基準C 80°）を適用。当たり面(切れ刃係合長) b=ap/sinκr=${b_eng.toFixed(2)}mm、切りくず断面 A=ap×f=${area.toFixed(3)}mm²。</p></div>`;
  const ldcls = ld<=barDB.ldMax?'ib-green':ld<=barDB.ldMax*1.25?'ib-yellow':'ib-red';
  wc.innerHTML+=`<div class="info-box ${ldcls}"><h3>🛠️ ボーリングバー: ${barDB.name}（L/D=${ld.toFixed(1)} / 推奨≤${barDB.ldMax}）</h3><p>${barDB.desc}<br>先端たわみ δ=Fr·OH³/(3EI)=${(delta*1000).toFixed(1)}μm（Fr≈0.5Fc=${Fr.toFixed(0)}N、I=πd⁴/64=${I.toFixed(0)}mm⁴）。びびり対策で Vc×${vibF.toFixed(2)} を自動適用。${ld>barDB.ldMax?' L/Dが推奨超過→超硬/防振バー・低速・低送り・小apで対応。':''}</p></div>`;
  wc.innerHTML+=`<div class="info-box ib-blue"><h3>💧 クーラント: ${coolA.name} ／ モード: ${md.name}</h3><p>${coolA.desc}<br>${md.desc}<br>適用: Vc×${coolA.vcF.toFixed(2)}(油)×${md.vcF.toFixed(2)}(モード)×${vibF.toFixed(2)}(L/D) ／ 送り×${coolA.fzF.toFixed(2)}×形状${shp.strF.toFixed(2)}×モード${md.fF.toFixed(2)}。</p></div>`;
  if(coolA.warn) wc.innerHTML+=`<div class="info-box ib-yellow"><h3>⚠ 油種の注意</h3><p>${coolA.warn}</p></div>`;
  if(toolWarn) wc.innerHTML+=`<div class="info-box ib-red"><h3>⚠ 工具材質の相性</h3><p>${toolWarn}</p></div>`;
  if(mode==='bore_blind') wc.innerHTML+='<div class="info-box ib-yellow"><h3>⚠ 止まり穴中ぐり</h3><p>切りくず排出が最難関。内部給油(クーラントスルー)・ペック・エアブロー併用を推奨。切りくず噛み込みでバー折損リスク。</p></div>';
  if(nlimited) wc.innerHTML+=`<div class="info-box ib-blue"><h3>💡 主軸回転が上限で制限</h3><p>理論S=${S_raw}rpmが主軸上限${nmax}rpmを超過→S=${nmax}rpmにクランプ。実Vcは ${(Math.PI*D*nmax/1000).toFixed(0)} m/minに低下。小径中ぐりは高回転主軸が有利。</p></div>`;
  if(shape==='V'||shape==='D') wc.innerHTML+='<div class="info-box ib-yellow"><h3>💡 倣い系の弱い刃先</h3><p>'+shp.name+'は内角が小さく刃先が弱め。中ぐり荒は内角の大きい C(80°)/W(トライゴン)/S(四角)が安定。仕上げ・倣いに向く。</p></div>';
  if(toolStress>70) wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ バー曲げ応力高</h3><p>突き出しOH短縮 or バー径UP or ap低減。超硬/防振バーへの変更を検討。</p></div>';

  document.getElementById('b_fml').textContent=
`【MC 1本バイト / ボーリング(中ぐり) 物理計算ログ】

工具: ${tl.name} | 🔷形状 ${shp.name}(εr=${shp.epsTxt}) | 🛠️${barDB.name} | ${md.name}
材料: ${db.name} | Ks1=${db.Ks1} N/mm² | mc=${db.mc}
バー: d=${d_bar}mm | OH=${OH}mm | L/D=${ld.toFixed(2)} | σ_allow=${barDB.sigma}MPa | E=${barDB.E}MPa | 推奨L/D≤${barDB.ldMax}

▼ Step1: Vc = ${iscar!=='none'?`${iscarVcRec(mat,'turn',proc)}(ISCAR)`:`${db.vcT[proc]}×${tl.vcF}(工具)`}×${coolA.vcF.toFixed(2)}(油)×${apTF.toFixed(2)}(ap)×${md.vcF.toFixed(2)}(モード)×${vibF.toFixed(2)}(L/Dびびり) = ${Vc} m/min

▼ Step2: κr補正係数 Kc = sin(${kr}°)^(-mc) = sin(${kr}°)^(-${db.mc}) = ${Kc.toFixed(4)}

▼ Step3: ボーリングバー曲げ強度（丸シャンク d=${d_bar}mm）
  Zb = π×d³/32 = π×${d_bar}³/32 = ${Zb.toFixed(0)} mm³
  M_allow = σ_allow×Zb = ${barDB.sigma}×${Zb.toFixed(0)} = ${res.M_all.toFixed(0)} N·mm
  Fc_max_bar = M_allow/OH = ${res.M_all.toFixed(0)}/${OH} = ${res.Fc_tool.toFixed(0)} N

▼ Step4: 機械出力制約
  Fc_max_motor = Pm×η×1000×60/Vc = ${res.Fc_motor.toFixed(0)} N
  有効Fc_max = min(バー, モータ) = ${res.Fc_max.toFixed(0)} N

▼ Step5: f_max逆算 (Kienzle式+κr補正) ＋ インサート形状補正
  f_phys = (Fc_max/(Ks1×ap×Kc))^(1/(1-mc)) = ${p4(res.f)} mm/rev
  f_cat = ${p4(f_base)}(材料/区分)×油種${coolA.fzF.toFixed(2)}×形状${shp.strF.toFixed(2)}(${shape}:εr${shp.epsTxt})×モード${md.fF.toFixed(2)} = ${p4(f_cat)} mm/rev
  確定 f = min(f_phys, f_cat) = ${p4(f)} mm/rev

▼ Step6: 当たり面（切れ刃の係合・形状考慮）
  切れ刃係合長 b = ap/sin(κr) = ${ap}/sin(${kr}°) = ${b_eng.toFixed(2)} mm
  切りくず断面積 A = ap×f = ${ap}×${p4(f)} = ${area.toFixed(3)} mm²

▼ Step7: F送り換算（MCは F[mm/min] で指令）
  S = 1000×Vc/(π×D) = 1000×${Vc}/(π×${D}) = ${S_raw} rpm${nlimited?` → 主軸上限 ${nmax} で制限 → S=${S} rpm`:''}
  F = f×S = ${p4(f)}×${S} = ${F} mm/min

▼ Step8: ボーリングバー先端たわみ（片持ち梁モデル）
  I = π×d⁴/64 = ${I.toFixed(0)} mm⁴
  δ = Fr×OH³/(3×E×I) = ${Fr.toFixed(0)}×${OH}³/(3×${barDB.E}×${I.toFixed(0)}) = ${delta.toFixed(4)} mm = ${(delta*1000).toFixed(1)} μm
  （Fr≈0.5×Fc=${Fr.toFixed(0)}N を径方向代表合力として使用）

▼ Step9: 面粗さ / 工具寿命 / 検証
  Rz = f²/(8×rε)×1000 = ${p4(f)}²/(8×${re})×1000 = ${Rz.toFixed(2)} μm | Ra≈${Ra} μm
  T = (${db.C_T}/Vc)^${db.n_T} = ${TaylorT.toFixed(0)} min @ Vc=${Vc} m/min
  Fc = ${db.Ks1}×${p4(f)}^${(1-db.mc).toFixed(2)}×${ap}×${Kc.toFixed(4)} = ${Fc.toFixed(0)} N
  Torq = Fc×(D/2)/1000 = ${Torq.toFixed(1)} N·m | Pc = ${Pc.toFixed(2)} kW / 負荷${loadP.toFixed(0)}%
  MRR = ap×f×Vc = ${ap}×${p4(f)}×${Vc} = ${MRR.toFixed(2)} cm³/min`;
  document.getElementById('b_result_wrap').classList.remove('hidden');
  addCompare({type:'MC1本バイト('+shape+'/'+mode.replace('bore_','')+')',mat:db.name,D,Vc,S,fz:p4(f),F,Fc:Fc.toFixed(0),Pc:Pc.toFixed(2),load:loadP.toFixed(0),MRR:MRR.toFixed(2)+' cm³/min',T:TaylorT.toFixed(0)+'min',ok:loadP<=80&&toolStress<=80&&ld<=barDB.ldMax});
}
