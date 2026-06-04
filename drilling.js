'use strict';
/* ============================================================
   drilling.js — ドリル加工
   依存: core.js
   ============================================================ */


/* ドリル・旋盤カタログ */
const D_F_CAT = {
  al:{rough:0.30,finish:0.20},   steel:{rough:0.20,finish:0.15},
  sus304:{rough:0.12,finish:0.09}, cast:{rough:0.25,finish:0.18},
  ti:{rough:0.08,finish:0.06},   ni:{rough:0.04,finish:0.03},
};

/* ドリル実験式トルク (N·m) */
function drillTorque(D, f, mat) {
  const db = MAT[mat];
  return 0.0987*Math.pow(D,1.8)*Math.pow(f,0.8)*(db.Ks1/2100);
}

/* TSC補正係数 */
function tscFactor(tsc) {
  // 送り増加可能係数 / Vc増加係数 / L/D補正改善
  const t = {
    none:{fF:1.00, vcF:1.00, ldF:1.00, desc:'外部クーラント/ドライ。L/D>3でペック必要'},
    mql: {fF:1.05, vcF:1.05, ldF:1.10, desc:'MQL:微量潤滑。摩擦低減。ドライに近い効果'},
    low: {fF:1.10, vcF:1.10, ldF:1.20, desc:'TSC低圧(2〜5MPa):切りくず排出改善。L/D8程度まで連続穴可'},
    mid: {fF:1.15, vcF:1.15, ldF:1.35, desc:'TSC中圧(7〜10MPa):標準深穴。L/D12程度まで連続可能。工具寿命+30%'},
    high:{fF:1.25, vcF:1.20, ldF:1.60, desc:'TSC高圧(20〜40MPa):超深穴対応。L/D20+。工具寿命大幅延長。切りくず完全排出'},
  };
  return t[tsc]||t.none;
}

/* L/D深さ補正 */
function ldFactor(ld, tsc) {
  const tf = tscFactor(tsc);
  const base = interp(ld,[[0,1.00],[1,1.00],[2,0.93],[3,0.85],[4,0.75],[5,0.65],[6,0.55],[8,0.45],[10,0.36],[12,0.30],[15,0.24],[20,0.18],[99,0.14]]);
  return Math.min(base*tf.ldF, 1.0);
}

/* ================================================================
   ☆ ドリル refresh / calc
================================================================ */
document.getElementById('d_pilot').addEventListener('change', function() {
  document.getElementById('d_pilot_d_grp').style.display=this.value==='1'?'block':'none';
  refreshD();
});

