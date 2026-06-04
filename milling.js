'use strict';
/* ============================================================
   milling.js — フライス系
   ソリッドエンドミル / チップ式フェイスミル /
   チップ式インデキサブル / 高送りミル
   依存: core.js
   ============================================================ */


/* ================================================================
   フェイスミル・インデキサブル カタログ基準 fz (mm/刃)
================================================================ */
const FM_FZ_CAT = {
  al:{rough:0.20,semi:0.13,finish:0.07},
  al7075:{rough:0.18,semi:0.12,finish:0.06},
  steel:{rough:0.15,semi:0.10,finish:0.05},
  steel_h:{rough:0.10,semi:0.07,finish:0.04},
  steel_hh:{rough:0.05,semi:0.03,finish:0.02},
  sus304:{rough:0.08,semi:0.06,finish:0.03},
  sus316:{rough:0.07,semi:0.05,finish:0.025},
  cast:{rough:0.18,semi:0.12,finish:0.06},
  ti:{rough:0.05,semi:0.035,finish:0.020},
  ni:{rough:0.03,semi:0.020,finish:0.012},
};

/* ================================================================
   ソリッドエンドミル カタログ fz
================================================================ */
const M_FZ_CAT = {
  al:{rough:0.080,semi:0.055,finish:0.030},
  al7075:{rough:0.075,semi:0.050,finish:0.028},
  steel:{rough:0.060,semi:0.040,finish:0.020},
  steel_h:{rough:0.040,semi:0.028,finish:0.015},
  steel_hh:{rough:0.015,semi:0.010,finish:0.006},
  sus304:{rough:0.040,semi:0.028,finish:0.015},
  sus316:{rough:0.035,semi:0.024,finish:0.013},
  cast:{rough:0.070,semi:0.045,finish:0.025},
  ti:{rough:0.030,semi:0.020,finish:0.012},
  ni:{rough:0.015,semi:0.010,finish:0.006},
  cu:{rough:0.100,semi:0.070,finish:0.040},
  cfrp:{rough:0.060,semi:0.040,finish:0.025},
};

/* アプローチ角補正係数 κr → 軸方向分力比 */
function krAxialRatio(kr_deg) {
  const kr = kr_deg*Math.PI/180;
  return Math.cos(kr); // 軸方向成分比
}

/* 高送りミル fz補正係数 */
function hfFzFactor(kr_deg) {
  // κr小さいほど大きな送りが可能
  // 実験的データ: κr=90→×1.0, 45→×1.5, 15→×4.0, 10→×6.0
  return interp(kr_deg, [[10,6.0],[12,5.0],[15,4.0],[17,3.2],[30,2.0],[45,1.5],[60,1.2],[90,1.0]]);
}

