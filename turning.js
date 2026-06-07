'use strict';
/* ============================================================
   turning.js — 旋盤加工
   依存: core.js
   ============================================================ */

const T_F_CAT = {
  al:{rough:0.35,semi:0.22,finish:0.12},     al7075:{rough:0.32,semi:0.20,finish:0.11},
  steel:{rough:0.28,semi:0.18,finish:0.10},  steel_h:{rough:0.20,semi:0.13,finish:0.07},
  steel_hh:{rough:0.07,semi:0.05,finish:0.03},
  sus304:{rough:0.18,semi:0.12,finish:0.07}, sus316:{rough:0.15,semi:0.10,finish:0.06},
  cast:{rough:0.32,semi:0.20,finish:0.11},   ti:{rough:0.12,semi:0.08,finish:0.05},
  ni:{rough:0.06,semi:0.04,finish:0.025},    cu:{rough:0.40,semi:0.25,finish:0.14},
};

/* 旋盤 Fc */
function turningFc(f, ap, mat, kr_deg) {
  const db = MAT[mat];
  const Kc = 1 + 0.15*Math.cos((kr_deg||75)*Math.PI/180); // κr補正
  return db.Ks1*Math.pow(f,1-db.mc)*ap*Kc;
}

/* 旋盤 f_max */
function fMaxTurning(ap, mat, toolKey, Vc, Pm, eta, kr_deg) {
  const db = MAT[mat];
  const tl = TOOL[toolKey];
  const Fc_motor = (Pm*eta*1000*60)/Vc;
  const b_s=20, h_s=20;
  const Z_shank = b_s*h_s*h_s/6;
  const M_all = tl.sigma*tl.rho*Z_shank;
  const Fc_tool = M_all/(2.5*h_s);
  const Fc_max = Math.min(Fc_motor, Fc_tool);
  const Kc = 1+0.15*Math.cos((kr_deg||75)*Math.PI/180);
  const rhs = Fc_max/(db.Ks1*ap*Kc);
  if(rhs<=0) return {f:0,Fc_max_motor:Fc_motor,Fc_max_tool:Fc_tool,Fc_max};
  const f = Math.pow(rhs, 1/(1-db.mc));
  return {f, Fc_max_motor:Fc_motor, Fc_max_tool:Fc_tool, Fc_max};
}