function refreshD() {
  const D=n('d_D'), L=n('d_L');
  const mat=s('d_mat'), proc=s('d_proc'), tool=s('d_tool');
  const Pm=n('d_motor')||5.5, eta=n('d_eta')||0.80;
  const torqMax=n('d_torque_max')||50;
  const tsc=s('d_tsc'), tsc_p=n('d_tsc_p')||7;
  const dType=s('d_type');
  const pilotOn=s('d_pilot')==='1', d_pilot=pilotOn?n('d_pilot_d'):0;
  const tl=TOOL[tool];
  const db=MAT[mat]||MAT.steel;
  const tf=tscFactor(tsc);

  document.getElementById('d_tool_desc').innerHTML=
    `<b>${tl.name}</b>: ${tl.desc}<br>ドリル種別: ${dType} | TSC: ${tsc} (${tf.desc})`;

  const Vc_b=db.vcD[proc]*tl.vcF*tf.vcF;
  document.getElementById('d_Vc').value=Math.round(Vc_b);

  // TSC情報表示
  document.getElementById('d_tsc_info').innerHTML=
    `<b>TSC方式:</b> ${tsc} ${tsc!=='none'?`(${tsc_p} MPa)`:''}<br>
    <b>送り補正:</b> ×${tf.fF.toFixed(2)} | <b>Vc補正:</b> ×${tf.vcF.toFixed(2)} | <b>L/D限界補正:</b> ×${tf.ldF.toFixed(2)}<br>
    <b>効果:</b> ${tf.desc}<br>
    ${tsc!=='none'?`<b>TSC適用時の推奨最大L/D:</b> ${
      tsc==='low'?'8':tsc==='mid'?'12':tsc==='high'?'20+':tsc==='mql'?'5':'3'
    }D`:''}`;

  if(!D||D<=0){document.getElementById('d_f').value='';setBtn('d_btn',false);return;}

  const Vc=Math.round(Vc_b);
  const ld=L>0?L/D:1;
  const ldF=ldFactor(ld,tsc);

  // インデキサブルドリルはトルク比×0.85(外周チップが切削を担う)
  const torqFactor=dType==='indexable'?0.85:1.0;
  const pointFactor=dType==='sharp'?1.05:dType==='inco'?1.10:1.0;

  // 下穴補正: 実際に切削する幅=(D-d_pilot)/2
  const D_eff=pilotOn&&d_pilot>0&&d_pilot<D?D-d_pilot:D;
  const torqFactor2=pilotOn&&d_pilot>0&&d_pilot<D?Math.pow(D_eff/D,1.8):1.0;

  // 機械出力制約
  const S_rps=Vc*1000/(Math.PI*D*60);
  const T_max_m=Math.min((Pm*eta*1000)/(2*Math.PI*S_rps), torqMax);

  // ドリルねじり破断限界
  const dc=D*0.20;
  const Ip=Math.PI*(Math.pow(D,4)-Math.pow(dc,4))/32;
  const tau_a=tl.sigma*tl.rho/2;
  const T_max_drill=tau_a*Ip/(D/2)/1000;

  const T_max=Math.min(T_max_m, T_max_drill)*torqFactor*torqFactor2;

  // f_max
  const rhs_t=T_max/(0.0987*Math.pow(D,1.8)*(db.Ks1/2100)*pointFactor);
  const f_phys=rhs_t>0?Math.pow(rhs_t,1/0.8)*ldF*tf.fF:0;
  const f_cat=(D_F_CAT[mat]||D_F_CAT.steel)[proc]*ldF*tf.fF;
  const f_real=Math.min(f_phys,f_cat);

  document.getElementById('d_fmax').value=p4(f_phys);
  const T_act=drillTorque(D,f_real,mat)*pointFactor*torqFactor2;
  const Pc=T_act*2*Math.PI*S_rps/1000;
  const P_av=Pm*eta;
  const loadP=(Pc/P_av)*100;
  const T_str=T_act/T_max_drill;
  const feasible=f_real>=0.003&&T_str<=1.0&&loadP<=100;

  const items=[
    {l:'L/D比',v:ld.toFixed(1)},
    {l:'L/D補正',v:'×'+ldF.toFixed(3)},
    {l:'TSC送り補正',v:'×'+tf.fF.toFixed(2)},
    {l:'モータ限界T',v:T_max_m.toFixed(4)+' N·m'},
    {l:'ドリル破断T',v:T_max_drill.toFixed(4)+' N·m'},
    {l:'実トルク',v:T_act.toFixed(4)+' N·m'},
    {l:'実動力',v:Pc.toFixed(3)+' kW'},
    {l:'機械負荷',v:loadP.toFixed(0)+'%'},
    {l:'ねじり応力比',v:(T_str*100).toFixed(0)+'%'},
    {l:'下穴補正',v:pilotOn&&d_pilot>0?`D_eff=${D_eff.toFixed(1)}mm`:'なし'},
  ];
  let st,vt;
  if(!feasible){st='crit';vt='🚫 ドリル破断/出力超過';}
  else if(T_str>0.80||loadP>80){st='warn';vt=`⚠ 高負荷 負荷${loadP.toFixed(0)}% / ねじり${(T_str*100).toFixed(0)}%`;}
  else{st='ok';vt=`✅ 適正 負荷${loadP.toFixed(0)}% / ねじり${(T_str*100).toFixed(0)}%`;}
  setPhys('d',items,vt,st);
  drawBar('d_bar_load','d_pct_load',loadP);
  drawBar('d_bar_stress','d_pct_stress',T_str*100);
  setFeedField('d_f',f_real,!feasible?'ng':T_str>0.80||loadP>80?'warn':'ok');
  setBtn('d_btn',feasible);

  document.getElementById('d_rec_body').innerHTML=`
<p style="font-size:11px;line-height:1.9;color:var(--txt2)">
<b>${tl.name}</b> | ${dType} | TSC:${tsc} ×${tf.fF.toFixed(2)}<br>
<b>L/D:</b> ${ld.toFixed(1)} / <b>ldF:</b> ×${ldF.toFixed(3)}<br>
<b>f_phys:</b> ${p4(f_phys)} | <b>f_cat:</b> ${p4(f_cat)}<br>
<b>確定f:</b> <b style="color:#ffd700">${p4(f_real)} mm/rev</b><br>
<b>破断限界T:</b> ${T_max_drill.toFixed(4)} N·m / <b>実T:</b> ${T_act.toFixed(4)} N·m (${(T_str*100).toFixed(0)}%)
</p>`;
}