/* ================================================================
   ☆ フライス (ソリッドエンドミル) refresh / calc
================================================================ */
function refreshM() {
  const D=n('m_D'), Z=parseInt(s('m_Z'))||4;
  const mat=s('m_mat'), proc=s('m_proc'), tool=s('m_tool');
  const ap=n('m_ap'), ae=n('m_ae');
  const Pm=n('m_motor')||7.5, eta=n('m_eta')||0.80;
  const nmax=n('m_nmax')||12000;
  const OAL=n('m_OAL')||0, OH_inp=n('m_OH')||0;
  const cool=s('m_cool')||'wet';

  const tl=TOOL[tool];
  const db=MAT[mat];
  const coolA=coolantAdjust(cool,mat,tool);
  document.getElementById('m_tool_desc').innerHTML=`${tl.desc}${getToolChips(tool)}`;

  // 【v4.2】ap/ae・油種を反映した実効Vc（切込みが変われば速度・回転数も変わる）
  const Dd=Math.max(D,0.001);
  const aeF=(D>0&&ae>0)?aeVcFactor(ae,D):1.0;   // 径方向係合 → 低係合で高速化(HSM)
  const apF=(D>0&&ap>0)?apVcFactor(ap,D):1.0;   // 軸方向切込み → 深いほど微減
  const ctf=(D>0&&ae>0)?chipThinning(ae,D):1.0; // 切りくず薄化 → ae<D/2で送り増可
  const Vc_base=db.vcM[proc]*tl.vcF;
  const Vc_eff=Vc_base*coolA.vcF*aeF*apF;
  const S_theo=Math.round(Vc_eff*1000/(Math.PI*Dd));
  const S_act=Math.min(S_theo, nmax);
  const Vc=Math.round(S_act*Math.PI*Dd/1000);
  document.getElementById('m_Vc').value=Vc;

  if(!D||D<=0||!ap||ap<=0||!ae||ae<=0){
    document.getElementById('m_fzmax').value='';
    document.getElementById('m_fz').value='';
    setBtn('m_btn',false); return;
  }
  if(ae>D){document.getElementById('m_fz').value='ae>D !';setBtn('m_btn',false);return;}

  const OH=OH_inp>0?OH_inp:3*D;
  const ohF=ohFactor(OH,D);
  const vibS=vibFactor(OH,D);
  document.getElementById('m_oh_info').innerHTML=
    `OH=${OH.toFixed(1)}mm / D=${D}mm → <b>OH/D=${(OH/D).toFixed(2)}</b><br>
    切削条件低減係数: <b style="color:${ohF>0.85?'#86efac':ohF>0.65?'#fcd34d':'#fca5a5'}">×${ohF.toFixed(3)}</b> &nbsp;|&nbsp;
    振動安定性: <b style="color:${vibS.stable?'#86efac':'#fca5a5'}">${vibS.lv}</b><br>
    <span style="color:var(--txt3)">ae/D=${(ae/D).toFixed(2)} → Vc係数 <b style="color:#93c5fd">×${aeF.toFixed(2)}</b>(${ae/D<0.5?'低係合=高速':'スロット寄り'}) ／ ap/D=${(ap/D).toFixed(2)} → Vc係数 <b style="color:#93c5fd">×${apF.toFixed(2)}</b><br>
    切りくず薄化RCTF <b style="color:#86efac">×${ctf.toFixed(2)}</b>(送り増) ／ 油種 <b style="color:#fcd34d">${coolA.name}</b> Vc×${coolA.vcF.toFixed(2)}・送り×${coolA.fzF.toFixed(2)}</span>
    ${coolA.warn?`<br><span style="color:#fca5a5">${coolA.warn}</span>`:''}`;

  // 【v4.2】切りくず薄化(ctf, 上部で算出) + 油種の送り係数を反映
  const fz_max_phys=fzMaxMilling(ae,D,ap,Z,mat,tl.sigma,tl.rho,Vc,Pm,eta,OH)*ohF;
  const fz_cat=(M_FZ_CAT[mat]||M_FZ_CAT.steel)[proc]*fzDiamFactor(D)*ohF*coolA.fzF*ctf;
  const fz_real=Math.min(fz_max_phys, fz_cat);

  document.getElementById('m_fzmax').value=p4(fz_max_phys);
  document.getElementById('m_S_prev').value=S_act;

  const Fc1=FcTooth(fz_real,ae,D,ap,mat);
  const FcT=FcTotal(fz_real,ae,D,ap,Z,mat);
  const Pc=(FcT*Vc)/(60*1000);
  const P_av=Pm*eta;
  const loadP=(Pc/P_av)*100;
  const hm=hmM(fz_real,ae,D);
  const ze=Zeff(Z,ae,D);
  const phiD=phiDeg(ae,D);
  const Zsec=sectionModulusEM(D,Z);
  const M_all=tl.sigma*tl.rho*Zsec;
  const M_act=Fc1*OH;
  const stressR=M_act/M_all;
  const TaylorT=taylorLife(Vc,mat);

  // 【整理 v4.1】加工可否は「送り下限・工具応力・機械出力」のハード制約で判定。
  //   振動安定性(vibS.stable)は警告扱いとし可否はブロックしない（突き出し短縮で対処可能なため）。
  //   ※旧版は演算子優先順位により vibS.stable 項が常に無効化される論理式だった→挙動維持のまま明確化。
  const feasible = fz_real>=0.001 && stressR<=1.0 && loadP<=100;

  const items=[
    {l:'係合角φ',v:phiD.toFixed(1)+'°'},
    {l:'Zeff',v:ze.toFixed(2)+'刃'},
    {l:'hm平均切削厚',v:hm.toFixed(4)+' mm'},
    {l:'1刃切削力',v:Fc1.toFixed(0)+' N'},
    {l:'合計切削力',v:FcT.toFixed(0)+' N'},
    {l:'実動力Pc',v:Pc.toFixed(2)+' kW'},
    {l:'機械負荷',v:loadP.toFixed(0)+'%'},
    {l:'工具応力比',v:(stressR*100).toFixed(0)+'%'},
    {l:'曲げM(実)',v:M_act.toFixed(0)+' N·mm'},
    {l:'許容M',v:M_all.toFixed(0)+' N·mm'},
    {l:'Taylor寿命T',v:TaylorT.toFixed(0)+' min'},
    {l:'振動安定性',v:vibS.lv},
  ];
  let st,vt;
  if(!feasible||stressR>1.0||loadP>100){st='crit';vt='🚫 加工不可 — 工具破損/出力超過';}
  else if(stressR>0.80||loadP>80||!vibS.stable){st='warn';vt=`⚠️ 高負荷 負荷${loadP.toFixed(0)}% / 応力${(stressR*100).toFixed(0)}%`;}
  else{st='ok';vt=`✅ 適正 負荷${loadP.toFixed(0)}% / 応力${(stressR*100).toFixed(0)}% / 工具寿命${TaylorT.toFixed(0)}min`;}

  setPhys('m',items,vt,st);
  drawBar('m_bar_load','m_pct_load',loadP);
  drawBar('m_bar_stress','m_pct_stress',stressR*100);
  setFeedField('m_fz',fz_real,stressR>1.0||loadP>100?'ng':stressR>0.80||loadP>80?'warn':'ok');
  setBtn('m_btn',feasible&&stressR<=1.0&&loadP<=100);

  const recP=document.getElementById('m_rec');
  recP.className='phys-panel '+(feasible&&stressR<=1.0&&loadP<=100?'ok':'crit');
  document.getElementById('m_rec_body').innerHTML=`
<p style="font-size:11px;line-height:1.9;color:var(--txt2)">
<b>工具:</b> ${tl.name} | <b>材料:</b> ${db.name} | <b>油種:</b> ${coolA.name}<br>
<b>Vc=</b>${db.vcM[proc]}(基準)×${tl.vcF}(工具)×${coolA.vcF.toFixed(2)}(油種)×${aeF.toFixed(2)}(ae/D)×${apF.toFixed(2)}(ap/D)=<b style="color:#ffd700">${Vc} m/min</b><br>
<b>S:</b> min(${S_theo},${nmax})=${S_act} rpm | <b>切りくず薄化:</b> ×${ctf.toFixed(2)}<br>
<b>係合角:</b> φ=${phiD.toFixed(1)}° | <b>Zeff:</b> ${ze.toFixed(2)}<br>
<b>hm:</b> ${hm.toFixed(4)} mm | <b>OH/D:</b> ${(OH/D).toFixed(2)} | <b>ohF:</b> ×${ohF.toFixed(3)}<br>
<b>fz_max物理:</b> ${p4(fz_max_phys)} | <b>fz_cat:</b> ${p4(fz_cat)}<br>
<b>確定fz=</b>min(${p4(fz_max_phys)}, ${p4(fz_cat)})=<b style="color:#ffd700">${p4(fz_real)} mm/刃</b><br>
<b>Taylor寿命:</b> T=${TaylorT.toFixed(0)} min @ Vc=${Vc} m/min
</p>`;
}