/* ================================================================
   ☆ 旋盤 refresh / calc
================================================================ */
function refreshT() {
  const D=n('t_D'), ap=n('t_ap');
  const mat=s('t_mat'), proc=s('t_proc'), tool=s('t_tool');
  const kr=parseFloat(s('t_kr'))||75, re=parseFloat(s('t_re'))||0.8;
  const mode=s('t_mode');
  const shape=s('t_shape')||'C';
  const Pm=n('t_motor')||11, eta=n('t_eta')||0.80;
  const torqMax=n('t_torque_max')||200;
  const tl=TOOL[tool], db=MAT[mat]||MAT.steel;
  // 【v4.2】油種・切込みap を Vc/送りに反映（重切削=低速、油種で速度・送り・寿命が変わる）
  const cool=s('t_cool')||'wet';
  const iscar=s('t_iscar')||'none';
  const coolA=coolantAdjust(cool,mat,tool);
  const ig=ISCAR_GRADES[iscar]||ISCAR_GRADES.none;
  const shp=insertShapeAdjust(shape, ap, 0, kr);   // インサート形状(当たり面=刃先強度)
  const apTF=ap>0?interp(ap,[[0.5,1.06],[1,1.02],[2,1.00],[3,0.95],[5,0.88],[8,0.80],[12,0.72]]):1.0;

  document.getElementById('t_tool_desc').innerHTML=
    `<b>${tl.name}</b>: ${tl.desc}<br>🔷 形状 <b>${shp.name}</b>（ノーズ角 εr=${shp.epsTxt}・送り係数×${shp.strF.toFixed(2)}）<br>${shp.sh.desc}<br>κr=${kr}° | Rε=${re}mm | モード:${mode} | 💧${coolA.name}${getToolChips(tool)}`
    +(iscar!=='none'?`<br>🔶 <b>${ig.name}</b> [ISO ${ig.iso}] — ${ig.desc}<br><span style="color:var(--txt3)">推奨: ${iscarLineHint(mat,'turn')}（ITA要確認）</span>`:'');

  // ISCARグレード選択時はベースVcをISCAR推奨(現行コート超硬)に切替
  const Vc_base0=(iscar!=='none')?iscarVcRec(mat,'turn',proc):db.vcT[proc]*tl.vcF;
  const Vc_b=Vc_base0*coolA.vcF*apTF;
  document.getElementById('t_Vc').value=Math.round(Vc_b);

  if(!D||D<=0||!ap||ap<=0){document.getElementById('t_f').value='';setBtn('t_btn',false);
    document.getElementById('t_feed_panel').innerHTML='ワーク径と切込みを入力すると表示されます';return;}

  const Vc=Math.round(Vc_b);
  const res=fMaxTurning(ap,mat,tool,Vc,Pm,eta,kr);
  const f_base=(T_F_CAT[mat]||T_F_CAT.steel)[proc];
  const f_cat=f_base*coolA.fzF*shp.strF;          // 形状(刃先強度)で送りを補正
  const f_real=Math.min(res.f, f_cat);

  const S=Math.round(Vc*1000/(Math.PI*D));
  const F=Math.round(S*f_real);
  const b_eng=ap>0?ap/Math.sin(kr*Math.PI/180):0;  // 当たり面(切れ刃係合長)
  const area=ap*f_real;                            // 切りくず断面積

  // 面粗さ
  const Rz=theorRz(f_real,re);
  const Ra_theo=(Rz/4).toFixed(3);
  document.getElementById('t_roughness_val').textContent=
    `Rz = f²/(8×rε)×1000 = ${f_real.toFixed(4)}²/(8×${re})×1000 = ${Rz.toFixed(2)} μm | Ra≈${Ra_theo} μm`;

  // 送り換算パネル（f → F ＋ 形状・当たり面）
  document.getElementById('t_feed_panel').innerHTML=
    `🔷 形状 <b>${shp.name}</b>｜ノーズ角 εr=<b>${shp.epsTxt}</b>｜当たり面(切れ刃係合長) b=ap/sinκr=<b>${b_eng.toFixed(2)} mm</b>｜切りくず断面 A=ap×f=<b>${area.toFixed(3)} mm²</b><br>`+
    `送り f：カタログ${p4(f_base)}×油種${coolA.fzF.toFixed(2)}×<b>形状${shp.strF.toFixed(2)}</b> ⇒ <b style="color:#ffd700">${p4(f_real)} mm/rev</b><br>`+
    `<b>F送り換算：F = f×S = ${p4(f_real)}×${S} = <span style="color:#ffd700">${F} mm/min</span></b>　(S=1000×Vc/πD=${S} rpm)`;

  const Fc=turningFc(f_real,ap,mat,kr);
  const Pc=(Fc*Vc)/(60*1000);
  const P_av=Pm*eta;
  const loadP=(Pc/P_av)*100;
  const toolStress=Fc/res.Fc_max_tool;
  const TaylorT=taylorLife(Vc,mat);

  // トルクチェック
  const Torq=Fc*(D/2)/1000; // N·m
  const torqRatio=Torq/torqMax;

  const feasible=f_real>=0.003&&toolStress<=1.0&&loadP<=100&&torqRatio<=1.0;

  const items=[
    {l:'主軸回転 S',v:S+' rpm'},
    {l:'送り速度 F',v:F+' mm/min'},
    {l:'ノーズ角 εr',v:shp.epsTxt},
    {l:'当たり面 係合長b',v:b_eng.toFixed(2)+' mm'},
    {l:'形状送り係数',v:'×'+shp.strF.toFixed(2)},
    {l:'実切削力Fc',v:Fc.toFixed(0)+' N'},
    {l:'実動力',v:Pc.toFixed(2)+' kW'},
    {l:'機械負荷',v:loadP.toFixed(0)+'%'},
    {l:'工具応力比',v:(toolStress*100).toFixed(0)+'%'},
    {l:'スピンドルトルク',v:Torq.toFixed(1)+' N·m'},
    {l:'Taylor寿命',v:TaylorT.toFixed(0)+' min'},
    {l:'理論Rz',v:Rz.toFixed(2)+' μm'},
  ];
  let st,vt;
  if(!feasible){st='crit';vt='🚫 加工不可';}
  else if(toolStress>0.80||loadP>80||torqRatio>0.90){st='warn';vt=`⚠ 高負荷 ${loadP.toFixed(0)}% / 応力${(toolStress*100).toFixed(0)}%`;}
  else{st='ok';vt=`✅ 適正 F=${F}mm/min / 負荷${loadP.toFixed(0)}% / Rz${Rz.toFixed(1)}μm`;}
  setPhys('t',items,vt,st);
  drawBar('t_bar_load','t_pct_load',loadP);
  drawBar('t_bar_stress','t_pct_stress',toolStress*100);
  setFeedField('t_f',f_real,!feasible?'ng':toolStress>0.80||loadP>80?'warn':'ok');
  setBtn('t_btn',feasible);

  document.getElementById('t_rec_body').innerHTML=`
<p style="font-size:11px;line-height:1.9;color:var(--txt2)">
<b>${iscar!=='none'?ig.name:tl.name}</b> | 🔷${shp.name} εr=${shp.epsTxt} | κr=${kr}° | Rε=${re}mm | ${mode} | 💧${coolA.name}<br>
<b>Vc=</b>${iscar!=='none'?`${iscarVcRec(mat,'turn',proc)}(ISCAR推奨)`:`${db.vcT[proc]}×${tl.vcF}(工具)`}×${coolA.vcF.toFixed(2)}(油種)×${apTF.toFixed(2)}(ap)=<b style="color:#ffd700">${Vc} m/min</b><br>
<b>f_phys:</b> ${p4(res.f)} | <b>f_cat(形状補正後):</b> ${p4(f_cat)}<br>
<b>確定f:</b> <b style="color:#ffd700">${p4(f_real)} mm/rev</b> → <b>F:</b> <b style="color:#ffd700">${F} mm/min</b>（S=${S}rpm）<br>
<b>当たり面 b:</b> ${b_eng.toFixed(2)} mm | <b>断面A:</b> ${area.toFixed(3)} mm²<br>
<b>Fc:</b> ${Fc.toFixed(0)} N | <b>Torq:</b> ${Torq.toFixed(1)} N·m (${(torqRatio*100).toFixed(0)}%)<br>
<b>Rz:</b> ${Rz.toFixed(2)} μm | <b>Ra≈:</b> ${Ra_theo} μm | <b>T:</b> ${TaylorT.toFixed(0)} min
</p>`;
}