function calcD() {
  const D=n('d_D'), L=n('d_L'), holes=parseInt(s('d_holes'))||1;
  const mat=s('d_mat'), proc=s('d_proc'), tool=s('d_tool');
  const Pm=n('d_motor'), eta=n('d_eta'), torqMax=n('d_torque_max')||50;
  const tsc=s('d_tsc'), tsc_p=n('d_tsc_p')||7;
  const dType=s('d_type');
  const pilotOn=s('d_pilot')==='1', d_pilot=pilotOn?n('d_pilot_d'):0;
  const tl=TOOL[tool], db=MAT[mat]||MAT.steel, tf=tscFactor(tsc);
  const Vc=Math.round(db.vcD[proc]*tl.vcF*tf.vcF);
  const S=Math.round(Vc*1000/(Math.PI*D));
  const ld=L/D;
  const ldF_v=ldFactor(ld,tsc);
  const torqFactor=dType==='indexable'?0.85:1.0;
  const pointFactor=dType==='sharp'?1.05:dType==='inco'?1.10:1.0;
  const D_eff=pilotOn&&d_pilot>0&&d_pilot<D?D-d_pilot:D;
  const torqFactor2=pilotOn&&d_pilot>0&&d_pilot<D?Math.pow(D_eff/D,1.8):1.0;
  const S_rps=S/60;
  const T_max_m=Math.min((Pm*eta*1000)/(2*Math.PI*S_rps), torqMax);
  const dc=D*0.20;
  const Ip=Math.PI*(Math.pow(D,4)-Math.pow(dc,4))/32;
  const tau_a=tl.sigma*tl.rho/2;
  const T_max_drill=tau_a*Ip/(D/2)/1000;
  const T_max=Math.min(T_max_m,T_max_drill)*torqFactor*torqFactor2;
  const rhs_t=T_max/(0.0987*Math.pow(D,1.8)*(db.Ks1/2100)*pointFactor);
  const f_phys=rhs_t>0?Math.pow(rhs_t,1/0.8)*ldF_v*tf.fF:0;
  const f_cat=(D_F_CAT[mat]||D_F_CAT.steel)[proc]*ldF_v*tf.fF;
  const f=Math.min(f_phys,f_cat);
  const F=Math.round(S*f);
  const T_act=drillTorque(D,f,mat)*pointFactor*torqFactor2;
  const Pc=T_act*2*Math.PI*S_rps/1000;
  const P_av=Pm*eta, loadP=(Pc/P_av)*100;
  // 【整理 v4.1】推定スラスト力(送り分力) Ff [N] — 参考値(±30%程度のばらつき)。
  //   旧式 2*Ks1*f^(1-mc)*(D*mc/4) は次元的根拠が弱く実測の約1/4と過小だった。
  //   切りくず断面比例の標準的近似 Ff ≈ 0.5*Ks1*D*f^(1-mc) に変更（先端角補正込み）。
  //   例) 鋼 D10/f0.2: 旧≈830N → 新≈3200N（実測2000〜4000Nに整合）。可否判定には未使用の表示値。
  const Ff=0.5*db.Ks1*D*Math.pow(f,1-db.mc)*pointFactor;
  const sec1=L/F*60, secT=sec1*holes;
  const TaylorT=taylorLife(Vc,mat);

  // ペックサイクル必要性
  const needPeck=ld>3&&tsc==='none'||ld>6&&tsc==='low'||ld>10&&tsc==='mid';
  const peckDepth=D*3;

  document.getElementById('d_rg').innerHTML=`
    <div class="res-item res-hl"><div class="res-lbl">主軸回転数 S</div><div class="res-val">${S} rpm</div></div>
    <div class="res-item res-hl"><div class="res-lbl">🏆 送り速度 F</div><div class="res-val">${F} mm/min</div></div>
    <div class="res-item"><div class="res-lbl">切削速度 Vc</div><div class="res-val">${Vc} m/min</div></div>
    <div class="res-item"><div class="res-lbl">確定 f</div><div class="res-val">${p4(f)} mm/rev</div></div>
    <div class="res-item"><div class="res-lbl">実トルク T</div><div class="res-val">${T_act.toFixed(4)} N·m</div></div>
    <div class="res-item"><div class="res-lbl">推定スラスト力 Ff <span style="font-size:9px;color:var(--txt3)">(参考)</span></div><div class="res-val">${Ff.toFixed(0)} N</div></div>
    <div class="res-item"><div class="res-lbl">実動力 Pc</div><div class="res-val">${Pc.toFixed(3)} kW</div></div>
    <div class="res-item"><div class="res-lbl">機械負荷率</div><div class="res-val">${loadP.toFixed(0)} %</div></div>
    <div class="res-item"><div class="res-lbl">L/D比</div><div class="res-val">${ld.toFixed(1)}</div></div>
    <div class="res-item"><div class="res-lbl">TSC方式</div><div class="res-val">${tsc}</div></div>
    <div class="res-item"><div class="res-lbl">1穴時間</div><div class="res-val">${fmtT(sec1)}</div></div>
    <div class="res-item"><div class="res-lbl">Taylor工具寿命</div><div class="res-val">${TaylorT.toFixed(0)} min</div></div>
    <div class="res-item res-hl"><div class="res-lbl">総時間 (${holes}穴)</div><div class="res-val">${fmtT(secT)}</div></div>`;

  const wc=document.getElementById('d_warns');wc.innerHTML='';
  if(ld>5) wc.innerHTML+=`<div class="info-box ib-red"><h3>⚠ 深穴 L/D=${ld.toFixed(1)}</h3><p>${needPeck?`ペックサイクル推奨: 1回当たり${peckDepth.toFixed(0)}mm(3D)。`:'TSCにより連続加工可能。'}切りくず詰まりに注意。</p></div>`;
  if(needPeck&&tsc==='none') wc.innerHTML+=`<div class="info-box ib-yellow"><h3>💧 TSC推奨</h3><p>L/D=${ld.toFixed(1)}でTSCなし。加工効率と工具寿命の向上のためTSC導入を強く推奨します。</p></div>`;
  if(pilotOn&&d_pilot>0) wc.innerHTML+=`<div class="info-box ib-green"><h3>✅ 下穴効果</h3><p>下穴径${d_pilot}mmにより、実効切削幅${D_eff.toFixed(1)}mm。トルク約${((1-torqFactor2)*100).toFixed(0)}%低減。</p></div>`;
  if(dType==='indexable') wc.innerHTML+=`<div class="info-box ib-blue"><h3>💡 インデキサブルドリル</h3><p>チップ交換式。高送り・大径向き。外周チップと中心チップで役割分担。チップ摩耗管理が重要。</p></div>`;

  document.getElementById('d_fml').textContent=
`【ドリル加工 学術物理計算ログ】

ドリル種別: ${dType} | 材質: ${tl.name} | TSC: ${tsc}
被削材: ${db.name} | L/D: ${ld.toFixed(2)}

▼ Step1: Vc = ${db.vcD[proc]}×${tl.vcF}(tl)×${tf.vcF}(tsc) = ${Vc} m/min
          S = ${S} rpm

▼ Step2: ドリルねじり破断限界
  コア比 dc/D = 0.20 → dc = ${(D*0.20).toFixed(2)} mm
  Ip = π(D⁴-dc⁴)/32 = ${Ip.toFixed(1)} mm⁴
  τ_allow = σ×ρ/2 = ${tl.sigma}×${tl.rho}/2 = ${tau_a.toFixed(0)} MPa
  T_drill = τ×Ip/(D/2)/1000 = ${T_max_drill.toFixed(4)} N·m

▼ Step3: 機械トルク限界
  T_motor = min(Pm×η/(2π×S/60), T_max_spec) = ${T_max_m.toFixed(4)} N·m
  有効最大T = min × torqFactor(${torqFactor}) × pilotFactor(${torqFactor2.toFixed(3)}) = ${T_max.toFixed(4)} N·m

▼ Step4: L/D補正 × TSC補正
  L/D = ${ld.toFixed(2)} → ldBase = ${ldFactor(ld,'none').toFixed(3)} → ×tsc_ldF(${tf.ldF}) = ${ldF_v.toFixed(3)}
  TSC: ${tf.desc}

▼ Step5: f_max逆算 (JIS実験式 T=0.0987×D^1.8×f^0.8×Ks1/2100)
  f_phys = ${p4(f_phys)} mm/rev | f_cat = ${p4(f_cat)} mm/rev
  確定 f = ${p4(f)} mm/rev

▼ Step6: F = ${S}×${p4(f)} = ${F} mm/min

▼ Step7: 検証
  T_act = ${T_act.toFixed(4)} N·m | Ff = ${Ff.toFixed(0)} N
  Pc = ${Pc.toFixed(3)} kW / 負荷 ${loadP.toFixed(0)}%
  Taylor T = ${TaylorT.toFixed(0)} min`;
  document.getElementById('d_result_wrap').classList.remove('hidden');
  addCompare({type:'ドリル',mat:db.name,D,Vc,S,fz:p4(f),F,Fc:Ff.toFixed(0),Pc:Pc.toFixed(3),load:loadP.toFixed(0),MRR:(Math.PI*(D/2)*(D/2)*F/1000).toFixed(2)+' cm³/min',T:TaylorT.toFixed(0)+'min',ok:loadP<=80});
}