function calcM() {
  const D=n('m_D'), Z=parseInt(s('m_Z'))||4;
  const mat=s('m_mat'), proc=s('m_proc'), tool=s('m_tool');
  const ap=n('m_ap'), ae=n('m_ae'), L=n('m_L'), pass=parseInt(s('m_pass'))||1;
  const Pm=n('m_motor'), eta=n('m_eta'), nmax=n('m_nmax')||12000;
  const OH_inp=n('m_OH')||0;
  const cool=s('m_cool')||'wet';
  const tl=TOOL[tool], db=MAT[mat];
  const coolA=coolantAdjust(cool,mat,tool);
  // 【v4.2】ap/ae・油種を反映した実効Vc / 切りくず薄化を反映した送り
  const aeF=aeVcFactor(ae,D), apF=apVcFactor(ap,D), ctf=chipThinning(ae,D);
  const Vc_b=db.vcM[proc]*tl.vcF*coolA.vcF*aeF*apF;
  const S_t=Math.round(Vc_b*1000/(Math.PI*D));
  const S=Math.min(S_t,nmax);
  const Vc=Math.round(S*Math.PI*D/1000);
  const OH=OH_inp>0?OH_inp:3*D;
  const ohF=ohFactor(OH,D);
  const fz_mp=fzMaxMilling(ae,D,ap,Z,mat,tl.sigma,tl.rho,Vc,Pm,eta,OH)*ohF;
  const fz_c=(M_FZ_CAT[mat]||M_FZ_CAT.steel)[proc]*fzDiamFactor(D)*ohF*coolA.fzF*ctf;
  const fz=Math.min(fz_mp,fz_c);
  const F=Math.round(S*fz*Z);
  const FcT=FcTotal(fz,ae,D,ap,Z,mat);
  const Fc1=FcTooth(fz,ae,D,ap,mat);
  const Pc=(FcT*Vc)/(60*1000);
  const P_av=Pm*eta;
  const loadP=(Pc/P_av)*100;
  const hm=hmM(fz,ae,D);
  const ze=Zeff(Z,ae,D);
  const phiD2=phiDeg(ae,D);
  const Zsec=sectionModulusEM(D,Z);
  const M_all=tl.sigma*tl.rho*Zsec;
  const stressR=(Fc1*OH/M_all)*100;
  const MRR=(ap*ae*F/1000).toFixed(2);
  const sec=L*pass/F*60;
  const TaylorT=taylorLife(Vc,mat);
  // フラットエンドミル面粗さ: スキャロップ高さ h = ae²/(8D) [mm] → μm
  const Rz_scallop=(ae*ae/(8*D)*1000).toFixed(2);
  // 送り方向粗さ(参考): fz²/(8D)×1000 [μm] (近似)
  const Rz_feed=(fz*fz/(8*D)*1000).toFixed(3);

  const rh=document.getElementById('m_rh');
  rh.className=`result-header ${loadP>80?'warn-res':'ok-res'}`;
  document.getElementById('m_rg').innerHTML=`
    <div class="res-item res-hl"><div class="res-lbl">主軸回転数 S</div><div class="res-val">${S} rpm</div></div>
    <div class="res-item res-hl"><div class="res-lbl">🏆 送り速度 F (学術物理計算値)</div><div class="res-val">${F} mm/min</div></div>
    <div class="res-item"><div class="res-lbl">切削速度 Vc</div><div class="res-val">${Vc} m/min</div></div>
    <div class="res-item"><div class="res-lbl">確定 fz</div><div class="res-val">${p4(fz)} mm/刃</div></div>
    <div class="res-item"><div class="res-lbl">平均切削厚 hm</div><div class="res-val">${hm.toFixed(4)} mm</div></div>
    <div class="res-item"><div class="res-lbl">有効刃数 Zeff</div><div class="res-val">${ze.toFixed(2)} 刃</div></div>
    <div class="res-item"><div class="res-lbl">合計切削力 Fc</div><div class="res-val">${FcT.toFixed(0)} N</div></div>
    <div class="res-item"><div class="res-lbl">実動力 Pc</div><div class="res-val">${Pc.toFixed(2)} kW</div></div>
    <div class="res-item"><div class="res-lbl">機械負荷率</div><div class="res-val">${loadP.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">工具応力比</div><div class="res-val">${stressR.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">MRR</div><div class="res-val">${MRR} cm³/min</div></div>
    <div class="res-item"><div class="res-lbl">スキャロップ高さ Rz (段差)</div><div class="res-val">${Rz_scallop} μm</div></div>
    <div class="res-item"><div class="res-lbl">送り方向粗さ参考 Rz</div><div class="res-val">${Rz_feed} μm</div></div>
    <div class="res-item"><div class="res-lbl">Taylor工具寿命 T</div><div class="res-val">${TaylorT.toFixed(0)} min</div></div>
    <div class="res-item res-hl"><div class="res-lbl">切削時間</div><div class="res-val">${fmtT(sec)}</div></div>`;

  drawTaylor('m_taylor_svg', Vc, mat);
  document.getElementById('m_taylor_box').classList.remove('hidden');

  const wc=document.getElementById('m_warns'); wc.innerHTML='';
  if(loadP>80) wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ 機械高負荷</h3><p>ap/aeを低減推奨</p></div>';
  if(stressR>70) wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ 工具応力高</h3><p>突き出しを短く/切込み低減</p></div>';
  if(!vibFactor(OH,D).stable) wc.innerHTML+='<div class="info-box ib-yellow"><h3>⚠ びびり危険</h3><p>OH/D='+(OH/D).toFixed(2)+'。突き出し短縮・回転数微調整を推奨</p></div>';
  if(S>=nmax) wc.innerHTML+='<div class="info-box ib-blue"><h3>💡 回転数上限制限</h3><p>Vc上限が主軸最高回転数で制限されています</p></div>';
  if(fz<fz_c*0.9) wc.innerHTML+='<div class="info-box ib-purple"><h3>💡 物理上限適用</h3><p>カタログ値より物理上限が小さいため制限されています</p></div>';
  wc.innerHTML+=`<div class="info-box ib-blue"><h3>💧 クーラント: ${coolA.name}</h3><p>${coolA.desc}<br>適用係数: Vc×${coolA.vcF.toFixed(2)} ／ 送り×${coolA.fzF.toFixed(2)}。ae/D=${(ae/D).toFixed(2)}→Vc×${aeF.toFixed(2)}、切りくず薄化×${ctf.toFixed(2)}。</p></div>`;
  if(coolA.warn) wc.innerHTML+=`<div class="info-box ib-yellow"><h3>⚠ 油種の注意</h3><p>${coolA.warn}</p></div>`;

  document.getElementById('m_fml').textContent=
`【学術級切削条件計算 — ソリッドエンドミル詳細ログ】

▼ Step1: 切削速度 (ap/ae・油種を反映)
  Vc = ${db.vcM[proc]}(基準) × ${tl.vcF}(工具) × ${coolA.vcF.toFixed(2)}(油種:${coolA.name}) × ${aeF.toFixed(2)}(ae/D=${(ae/D).toFixed(2)}) × ${apF.toFixed(2)}(ap/D=${(ap/D).toFixed(2)})
     = ${Vc_b.toFixed(0)} m/min
  S_theo = Vc×1000/(π×D) = ${S_t} rpm → min(${S_t},${nmax}) = ${S} rpm
  Vc_actual = S×π×D/1000 = ${Vc} m/min
  ※ 切りくず薄化RCTF=×${ctf.toFixed(2)} を送りに反映（ae<D/2で送り増可）

▼ Step2: 突き出しOH/D補正
  OH = ${OH.toFixed(1)} mm / D = ${D} mm → OH/D = ${(OH/D).toFixed(2)}
  ohFactor = ${ohF.toFixed(3)} (剛性低下・びびり補正)
  振動安定性: ${vibFactor(OH,D).lv}

▼ Step3: 係合角・Zeff (厳密積分式)
  φ_eng = arccos(1-2×ae/D) = arccos(${(1-2*ae/D).toFixed(4)}) = ${phiD2.toFixed(3)}°
  Zeff = Z×φ_eng/(2π) = ${Z}×${phiD2.toFixed(3)}°/360° = ${ze.toFixed(4)} 刃

▼ Step4: 平均切削厚 hm (厳密式)
  hm = fz × 2sin(φ/2)/φ[rad] = ${p4(fz)}×${(2*Math.sin(phiD2/2*Math.PI/180)/(phiD2*Math.PI/180)).toFixed(4)} = ${hm.toFixed(5)} mm

▼ Step5: 工具断面強度(材料力学)
  コア径比: dc/D = ${coreRatioEM(Z)} (Z=${Z}刃)
  断面係数: Z_sec = π(D⁴-dc⁴)/(32D) = ${Zsec.toFixed(2)} mm³
  有効許容応力: σ_allow×ρ_impact = ${tl.sigma}×${tl.rho} = ${(tl.sigma*tl.rho).toFixed(0)} MPa
  許容曲げM: M_allow = σ×Z_sec = ${M_all.toFixed(0)} N·mm
  許容1刃切削力 = M_allow/OH = ${M_all.toFixed(0)}/${OH.toFixed(1)} = ${(M_all/OH).toFixed(0)} N

▼ Step6: 機械出力制約
  P_avail = ${Pm}×${eta} = ${P_av.toFixed(2)} kW
  Fc_max(motor) = P_avail×60000/Vc = ${(P_av*60000/Vc).toFixed(0)} N (合計)
  Fc_max(tool_bend) = M_allow/OH = ${M_all.toFixed(0)}/${OH.toFixed(1)} = ${(M_all/OH).toFixed(0)} N (1刃最大切削力)

▼ Step7: fz_max逆算 (Kienzle比切削抵抗式)
  Fc = Ks1×hm^(1-mc)×ap×Zeff  [hm=fz×C_ae]
  fz_max_phys (before ohF) = ${p4(fzMaxMilling(ae,D,ap,Z,mat,tl.sigma,tl.rho,Vc,Pm,eta,OH))} mm/刃
  ohF補正後: × ${ohF.toFixed(3)} = ${p4(fz_mp)} mm/刃

▼ Step8: カタログ基準 fz (径補正込み)
  fz_base = ${p4((M_FZ_CAT[mat]||M_FZ_CAT.steel)[proc])} mm/刃 (D=16mm基準)
  径補正係数 = ×${fzDiamFactor(D).toFixed(2)} (D=${D}mm)
  fz_cat = base×径補正×ohF = ${p4((M_FZ_CAT[mat]||M_FZ_CAT.steel)[proc])}×${fzDiamFactor(D).toFixed(2)}×${ohF.toFixed(3)} = ${p4(fz_c)} mm/刃
  確定 fz = min(${p4(fz_mp)}, ${p4(fz_c)}) = ${p4(fz)} mm/刃

▼ Step9: 主軸回転数・送り速度
  F = S×fz×Z = ${S}×${p4(fz)}×${Z} = ${F} mm/min

▼ Step10: 検証
  hm = ${hm.toFixed(5)} mm
  Fc(1刃) = ${db.Ks1}×${hm.toFixed(5)}^${(1-db.mc).toFixed(2)}×${ap} = ${Fc1.toFixed(1)} N
  曲げM = ${Fc1.toFixed(1)}×${OH.toFixed(1)} = ${(Fc1*OH).toFixed(0)} N·mm / 許容${M_all.toFixed(0)} N·mm (${stressR.toFixed(0)}%)
  Pc = ${FcT.toFixed(0)}×${Vc}/(60×1000) = ${Pc.toFixed(3)} kW / 負荷${loadP.toFixed(0)}%
  MRR = ap×ae×F/1000 = ${MRR} cm³/min
  Taylor工具寿命: T = ${db.C_T}/${Vc}^(${(1/db.n_T).toFixed(2)}) = ${TaylorT.toFixed(0)} min
  面粗さ(スキャロップ): Rz = ae²/(8×D)×1000 = ${ae}²/(8×${D})×1000 = ${Rz_scallop} μm
  面粗さ(送り方向参考): Rz = fz²/(8×D)×1000 = ${p4(fz)}²/(8×${D})×1000 = ${Rz_feed} μm`;

  document.getElementById('m_result_wrap').classList.remove('hidden');
  addCompare({type:'エンドミル',mat:db.name,D,Vc,S,fz:p4(fz),F,Fc:FcT.toFixed(0),Pc:Pc.toFixed(2),load:loadP.toFixed(0),MRR:MRR+' cm³/min',T:TaylorT.toFixed(0)+'min',ok:loadP<=80&&stressR<=80});
}