function calcT() {
  const D=n('t_D'), L=n('t_L'), ap=n('t_ap'), pass=parseInt(s('t_pass'))||1;
  const mat=s('t_mat'), proc=s('t_proc'), tool=s('t_tool');
  const kr=parseFloat(s('t_kr'))||75, re=parseFloat(s('t_re'))||0.8;
  const mode=s('t_mode');
  const shape=s('t_shape')||'C';
  const Pm=n('t_motor'), eta=n('t_eta'), torqMax=n('t_torque_max')||200;
  const tl=TOOL[tool], db=MAT[mat]||MAT.steel;
  const cool=s('t_cool')||'wet', coolA=coolantAdjust(cool,mat,tool);
  const iscar=s('t_iscar')||'none';
  const shp=insertShapeAdjust(shape, ap, 0, kr);
  const apTF=ap>0?interp(ap,[[0.5,1.06],[1,1.02],[2,1.00],[3,0.95],[5,0.88],[8,0.80],[12,0.72]]):1.0;
  const Vc_base0=(iscar!=='none')?iscarVcRec(mat,'turn',proc):db.vcT[proc]*tl.vcF;
  const Vc=Math.round(Vc_base0*coolA.vcF*apTF);
  const res=fMaxTurning(ap,mat,tool,Vc,Pm,eta,kr);
  const f_base=(T_F_CAT[mat]||T_F_CAT.steel)[proc];
  const f_cat=f_base*coolA.fzF*shp.strF;          // 形状(刃先強度)で送りを補正
  const f=Math.min(res.f,f_cat);
  const S=Math.round(Vc*1000/(Math.PI*D));
  const F=Math.round(S*f);
  const b_eng=ap>0?ap/Math.sin(kr*Math.PI/180):0; // 当たり面(切れ刃係合長)
  const area=ap*f;                                // 切りくず断面積
  const Fc=turningFc(f,ap,mat,kr);
  const Pc=(Fc*Vc)/(60*1000);
  const P_av=Pm*eta, loadP=(Pc/P_av)*100;
  const toolStress=(Fc/res.Fc_max_tool)*100;
  const MRR=ap*f*Vc; // cm³/min (ap[mm]×f[mm/rev]×Vc[m/min] = cm³/min)
  const sec=L*pass/F*60;
  const Rz=theorRz(f,re);
  const Ra=(Rz/4).toFixed(3);
  const TaylorT=taylorLife(Vc,mat);
  const Torq=Fc*(D/2)/1000;
  const Kc=1+0.15*Math.cos(kr*Math.PI/180);

  document.getElementById('t_rg').innerHTML=`
    <div class="res-item res-hl"><div class="res-lbl">主軸回転数 S</div><div class="res-val">${S} rpm</div></div>
    <div class="res-item res-hl"><div class="res-lbl">🏆 送り速度 F</div><div class="res-val">${F} mm/min</div></div>
    <div class="res-item"><div class="res-lbl">切削速度 Vc</div><div class="res-val">${Vc} m/min</div></div>
    <div class="res-item"><div class="res-lbl">確定 f (送り/回転)</div><div class="res-val">${p4(f)} mm/rev</div></div>
    <div class="res-item"><div class="res-lbl">🔷 インサート形状</div><div class="res-val" style="font-size:13px">${shp.name}</div></div>
    <div class="res-item"><div class="res-lbl">ノーズ角 εr</div><div class="res-val">${shp.epsTxt}</div></div>
    <div class="res-item"><div class="res-lbl">当たり面 切れ刃係合長 b</div><div class="res-val">${b_eng.toFixed(2)} mm</div></div>
    <div class="res-item"><div class="res-lbl">切りくず断面積 A</div><div class="res-val">${area.toFixed(3)} mm²</div></div>
    <div class="res-item"><div class="res-lbl">実切削力 Fc</div><div class="res-val">${Fc.toFixed(0)} N</div></div>
    <div class="res-item"><div class="res-lbl">スピンドルトルク</div><div class="res-val">${Torq.toFixed(1)} N·m</div></div>
    <div class="res-item"><div class="res-lbl">実動力 Pc</div><div class="res-val">${Pc.toFixed(2)} kW</div></div>
    <div class="res-item"><div class="res-lbl">機械負荷率</div><div class="res-val">${loadP.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">工具応力比</div><div class="res-val">${toolStress.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">理論面粗さ Rz</div><div class="res-val">${Rz.toFixed(2)} μm</div></div>
    <div class="res-item"><div class="res-lbl">理論面粗さ Ra≈</div><div class="res-val">${Ra} μm</div></div>
    <div class="res-item"><div class="res-lbl">MRR</div><div class="res-val">${MRR.toFixed(2)} cm³/min</div></div>
    <div class="res-item"><div class="res-lbl">Taylor工具寿命 T</div><div class="res-val">${TaylorT.toFixed(0)} min</div></div>
    <div class="res-item res-hl"><div class="res-lbl">切削時間</div><div class="res-val">${fmtT(sec)}</div></div>`;

  const wc=document.getElementById('t_warns');wc.innerHTML='';
  wc.innerHTML+=`<div class="info-box ib-purple"><h3>🔷 インサート形状: ${shp.name}（当たり面＝刃先強度）</h3><p>${shp.sh.desc}<br>ノーズ角 εr=${shp.epsTxt}（大きいほど刃先が強く高送り可／小さいほど倣い向きで送り控えめ）。送り係数 ×${shp.strF.toFixed(2)}（基準C 80°）を適用。当たり面(切れ刃係合長) b=ap/sinκr=${b_eng.toFixed(2)}mm、切りくず断面 A=ap×f=${area.toFixed(3)}mm²。</p></div>`;
  wc.innerHTML+=`<div class="info-box ib-blue"><h3>💧 クーラント: ${coolA.name}</h3><p>${coolA.desc}<br>適用: Vc×${coolA.vcF.toFixed(2)} ／ 送り×${coolA.fzF.toFixed(2)}×形状${shp.strF.toFixed(2)} ／ 切込みap=${ap}mm→Vc×${apTF.toFixed(2)}(重切削ほど低速)。</p></div>`;
  if(coolA.warn) wc.innerHTML+=`<div class="info-box ib-yellow"><h3>⚠ 油種の注意</h3><p>${coolA.warn}</p></div>`;
  if(shape==='V'||shape==='D') wc.innerHTML+='<div class="info-box ib-yellow"><h3>💡 倣い系の弱い刃先</h3><p>'+shp.name+'は内角が小さく刃先が弱いため、送り・切込みは控えめに。荒加工は C(80°)/W(トライゴン)/S(四角) など内角の大きい形状が有利。</p></div>';
  if(toolStress>70) wc.innerHTML+='<div class="info-box ib-red"><h3>⚠ 工具応力高</h3><p>ap低減 or 突き出し短縮</p></div>';
  if(loadP>80) wc.innerHTML+='<div class="info-box ib-yellow"><h3>⚠ 高負荷</h3><p>ap低減推奨</p></div>';
  if(mode==='int') wc.innerHTML+='<div class="info-box ib-blue"><h3>💡 内径切削</h3><p>ボーリングバーの剛性低下(L/D>4で切削条件を50〜70%に下げることを推奨)。びびり対策として防振バー使用を検討。MCでの中ぐりは「🛠️ MC1本バイト」タブで L/D・たわみまで評価できます。</p></div>';
  if(mode==='thr') wc.innerHTML+='<div class="info-box ib-purple"><h3>💡 ねじ切り</h3><p>送りf=ピッチ×cos(ねじ山角)。多重パスで徐々に切込み。初回パスは0.2mm以下の切込みを推奨。</p></div>';

  document.getElementById('t_fml').textContent=
`【旋盤加工 学術物理計算ログ】

工具: ${tl.name} | 🔷形状 ${shp.name}(εr=${shp.epsTxt}) | κr=${kr}° | Rε=${re}mm | モード:${mode}
材料: ${db.name} | Ks1=${db.Ks1} N/mm² | mc=${db.mc}

▼ Step1: Vc = ${iscar!=='none'?`${iscarVcRec(mat,'turn',proc)}(ISCAR ${(ISCAR_GRADES[iscar]||{}).name||iscar})`:`${db.vcT[proc]}×${tl.vcF}(工具)`}×${coolA.vcF.toFixed(2)}(油種)×${apTF.toFixed(2)}(ap) = ${Vc} m/min${iscar!=='none'?'  ※ISCAR推奨は目安・ITA要確認':''}

▼ Step2: κr補正係数 Kc = 1+0.15×cos(${kr}°) = ${Kc.toFixed(4)}

▼ Step3: 工具シャンク強度 (20×20mm標準シャンク)
  Z_shank = 20×20²/6 = ${(20*400/6).toFixed(0)} mm³
  σ_eff = ${tl.sigma}×${tl.rho} = ${(tl.sigma*tl.rho).toFixed(0)} MPa
  M_allow = ${(tl.sigma*tl.rho*20*400/6).toFixed(0)} N·mm
  Fc_max_tool = M/(2.5×h) = ${res.Fc_max_tool.toFixed(0)} N

▼ Step4: 機械出力制約
  Fc_max_motor = Pm×η×1000×60/Vc = ${res.Fc_max_motor.toFixed(0)} N
  有効Fc_max = min = ${res.Fc_max.toFixed(0)} N

▼ Step5: f_max逆算 (Kienzle式+κr補正) ＋ インサート形状補正
  f_phys = (Fc_max/(Ks1×ap×Kc))^(1/(1-mc))
         = (${res.Fc_max.toFixed(0)}/(${db.Ks1}×${ap}×${Kc.toFixed(4)}))^(1/${(1-db.mc).toFixed(2)}) = ${p4(res.f)} mm/rev
  f_cat = ${p4(f_base)}(材料/区分)×油種${coolA.fzF.toFixed(2)}×形状${shp.strF.toFixed(2)}(${shape}:εr${shp.epsTxt}) = ${p4(f_cat)} mm/rev
  確定 f = min(f_phys, f_cat) = ${p4(f)} mm/rev

▼ Step6: 当たり面（切れ刃の係合・形状考慮）
  切れ刃係合長 b = ap/sin(κr) = ${ap}/sin(${kr}°) = ${b_eng.toFixed(2)} mm
  切りくず断面積 A = ap×f = ${ap}×${p4(f)} = ${area.toFixed(3)} mm²

▼ Step7: F送り換算
  S = 1000×Vc/(π×D) = 1000×${Vc}/(π×${D}) = ${S} rpm
  F = f×S = ${p4(f)}×${S} = ${F} mm/min

▼ Step8: 面粗さ (Brammertz式)
  Rz = f²/(8×rε) = ${p4(f)}²/(8×${re})×1000 = ${Rz.toFixed(2)} μm
  Ra ≈ Rz/4 = ${Ra} μm

▼ Step9: Taylor工具寿命
  T = (${db.C_T}/Vc)^${db.n_T} = ${TaylorT.toFixed(0)} min @ Vc=${Vc} m/min

▼ Step10: 検証
  Fc = ${db.Ks1}×${p4(f)}^${(1-db.mc).toFixed(2)}×${ap}×${Kc.toFixed(4)} = ${Fc.toFixed(0)} N
  Torq = Fc×(D/2)/1000 = ${Torq.toFixed(1)} N·m
  Pc = ${Pc.toFixed(2)} kW / 負荷${loadP.toFixed(0)}%
  MRR = ap×f×Vc = ${ap}×${p4(f)}×${Vc} = ${MRR.toFixed(2)} cm³/min`;
  document.getElementById('t_result_wrap').classList.remove('hidden');
  addCompare({type:'旋盤('+mode+'/'+shape+')',mat:db.name,D,Vc,S,fz:p4(f),F,Fc:Fc.toFixed(0),Pc:Pc.toFixed(2),load:loadP.toFixed(0),MRR:MRR.toFixed(2)+' cm³/min',T:TaylorT.toFixed(0)+'min',ok:loadP<=80&&toolStress<=80});
}