/* ================================================================
   ☆ フェイスミル refresh / calc
================================================================ */
function refreshFM() {
  const D=n('fm_D'), Z=n('fm_Z')||8;
  const mat=s('fm_mat'), grade=s('fm_grade'), kr_str=s('fm_kr');
  const ap=n('fm_ap'), ae=n('fm_ae');
  const Pm=n('fm_motor')||15, eta=n('fm_eta')||0.80;
  const nmax=n('fm_nmax')||6000;
  const kr=parseFloat(kr_str)||45;
  const nose=s('fm_nose');
  const gd=GRADE[grade]||GRADE.P20;
  const db=MAT[mat]||MAT.steel;
  const proc='rough';
  const cool=s('fm_cool')||'wet';
  const coolA=coolantAdjust(cool,mat,'coated');
  const aeF=(ae>0&&D>0)?aeVcFactor(Math.min(ae,D),D):1.0;
  const apF=(ap>0&&D>0)?apVcFactor(ap,D):1.0;
  const ctf=(ae>0&&D>0)?chipThinning(Math.min(ae,D),D):1.0;
  document.getElementById('fm_tool_desc').innerHTML=
    `<b>${gd.name}</b>: ${gd.desc}<br>アプローチ角κr=${kr}° | ノーズR=${nose==='W'?'ワイパー':nose+'mm'} | 💧${coolA.name}`;

  const Vc_base=db.vcM[proc]*gd.vcF*coolA.vcF*aeF*apF;
  const S_t=Math.round(Vc_base*1000/(Math.PI*Math.max(D,1)));
  const S=Math.min(S_t,nmax);
  const Vc=Math.round(S*Math.PI*Math.max(D,1)/1000);
  document.getElementById('fm_Vc').value=Vc;

  if(!D||D<=0||!ap||ap<=0||!ae||ae<=0){document.getElementById('fm_fz').value='';setBtn('fm_btn',false);return;}
  if(ae>D*1.0){/* OK for facemill */}

  // フェイスミルはOH不要→ボディ剛性はチップ保持で管理
  const fz_max_phys=fzMaxMilling(Math.min(ae,D),D,ap,Z,mat,GRADE[grade].vcF>2?520:440,0.65,Vc,Pm,eta,D*0.3);
  const fz_cat=(FM_FZ_CAT[mat]||FM_FZ_CAT.steel)['rough']*gd.fzF*coolA.fzF*ctf;
  const fz_kr=Math.min(fz_max_phys,fz_cat)*(1+0.3*(1-kr/90));
  const fz=Math.min(fz_kr,fz_cat*1.5);

  const ze=Zeff(Z,Math.min(ae,D),D);
  const phiD3=phiDeg(Math.min(ae,D),D);
  const hm=hmM(fz,Math.min(ae,D),D);
  const Fc1=FcTooth(fz,Math.min(ae,D),D,ap,mat);
  const FcT=FcTotal(fz,Math.min(ae,D),D,ap,Z,mat);
  const Pc=(FcT*Vc)/(60*1000);
  const loadP=(Pc/(Pm*eta))*100;
  const feasible=fz>=0.001&&loadP<=100;

  const items=[
    {l:'係合角φ',v:phiD3.toFixed(1)+'°'},
    {l:'Zeff',v:ze.toFixed(2)+'刃'},
    {l:'hm',v:hm.toFixed(4)+' mm'},
    {l:'合計切削力',v:FcT.toFixed(0)+' N'},
    {l:'実動力',v:Pc.toFixed(2)+' kW'},
    {l:'機械負荷',v:loadP.toFixed(0)+'%'},
    {l:'κr補正',v:(1+0.3*(1-kr/90)).toFixed(3)+'×'},
  ];
  setPhys('fm',items,feasible?`✅ 適正 ${loadP.toFixed(0)}%`:'🚫 出力超過',feasible?'ok':'crit');
  setFeedField('fm_fz',fz,!feasible?'ng':loadP>80?'warn':'ok');
  setBtn('fm_btn',feasible);

  document.getElementById('fm_rec_body').innerHTML=`
<p style="font-size:11px;line-height:1.9;color:var(--txt2)">
<b>${gd.name}</b> κr=${kr}° Nose=${nose}<br>
<b>fz_cat:</b> ${p4(fz_cat)} | <b>κr補正後:</b> ${p4(fz_kr)} | <b>確定:</b> <b style="color:#ffd700">${p4(fz)} mm/刃</b><br>
<b>Vc:</b> ${Vc} m/min(油種×${coolA.vcF.toFixed(2)}・ae/D×${aeF.toFixed(2)}) | <b>S:</b> ${S} rpm | <b>Zeff:</b> ${ze.toFixed(2)}<br>
<b>φ:</b> ${phiD3.toFixed(1)}° | <b>hm:</b> ${hm.toFixed(4)} mm | <b>負荷:</b> ${loadP.toFixed(0)}%
${coolA.warn?`<br><span style="color:#fca5a5">${coolA.warn}</span>`:''}
</p>`;
}

function calcFM() {
  const D=n('fm_D'), Z=n('fm_Z')||8;
  const mat=s('fm_mat'), grade=s('fm_grade'), kr_str=s('fm_kr');
  const ap=n('fm_ap'), ae=n('fm_ae'), L=n('fm_L')||200;
  const Pm=n('fm_motor'), eta=n('fm_eta'), nmax=n('fm_nmax')||6000;
  const kr=parseFloat(kr_str)||45;
  const nose=s('fm_nose');
  const gd=GRADE[grade]||GRADE.P20, db=MAT[mat]||MAT.steel;
  const cool=s('fm_cool')||'wet', coolA=coolantAdjust(cool,mat,'coated');
  const aeF=aeVcFactor(Math.min(ae,D),D), apF=apVcFactor(ap,D), ctf=chipThinning(Math.min(ae,D),D);
  const Vc_b=db.vcM['rough']*gd.vcF*coolA.vcF*aeF*apF;
  const S_t=Math.round(Vc_b*1000/(Math.PI*D));
  const S=Math.min(S_t,nmax);
  const Vc=Math.round(S*Math.PI*D/1000);
  const fz_max=fzMaxMilling(Math.min(ae,D),D,ap,Z,mat,gd.vcF>2?520:440,0.65,Vc,Pm,eta,D*0.3);
  const fz_cat=(FM_FZ_CAT[mat]||FM_FZ_CAT.steel)['rough']*gd.fzF*coolA.fzF*ctf;
  const fz_kr=Math.min(fz_max,fz_cat)*(1+0.3*(1-kr/90));
  const fz=Math.min(fz_kr,fz_cat*1.5);
  const F=Math.round(S*fz*Z);
  const FcT=FcTotal(fz,Math.min(ae,D),D,ap,Z,mat);
  const Pc=(FcT*Vc)/(60*1000);
  const loadP=(Pc/(Pm*eta))*100;
  const MRR=(ap*Math.min(ae,D)*F/1000).toFixed(2);
  const sec=L/F*60;
  const reVal=nose==='W'?0.8:parseFloat(nose);
  const Rz=theorRz(fz,reVal).toFixed(1);
  const TaylorT=taylorLife(Vc,mat);

  document.getElementById('fm_rg').innerHTML=`
    <div class="res-item res-hl"><div class="res-lbl">主軸回転数 S</div><div class="res-val">${S} rpm</div></div>
    <div class="res-item res-hl"><div class="res-lbl">🏆 送り速度 F</div><div class="res-val">${F} mm/min</div></div>
    <div class="res-item"><div class="res-lbl">切削速度 Vc</div><div class="res-val">${Vc} m/min</div></div>
    <div class="res-item"><div class="res-lbl">確定 fz</div><div class="res-val">${p4(fz)} mm/刃</div></div>
    <div class="res-item"><div class="res-lbl">合計切削力</div><div class="res-val">${FcT.toFixed(0)} N</div></div>
    <div class="res-item"><div class="res-lbl">実動力 Pc</div><div class="res-val">${Pc.toFixed(2)} kW</div></div>
    <div class="res-item"><div class="res-lbl">機械負荷率</div><div class="res-val">${loadP.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">κr補正係数</div><div class="res-val">×${(1+0.3*(1-kr/90)).toFixed(3)}</div></div>
    <div class="res-item"><div class="res-lbl">理論面粗さ Rz</div><div class="res-val">${nose==='W'?'ワイパー鏡面':Rz+' μm'}</div></div>
    <div class="res-item"><div class="res-lbl">MRR</div><div class="res-val">${MRR} cm³/min</div></div>
    <div class="res-item"><div class="res-lbl">Taylor工具寿命</div><div class="res-val">${TaylorT.toFixed(0)} min</div></div>
    <div class="res-item res-hl"><div class="res-lbl">切削時間</div><div class="res-val">${fmtT(sec)}</div></div>`;
  const wc=document.getElementById('fm_warns');wc.innerHTML='';
  if(nose==='W') wc.innerHTML+='<div class="info-box ib-green"><h3>✅ ワイパーチップ</h3><p>理論面粗さは通常の1/4以下を実現。送りを2倍にしても同等粗さを維持できます。fz×2での再計算を推奨。</p></div>';
  if(loadP>80) wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ 高負荷</h3><p>ap/aeを低減推奨</p></div>';
  document.getElementById('fm_fml').textContent=
`【チップ式フェイスミル 学術計算ログ】
チップ材種: ${gd.name} | κr: ${kr}° | ノーズ: ${nose}
Vc = ${db.vcM['rough']}×${gd.vcF}(gr)=${Vc} m/min | S=${S} rpm
fz_cat_base = ${p4((FM_FZ_CAT[mat]||FM_FZ_CAT.steel)['rough'])} × fzFactor${gd.fzF} = ${p4(fz_cat)}
κr補正: ×${(1+0.3*(1-kr/90)).toFixed(3)} (κr小→fz増加)
確定 fz = ${p4(fz)} mm/刃 | F = ${F} mm/min
Fc = ${FcT.toFixed(0)} N | Pc = ${Pc.toFixed(2)} kW | 負荷 ${loadP.toFixed(0)}%
MRR = ${MRR} cm³/min | Rz(理論) = ${nose==='W'?'ワイパー補正':Rz+' μm'}
Taylor工具寿命 T = ${TaylorT.toFixed(0)} min`;
  document.getElementById('fm_result_wrap').classList.remove('hidden');
  addCompare({type:'フェイスミル',mat:(MAT[mat]||MAT.steel).name,D,Vc,S,fz:p4(fz),F,Fc:FcT.toFixed(0),Pc:Pc.toFixed(2),load:loadP.toFixed(0),MRR:MRR+' cm³/min',T:TaylorT.toFixed(0)+'min',ok:loadP<=80});
}

/* ================================================================
   ☆ インデキサブルエンドミル refresh / calc
================================================================ */
function refreshIE() {
  const D=n('ie_D'), Z=n('ie_Z')||2;
  const mat=s('ie_mat'), grade=s('ie_grade'), kr=parseFloat(s('ie_kr'))||45;
  const ap=n('ie_ap'), ae=n('ie_ae'), proc=s('ie_proc');
  const Pm=n('ie_motor')||11, eta=n('ie_eta')||0.80;
  const nmax=n('ie_nmax')||8000;
  const shape=s('ie_shape');
  const re=parseFloat(s('ie_re'))||0.8;
  const gd=GRADE[grade]||GRADE.P20, db=MAT[mat]||MAT.steel;
  const cool=s('ie_cool')||'wet', coolA=coolantAdjust(cool,mat,'coated');
  const aeF=(ae>0&&D>0)?aeVcFactor(Math.min(ae,D),D):1.0;
  const apF=(ap>0&&D>0)?apVcFactor(ap,D):1.0;
  const ctf=(ae>0&&D>0)?chipThinning(Math.min(ae,D),D):1.0;

  document.getElementById('ie_tool_desc').innerHTML=
    `<b>${gd.name}</b>: ${gd.desc}<br>形状:${shape} κr=${kr}° Rε=${re}mm | 💧${coolA.name}`;

  const Vc_b=db.vcM[proc]*gd.vcF*coolA.vcF*aeF*apF;
  const S_t=Math.round(Vc_b*1000/(Math.PI*Math.max(D,1)));
  const S=Math.min(S_t,nmax);
  const Vc=Math.round(S*Math.PI*Math.max(D,1)/1000);
  document.getElementById('ie_Vc').value=Vc;

  if(!D||D<=0||!ap||ap<=0||!ae||ae<=0){setBtn('ie_btn',false);document.getElementById('ie_fz').value='';return;}

  // インデキサブルはソリッドより剛性が低い(チップ取付部)→σを下げる
  const fz_max=fzMaxMilling(Math.min(ae,D),D,ap,Z,mat,380*gd.fzF,0.65,Vc,Pm,eta,D*0.5);
  const fz_cat=(FM_FZ_CAT[mat]||FM_FZ_CAT.steel)[proc]*gd.fzF*(1+0.2*(1-kr/90))*coolA.fzF*ctf;
  const fz=Math.min(fz_max,fz_cat);

  const FcT=FcTotal(fz,Math.min(ae,D),D,ap,Z,mat);
  const Pc=(FcT*Vc)/(60*1000);
  const loadP=(Pc/(Pm*eta))*100;
  const hm=hmM(fz,Math.min(ae,D),D);
  const phiD4=phiDeg(Math.min(ae,D),D);
  const Rz=theorRz(fz,re).toFixed(1);
  const feasible=fz>=0.001&&loadP<=100;

  const items=[
    {l:'係合角',v:phiD4.toFixed(1)+'°'},
    {l:'hm',v:hm.toFixed(4)+' mm'},
    {l:'切削力',v:FcT.toFixed(0)+' N'},
    {l:'実動力',v:Pc.toFixed(2)+' kW'},
    {l:'機械負荷',v:loadP.toFixed(0)+'%'},
    {l:'理論面粗さ',v:Rz+' μm'},
  ];
  setPhys('ie',items,feasible?`✅ 適正 ${loadP.toFixed(0)}%`:'🚫 加工不可',feasible?'ok':'crit');
  setFeedField('ie_fz',fz,!feasible?'ng':loadP>80?'warn':'ok');
  setBtn('ie_btn',feasible);

  document.getElementById('ie_rec_body').innerHTML=`
<p style="font-size:11px;line-height:1.9;color:var(--txt2)">
${gd.name} | κr=${kr}° | Rε=${re}mm | 形状:${shape}<br>
<b>fz_max:</b> ${p4(fz_max)} | <b>fz_cat:</b> ${p4(fz_cat)}<br>
<b>確定fz:</b> <b style="color:#ffd700">${p4(fz)} mm/刃</b> | <b>負荷:</b> ${loadP.toFixed(0)}%<br>
<b>理論Rz:</b> ${Rz} μm
</p>`;
}

function calcIE() {
  const D=n('ie_D'), Z=n('ie_Z')||2;
  const mat=s('ie_mat'), grade=s('ie_grade'), kr=parseFloat(s('ie_kr'))||45;
  const ap=n('ie_ap'), ae=n('ie_ae'), proc=s('ie_proc');
  const Pm=n('ie_motor'), eta=n('ie_eta'), nmax=n('ie_nmax')||8000;
  const re=parseFloat(s('ie_re'))||0.8;
  const gd=GRADE[grade]||GRADE.P20, db=MAT[mat]||MAT.steel;
  const cool=s('ie_cool')||'wet', coolA=coolantAdjust(cool,mat,'coated');
  const aeF=aeVcFactor(Math.min(ae,D),D), apF=apVcFactor(ap,D), ctf=chipThinning(Math.min(ae,D),D);
  const Vc_b=db.vcM[proc]*gd.vcF*coolA.vcF*aeF*apF;
  const S_t=Math.round(Vc_b*1000/(Math.PI*D));
  const S=Math.min(S_t,nmax);
  const Vc=Math.round(S*Math.PI*D/1000);
  const fz_max=fzMaxMilling(Math.min(ae,D),D,ap,Z,mat,380*gd.fzF,0.65,Vc,Pm,eta,D*0.5);
  const fz_cat=(FM_FZ_CAT[mat]||FM_FZ_CAT.steel)[proc]*gd.fzF*(1+0.2*(1-kr/90))*coolA.fzF*ctf;
  const fz=Math.min(fz_max,fz_cat);
  const F=Math.round(S*fz*Z);
  const FcT=FcTotal(fz,Math.min(ae,D),D,ap,Z,mat);
  const Pc=(FcT*Vc)/(60*1000);
  const loadP=(Pc/(Pm*eta))*100;
  const MRR=(ap*Math.min(ae,D)*F/1000).toFixed(2);
  const Rz=theorRz(fz,re).toFixed(1);
  const TaylorT=taylorLife(Vc,mat);

  document.getElementById('ie_rg').innerHTML=`
    <div class="res-item res-hl"><div class="res-lbl">主軸回転数 S</div><div class="res-val">${S} rpm</div></div>
    <div class="res-item res-hl"><div class="res-lbl">🏆 送り速度 F</div><div class="res-val">${F} mm/min</div></div>
    <div class="res-item"><div class="res-lbl">Vc</div><div class="res-val">${Vc} m/min</div></div>
    <div class="res-item"><div class="res-lbl">確定 fz</div><div class="res-val">${p4(fz)} mm/刃</div></div>
    <div class="res-item"><div class="res-lbl">切削力</div><div class="res-val">${FcT.toFixed(0)} N</div></div>
    <div class="res-item"><div class="res-lbl">実動力</div><div class="res-val">${Pc.toFixed(2)} kW</div></div>
    <div class="res-item"><div class="res-lbl">機械負荷</div><div class="res-val">${loadP.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">理論面粗さ Rz</div><div class="res-val">${Rz} μm</div></div>
    <div class="res-item"><div class="res-lbl">MRR</div><div class="res-val">${MRR} cm³/min</div></div>
    <div class="res-item res-hl"><div class="res-lbl">Taylor工具寿命</div><div class="res-val">${TaylorT.toFixed(0)} min</div></div>`;
  const wc=document.getElementById('ie_warns');wc.innerHTML='';
  if(loadP>80) wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ 高負荷</h3><p>ap/aeを低減推奨</p></div>';
  document.getElementById('ie_fml').textContent=
`【チップ式エンドミル計算ログ】
${gd.name} | κr=${kr}° | Rε=${re}mm
Vc=${Vc} m/min | S=${S} rpm
fz=${p4(fz)} mm/刃 | F=${F} mm/min
Fc=${FcT.toFixed(0)} N | Pc=${Pc.toFixed(2)} kW | 負荷${loadP.toFixed(0)}%
Rz=${Rz} μm | MRR=${MRR} cm³/min | T=${TaylorT.toFixed(0)} min`;
  document.getElementById('ie_result_wrap').classList.remove('hidden');
  addCompare({type:'インデキサブルEM',mat:db.name,D,Vc,S,fz:p4(fz),F,Fc:FcT.toFixed(0),Pc:Pc.toFixed(2),load:loadP.toFixed(0),MRR:MRR+' cm³/min',T:TaylorT.toFixed(0)+'min',ok:loadP<=80});
}

/* ================================================================
   ☆ 高送りミル refresh / calc
================================================================ */
function refreshHF() {
  const D=n('hf_D'), Z=n('hf_Z')||4;
  const mat=s('hf_mat'), grade=s('hf_grade'), kr=parseFloat(s('hf_kr'))||15;
  const ap=n('hf_ap')||1.0, ae=n('hf_ae');
  const Pm=n('hf_motor')||11, eta=n('hf_eta')||0.82;
  const nmax=n('hf_nmax')||8000, proc=s('hf_proc');
  const gd=GRADE[grade]||GRADE.P20, db=MAT[mat]||MAT.steel;
  const cool=s('hf_cool')||'wet', coolA=coolantAdjust(cool,mat,'coated');
  const aeF=(ae>0&&D>0)?aeVcFactor(Math.min(ae,D),D):1.0;

  const hfF=hfFzFactor(kr);
  const axR=krAxialRatio(kr);
  document.getElementById('hf_tool_desc').innerHTML=
    `アプローチ角 κr=${kr}° | ${gd.name} | ${gd.desc} | 💧${coolA.name}`;
  document.getElementById('hf_kr_explain').innerHTML=
    `<b>κr=${kr}°での物理解析:</b><br>
    切削力の軸方向成分比: <b style="color:#ffd700">${(axR*100).toFixed(1)}%</b> (スピンドル軸で受ける→剛性高い)<br>
    径方向成分比: <b style="color:#fca5a5">${(Math.sin(kr*Math.PI/180)*100).toFixed(1)}%</b> (主軸横方向→低く抑制)<br>
    高送り倍率: <b style="color:#86efac">×${hfF.toFixed(2)}</b> (通常エンドミル比)<br>
    📌 原理: κr↓→切削厚さh=fz×sin(κr)↓→同じ切削力でより大きなfzが可能`;

  const Vc_b=db.vcM[proc]*gd.vcF*1.1*coolA.vcF*aeF;
  const S_t=Math.round(Vc_b*1000/(Math.PI*Math.max(D,1)));
  const S=Math.min(S_t,nmax);
  const Vc=Math.round(S*Math.PI*Math.max(D,1)/1000);
  document.getElementById('hf_Vc').value=Vc;

  if(!D||D<=0){setBtn('hf_btn',false);document.getElementById('hf_fz').value='';return;}

  // 高送りの実効切削厚 h_eff = fz × sin(κr)
  // Fc = Ks1 × h_eff^(1-mc) × ap × Zeff
  // より大きなfzが可能な理由: sin(κr)が小さいためhmが小さく力が低下
  const sinKr=Math.sin(kr*Math.PI/180);
  const Fc_max_m=(Pm*eta*1000*60)/Vc;
  const ze=Zeff(Z,Math.min(ae,D),D);
  const rhs=Fc_max_m/(db.Ks1*Math.pow(sinKr,1-db.mc)*ap*(ze||1));
  const fz_phys=rhs>0?Math.pow(rhs,1/(1-db.mc)):0;
  const fz_cat_std=(M_FZ_CAT[mat]||M_FZ_CAT.steel)[proc];
  const fz_hf=Math.min(fz_phys, fz_cat_std*hfF*coolA.fzF);

  const h_eff=fz_hf*sinKr;
  const Fc1=db.Ks1*Math.pow(h_eff,1-db.mc)*ap;
  const FcT_axial=Fc1*ze;
  const Pc=(FcT_axial*Vc)/(60*1000);
  const loadP=(Pc/(Pm*eta))*100;
  const feasible=fz_hf>=0.001&&loadP<=100;

  const items=[
    {l:'κr',v:kr+'°'},
    {l:'高送り倍率',v:'×'+hfF.toFixed(2)},
    {l:'実効切削厚h_eff',v:h_eff.toFixed(4)+' mm'},
    {l:'軸方向力比',v:(axR*100).toFixed(0)+'%'},
    {l:'合計切削力',v:FcT_axial.toFixed(0)+' N'},
    {l:'実動力',v:Pc.toFixed(2)+' kW'},
    {l:'機械負荷',v:loadP.toFixed(0)+'%'},
    {l:'fz(通常比)',v:'×'+hfF.toFixed(1)},
  ];
  setPhys('hf',items,feasible?`✅ 高送り適正 負荷${loadP.toFixed(0)}% / fz×${hfF.toFixed(1)}倍`:'🚫 加工不可',feasible?'ok':'crit');
  setFeedField('hf_fz',fz_hf,!feasible?'ng':loadP>80?'warn':'ok');
  setBtn('hf_btn',feasible);

  document.getElementById('hf_rec_body').innerHTML=`
<p style="font-size:11px;line-height:1.9;color:var(--txt2)">
<b>κr=${kr}° → sin(κr)=${sinKr.toFixed(4)} → 実効切削厚係数</b><br>
<b>fz_phys:</b> ${p4(fz_phys)} | <b>fz_cat×倍率:</b> ${p4(fz_cat_std*hfF)}<br>
<b>確定fz:</b> <b style="color:#ffd700">${p4(fz_hf)} mm/刃</b> (通常の${hfF.toFixed(1)}倍)<br>
<b>負荷:</b> ${loadP.toFixed(0)}% | <b>軸方向力比:</b> ${(axR*100).toFixed(0)}%
</p>`;
}

function calcHF() {
  const D=n('hf_D'), Z=n('hf_Z')||4;
  const mat=s('hf_mat'), grade=s('hf_grade'), kr=parseFloat(s('hf_kr'))||15;
  const ap=n('hf_ap')||1.0, ae=n('hf_ae');
  const Pm=n('hf_motor'), eta=n('hf_eta'), nmax=n('hf_nmax')||8000, proc=s('hf_proc');
  const gd=GRADE[grade]||GRADE.P20, db=MAT[mat]||MAT.steel;
  const cool=s('hf_cool')||'wet', coolA=coolantAdjust(cool,mat,'coated');
  const aeF=aeVcFactor(Math.min(ae,D),D);
  const hfF=hfFzFactor(kr);
  const axR=krAxialRatio(kr);
  const sinKr=Math.sin(kr*Math.PI/180);
  const Vc_b=db.vcM[proc]*gd.vcF*1.1*coolA.vcF*aeF;
  const S_t=Math.round(Vc_b*1000/(Math.PI*D));
  const S=Math.min(S_t,nmax);
  const Vc=Math.round(S*Math.PI*D/1000);
  const Fc_max_m=(Pm*eta*1000*60)/Vc;
  const ze=Zeff(Z,Math.min(ae,D),D);
  const rhs=Fc_max_m/(db.Ks1*Math.pow(sinKr,1-db.mc)*ap*(ze||1));
  const fz_phys=rhs>0?Math.pow(rhs,1/(1-db.mc)):0;
  const fz_cat_std=(M_FZ_CAT[mat]||M_FZ_CAT.steel)[proc];
  const fz=Math.min(fz_phys,fz_cat_std*hfF*coolA.fzF);
  const F=Math.round(S*fz*Z);
  const h_eff=fz*sinKr;
  const Fc1=db.Ks1*Math.pow(h_eff,1-db.mc)*ap;
  const FcT=Fc1*ze;
  const Pc=(FcT*Vc)/(60*1000);
  const loadP=(Pc/(Pm*eta))*100;
  const MRR=(ap*Math.min(ae,D)*F/1000).toFixed(2);
  const TaylorT=taylorLife(Vc,mat);
  const stdFz=fz_cat_std;
  const stdF=Math.round(S*stdFz*Z);

  document.getElementById('hf_rg').innerHTML=`
    <div class="res-item res-hl"><div class="res-lbl">主軸回転数 S</div><div class="res-val">${S} rpm</div></div>
    <div class="res-item res-hl"><div class="res-lbl">⚡ 高送り速度 F</div><div class="res-val">${F} mm/min</div></div>
    <div class="res-item"><div class="res-lbl">Vc</div><div class="res-val">${Vc} m/min</div></div>
    <div class="res-item"><div class="res-lbl">確定 fz (高送り)</div><div class="res-val">${p4(fz)} mm/刃</div></div>
    <div class="res-item"><div class="res-lbl">通常エンドミル比</div><div class="res-val">× ${(fz/stdFz).toFixed(1)} 倍</div></div>
    <div class="res-item"><div class="res-lbl">実効切削厚 h_eff</div><div class="res-val">${h_eff.toFixed(4)} mm</div></div>
    <div class="res-item"><div class="res-lbl">軸方向力比</div><div class="res-val">${(axR*100).toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">径方向力比</div><div class="res-val">${(sinKr*100).toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">切削力</div><div class="res-val">${FcT.toFixed(0)} N</div></div>
    <div class="res-item"><div class="res-lbl">実動力 Pc</div><div class="res-val">${Pc.toFixed(2)} kW</div></div>
    <div class="res-item"><div class="res-lbl">機械負荷率</div><div class="res-val">${loadP.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">MRR (高送り)</div><div class="res-val">${MRR} cm³/min</div></div>
    <div class="res-item"><div class="res-lbl">通常時F(参考)</div><div class="res-val">${stdF} mm/min</div></div>
    <div class="res-item res-hl"><div class="res-lbl">高送りによるMRR向上</div><div class="res-val">× ${(F/stdF).toFixed(1)} 倍</div></div>`;

  const wc=document.getElementById('hf_warns');wc.innerHTML='';
  wc.innerHTML+=`<div class="info-box ib-green"><h3>⚡ 高送り効果</h3><p>通常エンドミル(${stdF}mm/min)比<b>${(F/stdF).toFixed(1)}倍</b>のMRRを実現。ap=${ap}mmの薄切りで高能率加工。</p></div>`;
  if(loadP>80) wc.innerHTML+='<div class="info-box ib-yellow"><h3>⚠ 高負荷</h3><p>ap低減またはae低減を推奨</p></div>';

  document.getElementById('hf_fml').textContent=
`【高送りミル 学術物理計算ログ】

▼ 高送り原理 (アプローチ角κr=${kr}°)
  実効切削厚 h_eff = fz × sin(κr) = fz × sin(${kr}°) = fz × ${sinKr.toFixed(4)}
  → κrが小さいほどh_effが小さく、同じ切削力でより大きなfzが可能

▼ 切削力方向分解
  軸方向成分比 = cos(κr) = ${(axR*100).toFixed(1)}% ← スピンドル剛性が受ける
  径方向成分比 = sin(κr) = ${(sinKr*100).toFixed(1)}% ← 横方向振動リスク

▼ fz_max逆算
  Fc_max(motor) = ${(Pm*eta*1000*60/Vc).toFixed(0)} N
  Fc = Ks1×h_eff^(1-mc)×ap×Zeff
  fz_phys = ${p4(fz_phys)} mm/刃
  fz_cat×hfFactor(${hfF.toFixed(2)}) = ${p4(fz_cat_std*hfF)} mm/刃
  確定 fz = ${p4(fz)} mm/刃

▼ 通常エンドミル比較
  通常fz = ${p4(stdFz)} mm/刃 → 高送りfz = ${p4(fz)} mm/刃 (${(fz/stdFz).toFixed(1)}倍)
  通常F = ${stdF} mm/min → 高送りF = ${F} mm/min (${(F/stdF).toFixed(1)}倍)
  MRR向上率: ${(F/stdF).toFixed(1)}倍`;
  document.getElementById('hf_result_wrap').classList.remove('hidden');
  addCompare({type:'高送りミル',mat:db.name,D,Vc,S,fz:p4(fz),F,Fc:FcT.toFixed(0),Pc:Pc.toFixed(2),load:loadP.toFixed(0),MRR:MRR+' cm³/min',T:TaylorT.toFixed(0)+'min',ok:loadP<=80});
}
